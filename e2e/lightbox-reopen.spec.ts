/**
 * Gallery lightbox reopens from the card slider.
 *
 * Regression check for the interaction bug where opening the gallery
 * lightbox from a card's hover-scrubber, closing it, and reopening left it
 * unable to open (it mounted then auto-closed during the empty loading state).
 */
import {
  test,
  expect,
  goto,
  closeLightbox,
  openViaMagnifier,
  openViaScrubber,
  waitForLightbox,
} from "./lib";
import type { Page } from "@playwright/test";

function pickCard(page: Page) {
  return page
    .locator(".gallery-card")
    .filter({ has: page.locator(".preview-button") })
    .filter({ has: page.locator(".hover-scrubber-area") })
    .first();
}

test("lightbox reopens through slider -> close -> slider -> close -> magnifier", async ({ page }) => {
  await goto(page);
  await page.waitForSelector(".gallery-card");
  const card = pickCard(page);
  await card.scrollIntoViewIfNeeded();

  // the failing sequence: slider -> close -> slider -> close -> magnifier
  await openViaScrubber(page, card);
  expect(await waitForLightbox(page), "slider #1 did not open").toBe(true);
  await closeLightbox(page);

  await openViaScrubber(page, card);
  expect(await waitForLightbox(page), "slider #2 did not open").toBe(true);
  await closeLightbox(page);

  await openViaMagnifier(page, card);
  expect(await waitForLightbox(page), "magnifier did not open").toBe(true);
  await closeLightbox(page);
});
