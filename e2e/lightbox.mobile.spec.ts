/**
 * Touch smoke test for the gallery lightbox on phone/tablet (hasTouch, no hover).
 *
 * Runs on the touch projects only (ipad / iphone / pixel — see
 * playwright.config.ts testMatch). The desktop hover-scrubber specs can't run
 * here, so this exercises the hover-free touch entry point: tap-scrub on a
 * gallery card.
 *
 * Finding from the trial: tapping a gallery *detail* image does NOT open the
 * lightbox on touch — it navigates to the image detail page (the lightbox
 * onClick yields to the anchor's navigation under a tap). So the reliable touch
 * way into the lightbox is the card scrubber.
 */
import { test, expect, goto, closeLightbox, tapScrubber, waitForLightbox } from "./lib";
import type { Page } from "@playwright/test";

function indicator(page: Page) {
  return page.locator(".Lightbox-header-indicator b");
}

test("tap-scrub on a gallery card opens the lightbox with a global counter", async ({ page }) => {
  await goto(page);
  await page.waitForSelector(".gallery-card");
  const card = page
    .locator(".gallery-card")
    .filter({ has: page.locator(".hover-scrubber-area") })
    .first();
  await card.scrollIntoViewIfNeeded();

  await tapScrubber(page, card);
  expect(await waitForLightbox(page), "lightbox did not open from tap-scrub").toBe(true);

  // the global counter renders on the touch layout, well-formed "N / M"
  await expect(indicator(page)).toHaveText(/^\d+ \/ \d+$/);

  await closeLightbox(page);
  expect(await waitForLightbox(page, 1000)).toBe(false);
});
