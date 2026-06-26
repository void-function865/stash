/**
 * Verify the global image position counter in the lightbox (issue #4315).
 *
 * - Gallery 17 has 77 images (2 pages of 40) -> counter must be global "N / 77",
 *   no "Page X / Y" line, and must cross the page boundary 40/77 -> 41/77.
 * - Gallery 1 has 10 images (single page) -> counter "N / 10".
 */
import { test, expect, waitForLightbox, parkMouse } from "./lib";
import type { Page } from "@playwright/test";

function indicator(page: Page) {
  return page.locator(".Lightbox-header-indicator b");
}

function headerText(page: Page) {
  return page.locator(".Lightbox-header-indicator");
}

// Give the image grid a bounded chance to settle. The card's lightbox-open
// onClick races the anchor it wraps (<a href="/images/:id">): clicking before
// the handler is ready or mid-reflow (as covers stream in) falls through to the
// anchor and navigates away. A short, *bounded* networkidle restores the settle
// that plain networkidle gave — without its unbounded hang on cold caches.
async function loadGalleryGrid(page: Page, galleryUrl: string): Promise<void> {
  await page.goto(galleryUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".image-card img").first().waitFor();
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}

/** Open the lightbox at the nth image (0-based) of a gallery's detail grid. */
async function openGalleryAt(page: Page, gid: number, nth = 0): Promise<void> {
  const galleryUrl = `/galleries/${gid}`;
  await loadGalleryGrid(page, galleryUrl);

  // Retry the open: if a click still slipped through to the anchor and navigated
  // to the image detail page, reload the grid and try again. Bounded clicks so a
  // single hung attempt is retried rather than eating the whole test budget.
  await expect(async () => {
    if (!page.url().includes(galleryUrl)) await loadGalleryGrid(page, galleryUrl);
    await page.locator(".image-card img").nth(nth).click({ timeout: 8000 });
    expect(await waitForLightbox(page, 2500)).toBe(true);
  }).toPass({ timeout: 25_000 });

  await parkMouse(page);
}

test("gallery 17: global counter is N/77 and crosses the page boundary", async ({ page }) => {
  // Open at image 1: counter is global, with no per-page header.
  await openGalleryAt(page, 17, 0);
  const full = (await headerText(page).innerText()).trim();
  expect(full, `g17 still shows a 'Page X / Y' header: ${full}`).not.toContain("Page");
  await expect(indicator(page)).toHaveText("1 / 77");

  // Reopen at the last image of page 1 (the 40th card). This is both far cheaper
  // than stepping 39 times — each ArrowRight loads a full-size image (~1s) — and
  // a stronger check: the counter must read the global "40 / 77" at a paginated
  // offset, not "40 / 40".
  await openGalleryAt(page, 17, 39);
  await expect(indicator(page)).toHaveText("40 / 77");

  // Cross the page boundary -> image 41 (first of page 2); this triggers the
  // page-2 refetch, and the global counter must continue, not reset.
  await page.keyboard.press("ArrowRight");
  await parkMouse(page);
  await expect(indicator(page)).toHaveText("41 / 77");
});

test("gallery 1: global counter is N/10 on a single page", async ({ page }) => {
  await openGalleryAt(page, 1, 0);
  const full = (await headerText(page).innerText()).trim();
  expect(full, `g1 shows a 'Page X / Y' header: ${full}`).not.toContain("Page");
  await expect(indicator(page)).toHaveText("1 / 10");
});
