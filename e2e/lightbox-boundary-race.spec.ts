/**
 * The #7082 bug this fix targets: crossing a page boundary forward, back, then
 * forward again — quickly, with page 2 already cached — landed on the *last*
 * image of page 2 (the index-range clamp firing on a stale index against the
 * just-swapped shorter page) instead of its first image.
 *
 * Gallery 17: page 1 = images 1-40, page 2 = images 41-77. Since #7084 the
 * header shows a single global counter, so after the round-trip the forward
 * cross must land on 41/77 — never the clamp-to-last 77/77.
 */
import { test, expect, waitForLightbox, parkMouse } from "./lib";
import type { Page } from "@playwright/test";

const indicator = (page: Page) => page.locator(".Lightbox-header-indicator b");

async function loadGalleryGrid(page: Page, galleryUrl: string): Promise<void> {
  await page.goto(galleryUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".image-card img").first().waitFor();
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}

/** Open at the 40th card of page 1 -> 40/77 (the boundary). */
async function openAtBoundary(page: Page): Promise<void> {
  await loadGalleryGrid(page, "/galleries/17");
  await expect(async () => {
    await page.locator(".image-card img").nth(39).click({ timeout: 8000 });
    expect(await waitForLightbox(page, 2500)).toBe(true);
  }).toPass({ timeout: 25_000 });
  await parkMouse(page);
  await expect(indicator(page)).toHaveText("40 / 77");
}

// Repeat at several inter-press gaps: the clamp-to-last only won the race at
// some timings, so a single gap can pass on buggy code. With the fix, every gap
// lands on 41/77 (the new page's first image), never 77/77.
for (const gap of [0, 40, 120]) {
  test(`forward -> back -> forward at ${gap}ms lands on 41/77 (never the clamp 77/77)`, async ({
    page,
  }) => {
    await openAtBoundary(page);

    // Warm page 2 once (so the third cross hits the cached, synchronous swap).
    await page.keyboard.press("ArrowRight"); // 40/77 -> 41/77
    await page.waitForTimeout(gap);
    await page.keyboard.press("ArrowLeft"); //  41/77 -> 40/77
    await page.waitForTimeout(gap);
    await page.keyboard.press("ArrowRight"); // 40/77 -> 41/77 (cached)

    await parkMouse(page);
    await expect(indicator(page)).toHaveText("41 / 77");
  });
}
