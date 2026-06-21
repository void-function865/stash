#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml"]
# ///
"""Assemble the downstream "void" build of Stash.

Reads void/features.yaml, checks out the stable base in a dedicated git
worktree, cherry-picks every feature that has a `branch` or `commits`, applies
the fork-specific build config (UPDATE_REPO), regenerates the README, and tags
the result `<stable_base>-voidN`.

The build happens in a sibling worktree (default: ../stash-void-build) so the
control-plane checkout this script runs from is never disturbed.

Usage:
    uv run void/assemble.py                 # build + tag locally
    uv run void/assemble.py --push          # also push branch + tag to the fork
    uv run void/assemble.py --print-readme  # print generated README, do nothing else
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

VOID_DIR = Path(__file__).resolve().parent
MANIFEST = VOID_DIR / "features.yaml"

# Release branch name. Must not collide with the void/* feature branch namespace.
BUILD_BRANCH = "void-build"


def run(args: list[str], cwd: Path | None = None, capture: bool = False) -> str:
    result = subprocess.run(
        args, cwd=cwd, check=True, text=True,
        stdout=subprocess.PIPE if capture else None,
    )
    return (result.stdout or "").strip()


def try_run(args: list[str], cwd: Path | None = None) -> bool:
    return subprocess.run(args, cwd=cwd).returncode == 0


def load_manifest() -> dict:
    with MANIFEST.open() as f:
        return yaml.safe_load(f)


def buildable(feat: dict) -> bool:
    return bool(feat.get("branch") or feat.get("commits"))


def order_features(features: list[dict]) -> list[dict]:
    """Topologically order buildable features so each appears after the features
    it `depends_on` (which may be stacked branches), preserving manifest order
    otherwise."""
    by_name = {f["name"]: f for f in features}
    buildables = [f for f in features if buildable(f)]
    ordered: list[dict] = []
    seen: set[str] = set()
    visiting: set[str] = set()

    def visit(f: dict) -> None:
        name = f["name"]
        if name in seen:
            return
        if name in visiting:
            raise SystemExit(f"ERROR: dependency cycle involving '{name}'")
        visiting.add(name)
        for dep_name in f.get("depends_on") or []:
            dep = by_name.get(dep_name)
            if dep is None:
                raise SystemExit(f"ERROR: '{name}' depends_on unknown feature '{dep_name}'")
            if not buildable(dep):
                raise SystemExit(
                    f"ERROR: '{name}' depends_on '{dep_name}', which has no branch/commits to build"
                )
            visit(dep)
        visiting.discard(name)
        seen.add(name)
        ordered.append(f)

    for f in buildables:
        visit(f)
    return ordered


def exclude_refs(feat: dict, by_name: dict[str, dict], fork_remote: str) -> list[str]:
    """`^ref` exclusions for a feature's dependencies, so commits already
    contributed by a dependency (a branch this one is stacked on) are not
    re-applied."""
    refs: list[str] = []
    for dep_name in feat.get("depends_on") or []:
        dep = by_name[dep_name]
        if dep.get("commits"):
            refs += [f"^{c}" for c in dep["commits"]]
        else:
            refs.append(f"^{fork_remote}/{dep['branch']}")
    return refs


def next_void_number(repo: Path, base: str, fork_remote: str) -> int:
    # Count published releases (tags on the fork), so local re-assembly before
    # publishing doesn't inflate the number.
    out = run(["git", "ls-remote", "--tags", fork_remote, f"{base}-void*"],
              cwd=repo, capture=True)
    nums = [
        int(m.group(1))
        for line in out.splitlines()
        if (m := re.search(rf"refs/tags/{re.escape(base)}-void(\d+)$", line))
    ]
    return max(nums, default=0) + 1


# --------------------------------------------------------------------------- #
# README generation
# --------------------------------------------------------------------------- #

GROUPS = [
    ("merged", "Merged upstream, awaiting release",
     "Already merged into upstream `develop`; included here until they ship in a stable release."),
    ("open-pr", "Open pull requests",
     "Submitted upstream and under review."),
    ("pending", "Pending submission",
     "Not yet submitted upstream. New pull requests are queued behind upstream's "
     "[3-open-PR-per-contributor limit]"
     "(https://github.com/{upstream_repo}/blob/develop/docs/CONTRIBUTING.md#pull-requests)."),
]


def link(repo: str, kind: str, num) -> str:
    if not num:
        return "—"
    return f"[#{num}](https://github.com/{repo}/{kind}/{num})"


def gen_readme(m: dict) -> str:
    base = m["stable_base"]
    upstream = m["upstream_repo"]
    fork = m["fork_repo"]
    version = base.lstrip("v")

    out: list[str] = []
    out.append(f"# Stash ({fork.split('/')[0]} build)\n")
    out.append(
        f"This is an **unofficial downstream build** of "
        f"[Stash](https://github.com/{upstream}). It tracks the stable release "
        f"**[{base}](https://github.com/{upstream}/releases/tag/{base})** and adds the "
        f"changes listed below, each linked to its upstream issue and pull request.\n"
    )
    out.append(
        f"> **Database-compatible with upstream {base}.** These builds do not change the "
        f"database schema, so you can switch between this build and the official {base} "
        f"build on the same database without migrating.\n"
    )
    out.append(
        "Releases are versioned `" + version + "-void1`, `" + version + "-void2`, … "
        "and built from the upstream stable tag plus the patches below.\n"
    )

    for status, heading, blurb in GROUPS:
        feats = [f for f in m["features"] if f.get("status") == status]
        if not feats:
            continue
        out.append(f"## {heading}\n")
        out.append(blurb.format(upstream_repo=upstream) + "\n")
        out.append("| Change | Issue | PR | Notes |")
        out.append("| --- | --- | --- | --- |")
        for f in feats:
            note = f.get("summary", "")
            if not buildable(f):
                note += " _(planned — not yet in this build)_"
            out.append(
                f"| {f['name']} | {link(upstream, 'issues', f.get('issue'))} "
                f"| {link(upstream, 'pull', f.get('pr'))} | {note} |"
            )
        out.append("")

    out.append("## Installation, usage and documentation\n")
    out.append(
        f"This fork only adds the changes above. For installation, first-run setup, usage, "
        f"and all other documentation, see the [upstream Stash repository]"
        f"(https://github.com/{upstream}) and the [official documentation](https://docs.stashapp.cc).\n"
    )
    out.append("## How this build is maintained\n")
    out.append(
        "The build is assembled by [`void/assemble.py`](void/assemble.py) from "
        "[`void/features.yaml`](void/features.yaml) on top of the upstream stable tag. "
        "This README is generated — edit the manifest, not this file.\n"
    )
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# Build config injection
# --------------------------------------------------------------------------- #

def inject_update_repo(wt: Path, fork_repo: str) -> None:
    """Define UPDATE_REPO in the Makefile so the (cherry-picked) update-source
    feature points the update check at the fork. Idempotent."""
    makefile = wt / "Makefile"
    text = makefile.read_text()
    if "UPDATE_REPO :=" in text:
        return
    anchor = "LDFLAGS := $(LDFLAGS)\n"
    if anchor not in text:
        raise SystemExit("ERROR: could not find LDFLAGS anchor in Makefile to inject UPDATE_REPO")
    insert = (
        anchor
        + "\n# void build: point the update check at the fork's releases\n"
        + f"UPDATE_REPO := {fork_repo}\n"
    )
    makefile.write_text(text.replace(anchor, insert, 1))


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--push", action="store_true", help="push the void branch and tag to the fork")
    ap.add_argument("--print-readme", action="store_true", help="print generated README and exit")
    ap.add_argument("--worktree", default=None, help="path to the build worktree")
    args = ap.parse_args()

    m = load_manifest()

    if args.print_readme:
        print(gen_readme(m))
        return 0

    base = m["stable_base"]
    fork_repo = m["fork_repo"]
    up_remote = m["upstream_remote"]
    fork_remote = m["fork_remote"]

    repo = Path(run(["git", "rev-parse", "--show-toplevel"], cwd=VOID_DIR, capture=True))
    wt = Path(args.worktree) if args.worktree else repo.parent / "stash-void-build"

    print(f"==> upstream={up_remote} fork={fork_remote} base={base}")
    # --force so the moving latest_develop tag doesn't abort the fetch
    run(["git", "fetch", up_remote, "--tags", "--force", "--quiet"], cwd=repo)
    run(["git", "fetch", fork_remote, "--quiet"], cwd=repo)

    n = next_void_number(repo, base, fork_remote)
    tag = f"{base}-void{n}"
    print(f"==> building {tag} in worktree {wt}")

    # Fresh worktree at the stable base, on branch `void`.
    if wt.exists():
        try_run(["git", "worktree", "remove", "--force", str(wt)], cwd=repo)
        if wt.exists():
            shutil.rmtree(wt)
    try_run(["git", "worktree", "prune"], cwd=repo)
    run(["git", "worktree", "add", "--force", "-B", BUILD_BRANCH, str(wt), base], cwd=repo)

    # Cherry-pick every buildable feature, dependencies first. For branch-based
    # features we take the commits unique to the branch (excluding upstream
    # develop and any dependency branches it is stacked on), so stacked branches
    # don't re-apply their base.
    by_name = {f["name"]: f for f in m["features"]}
    for f in order_features(m["features"]):
        name = f["name"]
        if f.get("commits"):
            commits = list(f["commits"])
        else:
            branch_ref = f"{fork_remote}/{f['branch']}"
            excludes = [f"^{up_remote}/develop", *exclude_refs(f, by_name, fork_remote)]
            commits = run(
                ["git", "rev-list", "--reverse", branch_ref, *excludes],
                cwd=repo, capture=True,
            ).split()
        if not commits:
            print(f"    skip [{name}]: no commits to apply")
            continue
        print(f"    cherry-pick [{name}]: {len(commits)} commit(s)")
        if not try_run(["git", "cherry-pick", *commits], cwd=wt):
            try_run(["git", "cherry-pick", "--abort"], cwd=wt)
            print(
                f"\nERROR: cherry-pick failed for '{name}'.\n"
                f"Resolve it manually in {wt} "
                f"(git cherry-pick {' '.join(commits)}), then re-run, or fix the branch.",
                file=sys.stderr,
            )
            return 1

    # Swap-compatibility invariant: the build must not change the DB schema.
    changed = run(["git", "diff", "--name-only", f"{base}..HEAD"], cwd=wt, capture=True)
    offenders = [
        ln for ln in changed.splitlines()
        if "pkg/sqlite/migrations/" in ln or ln == "pkg/sqlite/database.go"
    ]
    if offenders:
        # database.go appears for many reasons; only fail if appSchemaVersion changed.
        bad = "pkg/sqlite/migrations/" in changed
        if "pkg/sqlite/database.go" in offenders:
            diff = run(["git", "diff", f"{base}..HEAD", "--", "pkg/sqlite/database.go"], cwd=wt, capture=True)
            if "appSchemaVersion" in diff:
                bad = True
        if bad:
            print(
                f"\nERROR: this build changes the database schema (offenders: {offenders}).\n"
                f"That breaks swap-compatibility with the official {base} build. Aborting.",
                file=sys.stderr,
            )
            return 1

    # Fork-specific build config + generated README + the tooling itself.
    inject_update_repo(wt, fork_repo)
    shutil.copytree(VOID_DIR, wt / "void", dirs_exist_ok=True)
    (wt / "README.md").write_text(gen_readme(m))

    run(["git", "add", "-A"], cwd=wt)
    run(["git", "commit", "-q", "-m",
         f"void build config for {tag}\n\nGenerated README, update-check source, and build tooling."], cwd=wt)
    run(["git", "tag", "-f", tag], cwd=wt)
    print(f"==> tagged {tag}")

    if args.push:
        run(["git", "push", "-f", fork_remote, BUILD_BRANCH], cwd=wt)
        run(["git", "push", "-f", fork_remote, tag], cwd=wt)
        print(f"==> pushed {BUILD_BRANCH} + {tag} to {fork_remote}")
        print(f"\nNext: publish the release to trigger CI:\n"
              f"  gh release create {tag} --repo {fork_repo} --target {BUILD_BRANCH} "
              f"--title {tag.lstrip('v')!r} --notes 'See README for included changes.'")
    else:
        print("\nBuilt locally. To publish:\n"
              "  uv run void/assemble.py --push    # push branch + tag, then create the release")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
