"""Example scenario: gallery lightbox reopens from the card slider.

Regression check for the void interaction bug where opening the gallery
lightbox from a card's hover-scrubber, closing it, and reopening left it
unable to open (it mounted then auto-closed during the empty loading state).

Run against the dev server (after serve.sh):
    uv run --with playwright python .claude/skills/verifier-void-build/example_lightbox_reopen.py
Or against the shipped build:
    STASH_BASE=http://localhost:9999 uv run --with playwright python .../example_lightbox_reopen.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import (  # noqa: E402
    close_lightbox,
    goto,
    open_via_magnifier,
    open_via_scrubber,
    session,
    wait_for_lightbox,
)


def pick_card(page):
    cards = page.locator(".gallery-card").filter(
        has=page.locator(".preview-button")
    ).filter(has=page.locator(".hover-scrubber-area"))
    card = cards.first
    card.scroll_into_view_if_needed()
    return card


with session() as (page, errors):
    goto(page)
    page.wait_for_selector(".gallery-card")
    card = pick_card(page)

    results = []
    # slider -> close -> slider -> close -> magnifier  (the failing sequence)
    open_via_scrubber(page, card)
    results.append(("slider #1", wait_for_lightbox(page)))
    close_lightbox(page)

    open_via_scrubber(page, card)
    results.append(("slider #2", wait_for_lightbox(page)))
    close_lightbox(page)

    open_via_magnifier(page, card)
    results.append(("magnifier", wait_for_lightbox(page)))
    close_lightbox(page)

    ok = all(opened for _, opened in results)
    print("PASS" if ok else "FAIL", "—", ", ".join(f"{n}:{'open' if o else 'FAIL'}" for n, o in results))
    if errors:
        print("console:", errors)
    sys.exit(0 if ok else 1)
