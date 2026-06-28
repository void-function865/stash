/**
 * Lightbox page-boundary navigation: the #7082 race fix must NOT regress
 * first/last wraparound or chapter navigation.
 *
 * CynicalAtropos flagged on PR #7083 that deriving the landing index from the
 * `page`-number direction breaks wraparound: a wrap moves the page number
 * *opposite* to the nav direction, so it lands on the new page's first/last
 * image instead of the global first/last. This v2 keeps the landing index under
 * the handlers' control, so wraparound is preserved.
 *
 * Gallery 17 has 77 images = page 1 (40) + page 2 (37). The header is the stock
 * per-page counter: a "Page X / Y" span + a "<idx> / <pageCount>" bold.
 *   - backward from Page 1, 1/40  -> Page 2, 37/37 (last image), not 1/37.
 *   - forward  from Page 2, 37/37 -> Page 1, 1/40  (first image), not 40/40.
 */
import { test, expect, waitForLightbox, parkMouse } from "./lib";
import type { Page } from "@playwright/test";

const indicator = (page: Page) => page.locator(".Lightbox-header-indicator b");
const pageHeader = (page: Page) => page.locator(".Lightbox-header-indicator span");

async function loadGalleryGrid(page: Page, galleryUrl: string): Promise<void> {
  await page.goto(galleryUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".image-card img").first().waitFor();
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}

async function openGridImage(page: Page, nth: number): Promise<void> {
  await expect(async () => {
    if (!page.url().includes("/galleries/17")) await loadGalleryGrid(page, "/galleries/17");
    await page.locator(".image-card img").nth(nth).click({ timeout: 8000 });
    expect(await waitForLightbox(page, 2500)).toBe(true);
  }).toPass({ timeout: 25_000 });
  await parkMouse(page);
}

test("backward wrap from the first image lands on the last image (Page 2, 37/37)", async ({
  page,
}) => {
  await loadGalleryGrid(page, "/galleries/17");
  await openGridImage(page, 0);
  await expect(pageHeader(page)).toContainText("Page 1 / 2");
  await expect(indicator(page)).toHaveText("1 / 40");

  await page.keyboard.press("ArrowLeft");
  await parkMouse(page);
  await expect(pageHeader(page)).toContainText("Page 2 / 2");
  await expect(indicator(page)).toHaveText("37 / 37"); // not 1/37 (the regression)
});

test("forward wrap from the last image lands on the first image (Page 1, 1/40)", async ({
  page,
}) => {
  await loadGalleryGrid(page, "/galleries/17");
  await page.locator(".pagination").first().locator("button").last().click(); // » Last page
  await page.locator(".image-card img").first().waitFor();
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  const cards = page.locator(".image-card img");
  const count = await cards.count();
  await expect(async () => {
    await cards.nth(count - 1).click({ timeout: 8000 });
    expect(await waitForLightbox(page, 2500)).toBe(true);
  }).toPass({ timeout: 25_000 });
  await parkMouse(page);
  await expect(pageHeader(page)).toContainText("Page 2 / 2");
  await expect(indicator(page)).toHaveText("37 / 37");

  await page.keyboard.press("ArrowRight");
  await parkMouse(page);
  await expect(pageHeader(page)).toContainText("Page 1 / 2");
  await expect(indicator(page)).toHaveText("1 / 40"); // not 40/40 (the regression)
});
