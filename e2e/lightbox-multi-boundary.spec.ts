/**
 * Multi-page-boundary lightbox navigation (issue #7082 / PR #7083 follow-up).
 *
 * The existing boundary specs (lightbox-boundary-race, lightbox-wraparound) use
 * gallery 17, which has only TWO pages — so they can't catch a cross that skips
 * a page. Maintainer WithoutPants reported exactly that on #7083: pressing right
 * "jumped the page (not image) forward from 1 to 3, then to 5, then it stopped
 * working" — a +2-per-press page jump ending in a frozen guard. That symptom is
 * only observable with three or more pages.
 *
 * This drives a 6-page gallery (240 images, pageSize 40) and asserts every
 * internal boundary advances by EXACTLY one page in both directions, that
 * navigation stays live after each cross (a follow-up press still moves), and
 * that a continuous forward/backward traversal across all five boundaries in one
 * lightbox session never skips or freezes.
 *
 * Fixture (not yet a committed seed — see e2e/README "Test data"): a folder
 * gallery of 240 numbered JPGs at galleries/void_pagination_test, scanned into
 * the dev instance as gallery MULTI_GALLERY_ID (default 19). Regenerate with the
 * generator in the PR notes if the instance is rebuilt. Override the id/shape
 * via env when the fixture lands elsewhere.
 */
import { test, expect, waitForLightbox, parkMouse } from "./lib";
import type { Page } from "@playwright/test";

const GALLERY_ID = process.env.MULTI_GALLERY_ID ?? "19";
const PAGE_SIZE = Number(process.env.MULTI_PAGE_SIZE ?? 40);
const PAGES = Number(process.env.MULTI_PAGES ?? 6);

const indicator = (page: Page) => page.locator(".Lightbox-header-indicator b");
const pageHeader = (page: Page) => page.locator(".Lightbox-header-indicator span");
const lightboxImg = (page: Page) =>
  page
    .locator(".Lightbox-carousel .Lightbox-image img, .Lightbox-carousel img")
    .first();

function gridUrl(gridPage: number): string {
  const p = gridPage > 1 ? `&p=${gridPage}` : "";
  return `/galleries/${GALLERY_ID}?sortby=path${p}`;
}

async function loadGrid(page: Page, gridPage: number): Promise<void> {
  await page.goto(gridUrl(gridPage), { waitUntil: "domcontentloaded" });
  await page.locator(".image-card img").first().waitFor();
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}

/**
 * Open the lightbox at a specific grid page + card. The grid paginates at the
 * same pageSize as the lightbox, so grid page P card nth(k) opens the lightbox
 * on "Page P", image k+1. Retried: an image card is inside an <a href>, and a
 * click before hydration falls through to the anchor and navigates away.
 */
async function openAt(page: Page, gridPage: number, nth: number): Promise<void> {
  await loadGrid(page, gridPage);
  await expect(async () => {
    if (!page.url().includes(`/galleries/${GALLERY_ID}`)) await loadGrid(page, gridPage);
    await page.locator(".image-card img").nth(nth).click({ timeout: 8000 });
    expect(await waitForLightbox(page, 2500)).toBe(true);
  }).toPass({ timeout: 25_000 });
  await parkMouse(page);
}

async function expectAt(page: Page, idx: string, pg: number): Promise<void> {
  await parkMouse(page);
  await expect(indicator(page)).toHaveText(idx);
  await expect(pageHeader(page)).toContainText(`Page ${pg} / ${PAGES}`);
  await expect(lightboxImg(page)).toBeVisible();
}

// --- forward: each internal boundary advances by exactly one page ------------
for (let p = 1; p < PAGES; p++) {
  test(`forward cross page ${p}->${p + 1} lands on the next page's first image`, async ({
    page,
  }) => {
    await openAt(page, p, PAGE_SIZE - 1); // Page p, last image
    await expectAt(page, `${PAGE_SIZE} / ${PAGE_SIZE}`, p);

    await page.keyboard.press("ArrowRight");
    await expectAt(page, `1 / ${PAGE_SIZE}`, p + 1); // never Page p+2

    // still live, not a frozen guard: the next press advances within the page
    await page.keyboard.press("ArrowRight");
    await expectAt(page, `2 / ${PAGE_SIZE}`, p + 1);
  });
}

// --- backward: each internal boundary steps back by exactly one page ---------
for (let p = 2; p <= PAGES; p++) {
  test(`backward cross page ${p}->${p - 1} lands on the previous page's last image`, async ({
    page,
  }) => {
    await openAt(page, p, 0); // Page p, first image
    await expectAt(page, `1 / ${PAGE_SIZE}`, p);

    await page.keyboard.press("ArrowLeft");
    await expectAt(page, `${PAGE_SIZE} / ${PAGE_SIZE}`, p - 1); // never Page p-2

    await page.keyboard.press("ArrowLeft");
    await expectAt(page, `${PAGE_SIZE - 1} / ${PAGE_SIZE}`, p - 1);
  });
}

// --- one continuous forward traversal across every boundary ------------------
// Rapid PAGE_SIZE-press bursts (no gaps) stress the switch guard the way the
// reported freeze did; after each burst the counter must have advanced exactly
// one page and still show its first image.
test("continuous forward traversal crosses all boundaries without skipping or freezing", async ({
  page,
}) => {
  await openAt(page, 1, 0); // Page 1, 1/40
  await expectAt(page, `1 / ${PAGE_SIZE}`, 1);

  for (let p = 2; p <= PAGES; p++) {
    for (let i = 0; i < PAGE_SIZE; i++) await page.keyboard.press("ArrowRight");
    await expectAt(page, `1 / ${PAGE_SIZE}`, p);
  }
});

// --- one continuous backward traversal across every boundary -----------------
test("continuous backward traversal crosses all boundaries without skipping or freezing", async ({
  page,
}) => {
  await openAt(page, PAGES, PAGE_SIZE - 1); // last page, last image
  await expectAt(page, `${PAGE_SIZE} / ${PAGE_SIZE}`, PAGES);

  for (let p = PAGES - 1; p >= 1; p--) {
    for (let i = 0; i < PAGE_SIZE; i++) await page.keyboard.press("ArrowLeft");
    await expectAt(page, `${PAGE_SIZE} / ${PAGE_SIZE}`, p);
  }
});
