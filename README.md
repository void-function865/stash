# Stash (void-function865 build)

This is an **unofficial downstream build** of [Stash](https://github.com/stashapp/stash). It tracks the stable release **[v0.31.1](https://github.com/stashapp/stash/releases/tag/v0.31.1)** and adds the changes listed below, each linked to its upstream issue and pull request.

> **Database-compatible with upstream v0.31.1.** These builds do not change the database schema, so you can switch between this build and the official v0.31.1 build on the same database without migrating.

Releases are versioned `0.31.1-void1`, `0.31.1-void2`, … and built from the upstream stable tag plus the patches below.

## Merged upstream, awaiting release

Already merged into upstream `develop`; included here until they ship in a stable release.

| Change | Issue | PR | Notes |
| --- | --- | --- | --- |
| Image checksum cache-buster | — | [#6998](https://github.com/stashapp/stash/pull/6998) | Use the file checksum for image URL cache-busting so ratings/edits refresh reliably in the lightbox. |
| Lightbox image aspect ratios on Safari | [#5087](https://github.com/stashapp/stash/issues/5087) | [#6961](https://github.com/stashapp/stash/pull/6961) | Fix warped image aspect ratios in the lightbox on Safari. |

## Open pull requests

Submitted upstream and under review.

| Change | Issue | PR | Notes |
| --- | --- | --- | --- |
| Open gallery slideshow from the galleries page | [#1579](https://github.com/stashapp/stash/issues/1579) | [#7035](https://github.com/stashapp/stash/pull/7035) | A magnifying-glass control on gallery cards opens the slideshow directly. |
| Delete image shortcut and button in the lightbox | [#4512](https://github.com/stashapp/stash/issues/4512) | [#7022](https://github.com/stashapp/stash/pull/7022) | Adds a "d d" shortcut and a trash button to delete the current image from the lightbox. |
| Safari auto-start on transcode-required scenes | [#6646](https://github.com/stashapp/stash/issues/6646) | [#7016](https://github.com/stashapp/stash/pull/7016) | Fix scene auto-start in Safari when the scene requires server-side transcoding. |

## Pending submission

Not yet submitted upstream. New pull requests are queued behind upstream's [3-open-PR-per-contributor limit](https://github.com/stashapp/stash/blob/develop/docs/CONTRIBUTING.md#pull-requests).

| Change | Issue | PR | Notes |
| --- | --- | --- | --- |
| Don't mark forks as Official Build | [#7065](https://github.com/stashapp/stash/issues/7065) | — | CI only sets the official-build flag for the upstream repository, so fork builds correctly report "Unofficial Build". |
| Configurable update-check source | [#7066](https://github.com/stashapp/stash/issues/7066) | — | Lets a build point the update check at its own releases via a build-time UPDATE_REPO override (defaults to upstream). |
| Global image counter in the lightbox | [#4315](https://github.com/stashapp/stash/issues/4315) | — | Show a global image position counter in the lightbox. |

## Installation, usage and documentation

This fork only adds the changes above. For installation, first-run setup, usage, and all other documentation, see the [upstream Stash repository](https://github.com/stashapp/stash) and the [official documentation](https://docs.stashapp.cc).

## How this build is maintained

The build is assembled by [`void/assemble.py`](void/assemble.py) from [`void/features.yaml`](void/features.yaml) on top of the upstream stable tag. This README is generated — edit the manifest, not this file.
