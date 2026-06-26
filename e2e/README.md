# e2e — Stash web-UI end-to-end tests

End-to-end tests for the Stash web UI, using [`@playwright/test`](https://playwright.dev).
Self-contained: its own `package.json`, does not touch `ui/v2.5`. Drives a real browser
(across desktop, tablet and phone) against a running Stash UI and asserts behaviour the
unit/type checks can't — lightbox interactions, gallery navigation, touch gestures.

## Prereqs

- A **Stash backend running on :9999** (the GraphQL API).
- The **UI served on :3000** — from `ui/v2.5`, run `pnpm start` (the vite dev server,
  with HMR). It is cross-origin to the backend, so the backend must be reachable from
  the browser. Alternatively point the tests straight at a running instance (see below).
- Install deps and browsers (one-time):

  ```bash
  pnpm install
  pnpm exec playwright install chromium firefox webkit
  ```

## Test data (TODO before upstreaming)

The specs currently assume a specific library: gallery `17` with exactly 77 images
(two pages), gallery `1` with 10 images. There is **no fixture/seed setup yet** — they
run against whatever instance you point them at.

Before this can be a PR, it needs a reproducible test database: a committed seed (sample
media + a script that imports it into a throwaway stash instance), with the specs reading
gallery IDs / expected counts from that fixture rather than hardcoded values. Until then,
treat the hardcoded IDs as placeholders.

## Run

```bash
pnpm test                              # all projects against http://localhost:3000
pnpm test --project=chromium           # one project while iterating
pnpm test:headed                       # watch it
pnpm test:ui                           # interactive runner / time-travel

# drive a running instance instead of the dev server:
STASH_BASE=http://localhost:9999 pnpm test
```

`pnpm report` opens the HTML report (traces are retained on failure — open one to replay
exactly what the test saw). `pnpm check` runs `tsc`.

## Device matrix

| Project | Engine | Kind | Runs |
|---|---|---|---|
| `chromium` / `firefox` / `webkit` | Chrome / FF / Safari | desktop (mouse+hover) | everything except `*.mobile.spec.ts` |
| `ipad` | WebKit | tablet (touch) | `*.mobile.spec.ts` |
| `iphone` | WebKit | phone (touch) | `*.mobile.spec.ts` |
| `pixel` | Chromium | phone (touch) | `*.mobile.spec.ts` |

Viewport is governed by the device descriptors (desktop = 1280×720, the Playwright
default, comfortably above Stash's `xl=1200` breakpoint; mobile = real device metrics).

**Touch vs hover:** touch devices have `hasTouch` and **no hover**, so the hover-scrubber
desktop specs can't run there. The split is by filename — desktop projects `testIgnore`
`*.mobile.spec.ts`, touch projects `testMatch` only those. Add touch coverage as new
`*.mobile.spec.ts` files using the touch helpers (`tapScrubber`, `openGalleryByTap`).

Mobile projects are *emulation* — viewport + user-agent + touch flags inside a desktop
engine, not real iOS/Android hardware (that needs a device cloud). Firefox has no mobile
emulation, so phones run on WebKit + Chromium only.

## Layout

- `lib.ts` — the `test` fixture (collects console/page `errors`) plus the gallery page
  helpers (selectors, timings, and the *why* comments).
- `global-counter.spec.ts` — global lightbox image counter `N/77`, page boundary
  `40/77 → 41/77`, and `N/10`.
- `lightbox-reopen.spec.ts` — slider → close → slider → close → magnifier reopen
  regression.
- `lightbox.mobile.spec.ts` — touch smoke test (tap-to-open + tap-scrub); runs on the
  ipad/iphone/pixel projects only.
- `playwright.config.ts` — baseURL from `STASH_BASE`, trace/screenshot on failure, the
  device matrix. `webServer` is intentionally not auto-spawned (see the note in the file).

## Gotchas

These UI behaviours need real, trusted input — jsdom or a synthetic `.click()` gives a
false PASS — which is why these run in a real browser. The helpers already encode the
sharp edges:

- **Assert opens with `waitForLightbox()`, not `lightboxOpen()`.** The bare count predicate
  races the React mount and the gallery lightbox's empty loading state (false failures).
- **`parkMouse()` before reopening** — the hover-scrubber only re-arms on a *fresh* trusted
  mousemove; a re-`hover()` while the cursor never left is a no-op. The `openVia*` helpers
  do this for you.
- **Read rating stars with the mouse parked** — hovering the stars changes the displayed
  value, so `starRating()` parks first.
- **The two entry points open different images** — `openViaScrubber(fraction)` opens a
  mid-gallery image, `openViaMagnifier` opens index 0.
- **Scrubber clicks need a hover first** — a bare click can miss and navigate to the
  gallery instead.
- **Don't wait on `networkidle`** — gallery pages stream covers (and regenerate them on a
  cold cache) and never go idle; it blows the per-test timeout. Use `domcontentloaded` +
  an explicit element wait, with a short *bounded* `networkidle` only to settle a grid.
- **Opening the lightbox from a gallery image is racy** — the image-card image is inside
  an `<a href="/images/:id">`; the card's onClick opens the lightbox and preventDefaults,
  but a click before hydration / mid-reflow falls through to the anchor and navigates
  away. `openGalleryAt()` retries the open with `toPass`. On touch the anchor always wins,
  so use the card scrubber (`tapScrubber`) to reach the lightbox.
- **Each ArrowRight in the lightbox loads a full-size image (~1s on chromium).** Don't step
  dozens of times — open directly at the target index (e.g. the 40th grid card to land on
  `40/77`) and cross the boundary with a single press.
