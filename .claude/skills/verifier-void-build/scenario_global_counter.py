"""Verify the global image position counter in the lightbox (issue #4315).

- Gallery 17 has 77 images (2 pages of 40) -> counter must be global "N / 77",
  no "Page X / Y" line, and must cross the page boundary 40/77 -> 41/77.
- Gallery 1 has 10 images (single page) -> counter "N / 10".
"""

import sys

from lib import BASE, session, wait_for_lightbox, park_mouse


def indicator(page):
    el = page.locator(".Lightbox-header-indicator b")
    return el.inner_text().strip() if el.count() else "(none)"


def header_text(page):
    return page.locator(".Lightbox-header-indicator").inner_text().strip()


def open_gallery(page, gid):
    page.goto(f"{BASE}/galleries/{gid}", wait_until="networkidle")
    page.wait_for_timeout(1000)
    # the gallery detail image grid is an ImageList; clicking a card's image
    # opens the (paginated) lightbox
    page.locator(".image-card img").first.click()
    assert wait_for_lightbox(page), f"lightbox did not open for gallery {gid}"
    park_mouse(page)


def main():
    fails = []
    with session() as (page, errors):
        # --- Gallery 17: 77 images, paginated ---
        open_gallery(page, 17)
        full = header_text(page)
        print(f"[g17] header full text: {full!r}")
        print(f"[g17] indicator: {indicator(page)!r}")
        if "Page" in full:
            fails.append(f"g17 still shows a 'Page X / Y' header: {full!r}")
        if indicator(page) != "1 / 77":
            fails.append(f"g17 initial counter expected '1 / 77', got {indicator(page)!r}")

        # step to image 40 (last of page 1)
        for _ in range(39):
            page.keyboard.press("ArrowRight")
            page.wait_for_timeout(60)
        park_mouse(page)
        print(f"[g17] after 39x Right: {indicator(page)!r}")
        if indicator(page) != "40 / 77":
            fails.append(f"g17 at image 40 expected '40 / 77', got {indicator(page)!r}")

        # cross the page boundary -> image 41 (first of page 2)
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(1200)  # page refetch
        park_mouse(page)
        print(f"[g17] after boundary cross: {indicator(page)!r}")
        if indicator(page) != "41 / 77":
            fails.append(f"g17 across boundary expected '41 / 77', got {indicator(page)!r}")

        page.keyboard.press("Escape")
        page.wait_for_timeout(400)

        # --- Gallery 1: 10 images, single page ---
        open_gallery(page, 1)
        full1 = header_text(page)
        print(f"[g1] header full text: {full1!r}")
        print(f"[g1] indicator: {indicator(page)!r}")
        if "Page" in full1:
            fails.append(f"g1 shows a 'Page X / Y' header: {full1!r}")
        if indicator(page) != "1 / 10":
            fails.append(f"g1 initial counter expected '1 / 10', got {indicator(page)!r}")

        print(f"\nconsole errors/warnings: {len(errors)}")
        for e in errors[:10]:
            print("  ", e)

    if fails:
        print("\nFAIL:")
        for f in fails:
            print("  -", f)
        sys.exit(1)
    print("\nPASS: global counter behaves correctly")


if __name__ == "__main__":
    main()
