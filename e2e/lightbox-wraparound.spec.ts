/**
 * Lightbox wraparound: the #7082 race fix must NOT regress first/last
 * wraparound or chapter navigation.
 *
 * CynicalAtropos flagged on PR #7083 that deriving the landing index from the
 * `page`-number direction breaks wraparound: a wrap moves the page number
 * *opposite* to the nav direction, so it lands on the new page's first/last
 * image instead of the global first/last. This v2 keeps the landing index under
 * the handlers' control, so wraparound is preserved.
 *
 * Gallery 17 has 77 images. Since #7084 the header shows a single global
 * counter ("N / 77"), not a per-page "Page X / Y" span plus a per-page index --
 * so wraparound must land on the true first/last of the whole gallery:
 *   - backward from image 1/77  -> 77/77 (the last image overall).
 *   - forward  from image 77/77 -> 1/77  (the first image overall).
 */
import { test, expect, waitForLightbox, parkMouse } from "./lib";
import type { Page } from "@playwright/test";

const indicator = (page: Page) => page.locator(".Lightbox-header-indicator b");

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

test("backward wrap from the first image lands on the last image (77 / 77)", async ({
  page,
}) => {
  await loadGalleryGrid(page, "/galleries/17");
  await openGridImage(page, 0);
  await expect(indicator(page)).toHaveText("1 / 77");

  await page.keyboard.press("ArrowLeft");
  await parkMouse(page);
  await expect(indicator(page)).toHaveText("77 / 77"); // wraps to the global last image
});

test("forward wrap from the last image lands on the first image (1 / 77)", async ({
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
  await expect(indicator(page)).toHaveText("77 / 77");

  await page.keyboard.press("ArrowRight");
  await parkMouse(page);
  await expect(indicator(page)).toHaveText("1 / 77"); // wraps to the global first image
});
