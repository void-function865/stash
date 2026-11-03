# Stash (void-function865 build)

This is an **unofficial downstream build** of [Stash](https://github.com/stashapp/stash). It tracks the stable release **[v0.32.0](https://github.com/stashapp/stash/releases/tag/v0.32.0)** and adds the changes listed below, each linked to its upstream issue and pull request.

> **Database-compatible with upstream v0.32.0.** These builds do not change the database schema, so you can switch between this build and the official v0.32.0 build on the same database without migrating.

Releases are versioned `0.32.0-void1`, `0.32.0-void2`, … and built from the upstream stable tag plus the patches below.

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
