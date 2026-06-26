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

## The backend must match the UI's GraphQL schema

The dev UI (`:3000`) talks cross-origin to a backend on `:9999`, and it sends the
queries for **its** schema. If that backend is older than the UI's tree, every
query is rejected: the page shows an `Error loading configuration` /
`Response not successful: Received status code 400` alert and nothing renders
(galleries never load, so e2e specs time out waiting for `.image-card img`).

The shipped void binary is pinned to a **stable base** and lags `develop` by many
commits, so it is the wrong backend for a feature branch cut off current `develop`
(e.g. a PR branch). Two ways to get a matching backend:

- **Build one from the same tree** (what a develop-HEAD PR branch needs):

  ```bash
  make generate-backend        # REQUIRED FIRST — see below
  go build -o /tmp/stash-dev ./cmd/stash
  # stop whatever holds :9999, then (from the stash library dir with config.yml):
  /tmp/stash-dev -c config.yml                                  # serves :9999
  ```

  Confirm it matches before driving the UI — introspect a field the branch adds,
  e.g. `curl -s :9999/graphql -d '{"query":"{ __type(name:\"Studio\"){ fields { name } } }"}'`,
  and a `{ configuration { ui } }` query should return `200`, not `400`. (In dev
  the UI defaults its backend to port 9999 — `createClient.ts` — so vite on :3000
  needs no extra wiring.)

- **Verify against the shipped build instead**, accepting it tests the *binary's*
  (older) UI, not your branch: `STASH_BASE=http://localhost:9999`.

**gqlgen: `make generate-backend` is mandatory before `go build`.** The backend's
generated gqlgen code — `internal/api/generated_exec.go` and `generated_models.go`
— is **gitignored** (mirror of the frontend's gitignored `generated-graphql.ts`).
A plain `go build ./cmd/stash` happily links a **stale** `generated_exec.go` from a
previous run, so new schema fields exist in the `.graphql` files and resolvers but
are *not wired into introspection* → the UI's queries still 400. Run
`make generate-backend` (it runs `go generate ./cmd/stash` → gqlgen) first, every
time the schema may have moved. The DB is migrated in place on first run; a library
already at the latest migration (tracked in `schema_migrations`) fires no migration.

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
- **`400` on every request → schema drift.** `Error loading configuration` and a
  blank UI mean the `:9999` backend is older than the UI's tree. Build a matching
  backend (`make generate-backend` then `go build`) — see "The backend must match
  the UI's GraphQL schema" above. A `401` is auth; a `400` is schema.
- **Don't borrow node_modules** across worktrees; vite major versions differ.
- **Partial node_modules silently breaks gqlgen.** An interrupted `pnpm install`
  (or a freshly re-assembled worktree) leaves node_modules present but without
  the `gql-gen` bin; `serve.sh` now gates install on `node_modules/.bin/gql-gen`
  rather than the dir. If you see `gql-gen: command not found`, just re-run
  `pnpm install`.

A worked rating-sync regression (the bug this skill last verified) lived in
`scenario_rating_update.py` / `scenario_combined.py`; rebuild from `lib.py`'s
`star_rating()` / `set_star_rating()` helpers if you need it again.

## TS trial (`e2e/`)

A TypeScript `@playwright/test` port of this harness is being trialed in the repo's
top-level `e2e/` workspace (on the `void/e2e-trial` branch) — the candidate
UI-testing framework to eventually propose to upstream stashapp/stash (which is
TS-first and has no Python). The Python scripts here remain the working baseline;
the TS suite is the thing under evaluation. Use whichever you prefer while the
trial runs; prefer the TS suite when the point is to exercise/assess that workflow.

Same model, different surface:

- Bring-up is **shared** — the TS suite drives the same `serve.sh` dev server
  (:3000) or the shipped build (`STASH_BASE=http://localhost:9999`), same auth-off
  backend, same feature-branch flow.
- `lib.py` → `e2e/lib.ts` (a `test` fixture collecting the `errors` list + the same
  gallery helpers, selectors, and timing comments). `scenario_*.py` → `*.spec.ts`.
- Runs a **desktop (chromium + firefox + webkit) + touch (ipad/iphone/pixel)**
  matrix (this Python harness is Chromium-only). Desktop chromium is the must-pass
  baseline; firefox/webkit may need per-engine timing tuning. Touch projects have no
  hover, so they run only the `*.mobile.spec.ts` (tap-based) specs.
- Evidence: HTML report + retained-on-failure trace (`cd e2e && pnpm report`),
  vs. this skill's `final.png` / `trace.zip`.

```bash
cd e2e && pnpm install && pnpm exec playwright install chromium firefox webkit
pnpm test                                  # vite dev server (:3000)
STASH_BASE=http://localhost:9999 pnpm test # shipped build
pnpm test --project=chromium               # one engine while iterating
```

See `e2e/README.md` for the full workflow. All the "Gotchas" above apply unchanged.
