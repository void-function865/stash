/**
 * Canonical page-boundary coverage, adapted to the void global counter ("N/77").
 * The index/page state machine (handleLeft/Right, the settle effect, the
 * index-range clamp, gotoPage) is identical between the develop PR branch and
 * the void build, so exercising it here validates the same reconciliation the
 * upstream wraparound + boundary-race specs cover, just read off the global
 * counter instead of the per-page "Page X / Y" header.
 *
 * Gallery 17: page 1 = 40 images, page 2 = 37 (77 total).
 */
import { test, expect, waitForLightbox, parkMouse } from "./lib";
import type { Page } from "@playwright/test";

const indicator = (page: Page) => page.locator(".Lightbox-header-indicator b");
const lightboxImg = (page: Page) =>
  page.locator(".Lightbox-carousel .Lightbox-image img, .Lightbox-carousel img").first();

async function loadGalleryGrid(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(".image-card img").first().waitFor();
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}

async function openCardFresh(page: Page, nth: number): Promise<void> {
  await loadGalleryGrid(page, "/galleries/17");
  await expect(async () => {
    if (!page.url().includes("/galleries/17")) await loadGalleryGrid(page, "/galleries/17");
    await page.locator(".image-card img").nth(nth).click({ timeout: 8000 });
    expect(await waitForLightbox(page, 2500)).toBe(true);
  }).toPass({ timeout: 25_000 });
  await parkMouse(page);
}

// --- boundary race: forward -> back -> forward (page 2 cached) -> 41/77 ---
for (const gap of [0, 40, 120]) {
  test(`forward->back->forward at ${gap}ms lands on 41/77 (never the clamp 77/77)`, async ({
    page,
  }) => {
    await openCardFresh(page, 39);
    await expect(indicator(page)).toHaveText("40 / 77");

    await page.keyboard.press("ArrowRight"); // -> 41/77 (page 2 warmed)
    await page.waitForTimeout(gap);
    await page.keyboard.press("ArrowLeft"); // -> 40/77
    await page.waitForTimeout(gap);
    await page.keyboard.press("ArrowRight"); // -> 41/77 (cached, synchronous swap)

    await parkMouse(page);
    await expect(indicator(page)).toHaveText("41 / 77");
    await expect(lightboxImg(page)).toBeVisible();
  });
}

// --- backward wrap from the first image -> global last (77/77) ---
test("backward wrap from 1/77 lands on 77/77 with the image visible", async ({ page }) => {
  await openCardFresh(page, 0);
  await expect(indicator(page)).toHaveText("1 / 77");
  await page.keyboard.press("ArrowLeft");
  await parkMouse(page);
  await expect(indicator(page)).toHaveText("77 / 77");
  await expect(lightboxImg(page)).toBeVisible();
});

// --- backward wrap with page 2 already cached (the user's reported case) ---
test("backward wrap from 1/77 with page 2 cached lands on 77/77", async ({ page }) => {
  await openCardFresh(page, 39); // 40/77
  await page.keyboard.press("ArrowRight"); // 41/77, caches page 2
  await parkMouse(page);
  await expect(indicator(page)).toHaveText("41 / 77");
  await openCardFresh(page, 0); // reopen at 1/77 (cache persists)
  await expect(indicator(page)).toHaveText("1 / 77");
  await page.keyboard.press("ArrowLeft");
  await parkMouse(page);
  await expect(indicator(page)).toHaveText("77 / 77");
  await expect(lightboxImg(page)).toBeVisible();
});

// --- forward wrap from the last image -> global first (1/77) ---
test("forward wrap from 77/77 lands on 1/77 with the image visible", async ({ page }) => {
  // open near the end of page 2, step to the last image, then wrap forward
  await openCardFresh(page, 39);
  await page.keyboard.press("ArrowRight"); // 41/77 (page 2)
  await parkMouse(page);
  // jump to the last image of the gallery via the grid for speed
  await openCardFresh(page, 0);
  // navigate backward-wrap to land on 77/77, then forward-wrap back to 1/77
  await page.keyboard.press("ArrowLeft");
  await parkMouse(page);
  await expect(indicator(page)).toHaveText("77 / 77");
  await page.keyboard.press("ArrowRight");
  await parkMouse(page);
  await expect(indicator(page)).toHaveText("1 / 77");
  await expect(lightboxImg(page)).toBeVisible();
});
