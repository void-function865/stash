# Stash (void-function865 build)

This is an **unofficial downstream build** of [Stash](https://github.com/stashapp/stash). It tracks the stable release **[v0.31.1](https://github.com/stashapp/stash/releases/tag/v0.31.1)** and adds the changes listed below, each linked to its upstream issue and pull request.

> **Database-compatible with upstream v0.31.1.** These builds do not change the database schema, so you can switch between this build and the official v0.31.1 build on the same database without migrating.

Releases are versioned `0.31.1-void1`, `0.31.1-void2`, … and built from the upstream stable tag plus the patches below.

## Merged upstream, awaiting release

Already merged into upstream `develop`; included here until they ship in a stable release.

| Change | Issue | PR | Notes |
| --- | --- | --- | --- |
| Don't mark forks as Official Build | [#7065](https://github.com/stashapp/stash/issues/7065) | [#7075](https://github.com/stashapp/stash/pull/7075) | CI only sets the official-build flag for the upstream repository, so fork builds correctly report "Unofficial Build". |
| Configurable update-check source | [#7066](https://github.com/stashapp/stash/issues/7066) | [#7076](https://github.com/stashapp/stash/pull/7076) | Lets a build point the update check at its own releases via a build-time UPDATE_REPO override (defaults to upstream). |
| Image checksum cache-buster | — | [#6998](https://github.com/stashapp/stash/pull/6998) | Use the file checksum for image URL cache-busting so ratings/edits refresh reliably in the lightbox. |
| Lightbox image aspect ratios on Safari | [#5087](https://github.com/stashapp/stash/issues/5087) | [#6961](https://github.com/stashapp/stash/pull/6961) | Fix warped image aspect ratios in the lightbox on Safari. |
| Open gallery slideshow from the galleries page | [#1579](https://github.com/stashapp/stash/issues/1579) | [#7035](https://github.com/stashapp/stash/pull/7035) | A magnifying-glass control on gallery cards opens the slideshow directly. |
| Delete image shortcut and button in the lightbox | [#4512](https://github.com/stashapp/stash/issues/4512) | [#7022](https://github.com/stashapp/stash/pull/7022) | Adds a "d d" shortcut and a trash button to delete the current image from the lightbox. |
| Safari auto-start on transcode-required scenes | [#6646](https://github.com/stashapp/stash/issues/6646) | [#7016](https://github.com/stashapp/stash/pull/7016) | Fix scene auto-start in Safari when the scene requires server-side transcoding. |
| Global image counter in the lightbox | [#4315](https://github.com/stashapp/stash/issues/4315) | [#7084](https://github.com/stashapp/stash/pull/7084) | Show a global image position counter in the lightbox. |
| Fix lightbox landing on the wrong image at a page boundary | [#7082](https://github.com/stashapp/stash/issues/7082) | [#7083](https://github.com/stashapp/stash/pull/7083) | Back the lightbox page-switch guard with a synchronous ref - gating the nav handlers and the index-range clamp - so crossing a gallery page boundary can't land a stale index on the new page's last image. The settle that resolves the landing fires on the page NUMBER changing (a reliable signal that the new page is present, unlike the images array identity, which goes stale across a reopen and leaked a -1 sentinel as a blank image / "40 of 77"). The landing stays handler-controlled via an explicit target (first / last / chapter index), never derived from the page-number direction, so first/last wraparound and chapter navigation don't regress. |
| Consolidate scene cover buttons | [#1278](https://github.com/stashapp/stash/issues/1278) | [#6924](https://github.com/stashapp/stash/pull/6924) | Group the scene cover actions into the one "Set image" menu - from file / URL / clipboard, generate a screenshot from the current playback position or the default one, and clear the image - instead of scattering them between the edit panel and the scene dropdown. sceneGenerateScreenshot now returns the real job ID (schema type String! -> ID!) rather than a "todo" placeholder, so the cover preview refreshes asynchronously when the generate job finishes. |

## Open pull requests

Submitted upstream and under review.

| Change | Issue | PR | Notes |
| --- | --- | --- | --- |
| Rating keyboard shortcuts for lightbox images | [#5616](https://github.com/stashapp/stash/issues/5616) | [#7088](https://github.com/stashapp/stash/pull/7088) | Press "r" then a digit to rate the current image in the lightbox (stars and decimal), reusing the detail-page rating hook via a lightbox-scoped Mousetrap instance. |
| Touch gestures in the lightbox | [#2538](https://github.com/stashapp/stash/issues/2538) | [#7097](https://github.com/stashapp/stash/pull/7097) | Add mobile touch gestures to the lightbox - swipe left/right to change image, swipe up to delete (via the existing confirmation dialog), swipe down to close, and double-tap to zoom toward the tapped point (fit <-> 1:1 native) - alongside focal-anchored pinch-to-zoom. A single-finger axis-locked state machine decides pan vs swipe from the image-vs-box geometry (a zoomed-in drag pans and clamps to the image edges; mouse drag clamps too). Max zoom is capped per-image and per-device to avoid exhausting GPU memory on phones, large images show a busy spinner on their first (expensive) zoom, and a ResizeObserver keeps the fit/centering correct on window resize and device rotation (preserving the focal point when zoomed). The swipe-up delete reuses the delete plumbing; the delete confirmation is never bypassed. |

## Installation, usage and documentation

This fork only adds the changes above. For installation, first-run setup, usage, and all other documentation, see the [upstream Stash repository](https://github.com/stashapp/stash) and the [official documentation](https://docs.stashapp.cc).

## How this build is maintained

The build is assembled by [`void/assemble.py`](void/assemble.py) from [`void/features.yaml`](void/features.yaml) on top of the upstream stable tag. This README is generated — edit the manifest, not this file.
