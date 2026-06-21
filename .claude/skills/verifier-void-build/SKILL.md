---
name: verifier-void-build
description: Verify changes to the void Stash build by driving the web UI in a real browser with Playwright — against a vite dev server for branch/uncommitted changes, or the shipped build on :9999. Brings up the dev env (the main setup cost) and captures screenshots + a replayable trace. Use for any GUI/lightbox/gallery behavior change in this build.
---

# Verifying the void build (web UI)

The surface is the browser. A real browser is required: some bugs here only
fire on **trusted** input events and real React commit/paint timing — jsdom or
synthetic `.click()` will give a false PASS. Drive with Playwright; capture a
trace so a reviewer can replay what you saw.

## Prereqs

- The void build **binary is running on :9999** (the GraphQL backend). Auth must
  be disabled on it — the dev UI is cross-origin and can't send the session
  cookie (you'd get a 401 alert otherwise).
- `pnpm` and `uv` on PATH. Playwright runs with no project dep:
  `uv run --with playwright python <scenario>.py`. One-time browser install:
  `uv run --with playwright playwright install chromium`.

## Pick a mode

- **Dev server (default, fast iteration)** — verify branch or uncommitted
  frontend changes. `./serve.sh` builds the assembled worktree's UI and serves
  it on **:3000** with HMR (toggle a line, save, re-run — ideal for A/B).
  Scenarios default to `STASH_BASE=http://localhost:3000`.
- **Shipped build** — confirm what the binary actually serves. Skip `serve.sh`
  and drive `:9999` directly: `STASH_BASE=http://localhost:9999 uv run ...`.
  (The binary won't carry a source fix until the build is re-assembled + rebuilt.)

## Bring up the dev server

```bash
.claude/skills/verifier-void-build/serve.sh    # → http://localhost:3000
```

This is the bulk of the setup and why this skill exists. It finds the worktree
on the `void-build` branch (via `git worktree list`, no hardcoded paths), then:
`pnpm install` (the worktree pins its own deps — vite 5; do **not** symlink the
develop tree's vite-7 node_modules, pre-bundling breaks) and `pnpm gqlgen`
(generated GraphQL is gitignored, built from this build's schema). Run it in the
background and wait for "ready".

**Re-running `assemble.py` invalidates the dev server.** It removes and recreates
the `void-build` worktree, which kills the vite process and wipes node_modules +
generated-graphql. After any (re-)assembly, re-run `serve.sh` and wait for ready
again before driving :3000.

## Drive it + capture evidence

`lib.py` gives a `session()` context (chromium + tracing) plus gallery helpers.
Smallest path that makes the changed code execute, then **push on it** (reopen,
double-open, wrong order). The slider path uses a hovered, real-offset click —
the path that exposes timing bugs a synthetic click hides.

```bash
# worked regression example (slider → close → slider → close → magnifier):
uv run --with playwright python .claude/skills/verifier-void-build/example_lightbox_reopen.py
# headed, to watch:
HEADED=1 uv run --with playwright python .../example_lightbox_reopen.py
```

Evidence lands in `$STASH_ARTIFACTS` (default `/tmp/void-verify`): `final.png`
and `trace.zip`. Replay the trace:

```bash
uv run --with playwright playwright show-trace /tmp/void-verify/trace.zip
```

Write new scenarios next to the example; import helpers from `lib.py`. Check the
`errors` list `session()` yields (console errors / page errors) — empty is good.

## Gotchas (learned the hard way)

- **Assert opens with `wait_for_lightbox()`, never `lightbox_open()`.** The bare
  count predicate races the React mount and the gallery lightbox's empty
  loading state — it gives false FAILs on opens/reopens. `wait_for_lightbox()`
  waits and settles.
- **Reopen needs the mouse to leave the card first.** The hover-scrubber only
  re-arms on a fresh trusted mousemove; a re-`hover()` while the cursor never
  left is a no-op, so the second open silently fails. The `open_via_*` helpers
  call `park_mouse()` first; do the same in custom sequences.
- **Read per-image state with the mouse parked.** Hovering the rating stars
  changes the *displayed* value, so `star_rating()` parks first. Compare filled
  stars / `.star-rating-number` only with the cursor off the footer.
- **The two entry points open different images.** `open_via_scrubber(fraction)`
  opens a mid-gallery image; `open_via_magnifier` opens index 0. Don't compare
  per-image state across them unless you account for the offset.
- **Scrubber clicks need a hover first.** `open_via_scrubber` hovers then clicks
  at a pixel offset; a bare click can miss and instead navigate to the gallery.
- **Real vs synthetic events differ.** The magnifier is a synthetic `.click()`;
  the slider is a trusted mouse click. If only one entry point misbehaves,
  suspect event/scheduling timing — drive the real one.
- **Cross-origin auth.** 401 on every request → disable auth on the :9999 server.
- **Don't borrow node_modules** across worktrees; vite major versions differ.
- **Partial node_modules silently breaks gqlgen.** An interrupted `pnpm install`
  (or a freshly re-assembled worktree) leaves node_modules present but without
  the `gql-gen` bin; `serve.sh` now gates install on `node_modules/.bin/gql-gen`
  rather than the dir. If you see `gql-gen: command not found`, just re-run
  `pnpm install`.

A worked rating-sync regression (the bug this skill last verified) lived in
`scenario_rating_update.py` / `scenario_combined.py`; rebuild from `lib.py`'s
`star_rating()` / `set_star_rating()` helpers if you need it again.
