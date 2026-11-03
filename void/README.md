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
- `feat/*` — one branch per change; the open/queued upstream PRs. Branches for
  fork-only enabling changes (e.g. `feat/fork-official-build`,
  `feat/configurable-update-source`) are based on the stable tag so they apply
  cleanly; rebase them onto `develop` when submitting upstream.
- `void-build` — the generated release branch (base tag + cherry-picks + build
  config). Regenerated on every cut; do not commit to it by hand. (Named
  `void-build`, not `void`, so it doesn't collide with the `void/*` namespace.)

## Cut a build

```bash
uv run void/assemble.py            # build + tag locally (../stash-void-build)
uv run void/assemble.py --push     # also push branch + tag to the fork
uv run void/assemble.py --print-readme   # preview the generated README
```

After `--push`, publish the GitHub release to trigger the cross-platform CI:

```bash
gh release create v0.31.1-void1 --repo void-function865/stash --target void-build \
  --title 0.31.1-void1 --notes 'See README for included changes.'
```

## Refresh onto a new upstream stable release

1. `git fetch origin --tags`
2. Rebase each still-active `feat/*` branch onto the new stable tag (or develop).
3. In `features.yaml`: bump `stable_base`, drop anything that has shipped, and
   update statuses / merge SHAs.
4. `uv run void/assemble.py --push` → `<new-base>-void1`.
