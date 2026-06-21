"""Playwright harness for verifying the void Stash build's web UI.

Run scenarios with uv (no project dep needed):

    uv run --with playwright python my_scenario.py

Env:
  STASH_BASE       base URL to drive (default http://localhost:3000 — the vite
                   dev server). Set to http://localhost:9999 to drive the
                   shipped build binary directly.
  HEADED=1         show the browser (default headless).
  STASH_ARTIFACTS  evidence dir (default /tmp/void-verify). On exit the harness
                   writes final.png and trace.zip there.

The trace is the replayable evidence a reviewer opens with:

    uv run --with playwright playwright show-trace /tmp/void-verify/trace.zip
"""

import contextlib
import os
import pathlib

from playwright.sync_api import Page, sync_playwright

BASE = os.environ.get("STASH_BASE", "http://localhost:3000")
ART = pathlib.Path(os.environ.get("STASH_ARTIFACTS", "/tmp/void-verify"))


@contextlib.contextmanager
def session(headed: bool | None = None):
    """Launch chromium with tracing on. Yields (page, errors).

    `errors` accumulates console errors/warnings and uncaught page errors seen
    during the run — check it after driving, an empty list is a good sign.
    """
    ART.mkdir(parents=True, exist_ok=True)
    if headed is None:
        headed = os.environ.get("HEADED") == "1"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        ctx = browser.new_context(viewport={"width": 1366, "height": 900})
        ctx.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = ctx.new_page()
        errors: list[str] = []
        page.on(
            "console",
            lambda m: errors.append(f"[{m.type}] {m.text}")
            if m.type in ("error", "warning")
            else None,
        )
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
        try:
            yield page, errors
        finally:
            with contextlib.suppress(Exception):
                page.screenshot(path=str(ART / "final.png"))
            ctx.tracing.stop(path=str(ART / "trace.zip"))
            browser.close()


def goto(page: Page, path: str = "/galleries?sortby=path") -> None:
    page.goto(BASE + path, wait_until="networkidle")


def lightbox_open(page: Page) -> bool:
    """Instantaneous predicate. Races the React mount — for assertions right
    after an open/reopen use wait_for_lightbox(), which waits."""
    return page.locator(".Lightbox").count() > 0


def wait_for_lightbox(page: Page, timeout: int = 6000) -> bool:
    """Wait for the lightbox to actually mount and settle past the empty
    loading state (the gallery lightbox briefly shows no content while the
    lazy query resolves). Use this, not lightbox_open(), to assert an open."""
    try:
        page.wait_for_selector(".Lightbox", timeout=timeout)
        page.wait_for_timeout(400)
        return page.locator(".Lightbox").count() > 0
    except Exception:
        return False


def park_mouse(page: Page) -> None:
    """Move the cursor to the top-left corner, away from cards and the lightbox
    footer. Two reasons: (1) the hover-scrubber only re-arms on a *fresh*
    trusted mousemove, so the cursor must leave the card before reopening — a
    bare re-hover() while it never left is a no-op; (2) hovering the rating
    stars changes the displayed value, so reads must happen with the mouse off
    them."""
    page.mouse.move(5, 5)
    page.wait_for_timeout(200)


def star_rating(page: Page) -> int:
    """Number of fully-filled stars in the lightbox footer (the persisted
    rating). Parks the mouse first so footer hover doesn't skew the read."""
    park_mouse(page)
    return page.locator(".Lightbox .rating-stars button.star-fill-100").count()


def set_star_rating(page: Page, n: int) -> None:
    """Click the n-th rating star in the lightbox footer (1-based)."""
    btn = page.locator(".Lightbox .rating-stars button").nth(n - 1)
    btn.hover()
    btn.click()
    page.wait_for_timeout(500)  # mutation + re-render settle


def close_lightbox(page: Page) -> None:
    btn = page.locator(".Lightbox button").filter(
        has=page.locator("svg[data-icon=times], svg[data-icon=xmark]")
    )
    if btn.count():
        btn.first.click()
        page.wait_for_selector(".Lightbox", state="detached", timeout=3000)


def open_via_scrubber(page, card, fraction: float = 0.6) -> None:
    """Open the gallery lightbox by clicking the card's hover-scrubber slider.

    Parks the mouse first (so a reopen gets a fresh trusted mousemove that
    re-arms the scrubber), hovers, then clicks at a real pixel offset so the
    trusted event carries a correct offsetX — this is the path that exposed the
    reopen bug; a synthetic .click() does not.

    NB: a non-zero `fraction` opens a *mid-gallery* image, while
    open_via_magnifier opens index 0. Don't compare per-image state across the
    two entry points unless you account for that.
    """
    park_mouse(page)
    area = card.locator(".hover-scrubber-area")
    area.hover()
    box = area.bounding_box()
    area.click(position={"x": box["width"] * fraction, "y": box["height"] / 2})


def open_via_magnifier(page, card) -> None:
    """Open the gallery lightbox at index 0 via the cover magnifier button."""
    park_mouse(page)
    card.locator(".preview-button button").click()
