# void build — control plane

This directory is the control plane for the downstream **void** build of Stash.
It lives on the long-lived `void-meta` branch and is never rebased.

## Files

- `features.yaml` — the single source of truth: the stable base tag, the fork
  repo/remotes, and every change layered on top (with upstream issue/PR links,
  `status`, and `depends_on` for branches stacked on other not-yet-merged ones).
- `assemble.py` — builds the release: checks out the stable base in a sibling
  worktree, cherry-picks every feature with a `branch`/`commits`, enforces the
  no-schema-change invariant, injects the fork update-check source, regenerates
  the top-level `README.md`, and tags `<base>-voidN`.

## Branches

- `void-meta` — this control plane (tooling only).
- `void/*` — one branch per still-open upstream PR, built on the stable tag
  (e.g. `void/rating`, `void/touch-gestures`). The manifest's `branch` points
  at these. Once a PR ships in a stable release, drop its feature from the
  manifest and delete its branch. `void/e2e-trial` is the separate Playwright
  e2e trial (not part of the build).
- `void-build` — the generated release branch (base tag + cherry-picks + build
  config). Regenerated on every cut; do not commit to it by hand. (Named
  `void-build`, not `void`, so it doesn't collide with the `void/*` namespace.)

## Cut a build

```bash
uv run void/assemble.py --worktree ../stash-void-build   # build + tag locally
uv run void/assemble.py --worktree ../stash-void-build --push   # also push branch + tag
uv run void/assemble.py --print-readme   # preview the generated README
```

After `--push`, publish the GitHub release to trigger the cross-platform CI:

```bash
gh release create v0.32.0-void1 --repo void-function865/stash --target void-build \
  --title 0.32.0-void1 --notes 'See README for included changes.'
```

## Refresh onto a new upstream stable release

1. `git fetch origin --tags`
2. For each feature, check whether its PR shipped in the tag
   (`git log <tag> --grep '#<PR>'`; squash merges change SHAs). In
   `features.yaml`: bump `stable_base`, drop shipped features, and drop
   `depends_on` entries that pointed at them.
3. For features still open, rebuild `void/<name>` as the tag plus the current
   upstream PR branch commits (cherry-pick), and **force-push to the fork**.
   `assemble.py` reads the `fork/void/*` remote refs, not local branches, so a
   local-only rebuild is silently ignored.
4. Run `assemble.py` from a `void-meta` worktree (the build worktree holds
   `void-build`, so it can't be the cwd) → `<new-base>-void1`.
5. Smoke test (see below), then `--push` and create the release.

Smoke test: the new stable may bump the DB schema, so never start it on the
live instance. Use a scratch copy of config + sqlite, build with Go 1.25
(`brew install go@1.25`) after building the UI, and run the e2e suite from
`void/e2e-trial` with `STASH_BASE=http://localhost:9999`.
