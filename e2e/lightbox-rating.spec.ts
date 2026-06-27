/**
 * Lightbox image rating keyboard shortcuts (issue #5616).
 *
 * `r` then a digit sets the current image's rating, driven by the lightbox-scoped
 * Mousetrap instance (the global one is paused while the lightbox is open). This
 * runs against a stateful dev instance with no fixtures and ratings persist, so
 * the spec never assumes a starting rating: it normalises to 0 first, asserts the
 * transition, and resets to 0 in teardown to stay re-runnable.
 *
 * Assumes the Stars rating system (the lib `starRating` helper reads star fills).
 */
import {
  test,
  expect,
  goto,
  closeLightbox,
  openViaMagnifier,
  waitForLightbox,
  starRating,
  parkMouse,
} from "./lib";
import type { Page } from "@playwright/test";

function pickCard(page: Page) {
  return page
    .locator(".gallery-card")
    .filter({ has: page.locator(".preview-button") })
    .first();
}

/** Press "r" then a digit, then let the mutation + re-render settle. Parks the
 * mouse first so the footer-hover preview doesn't skew a subsequent star read. */
async function pressRating(page: Page, key: string) {
  await parkMouse(page);
  await page.keyboard.press("r");
  await page.keyboard.press(key);
  await page.waitForTimeout(500);
}

test("r + digit sets the lightbox image rating, and it persists", async ({ page }) => {
  await goto(page);
  await page.waitForSelector(".gallery-card");
  const card = pickCard(page);
  await card.scrollIntoViewIfNeeded();

  await openViaMagnifier(page, card);
  expect(await waitForLightbox(page), "lightbox did not open").toBe(true);

  try {
    // normalise: clear any residual rating left by a prior run
    await pressRating(page, "0");
    await expect.poll(() => starRating(page), "r 0 did not clear the rating").toBe(0);

    // set 3 stars via the keyboard shortcut
    await pressRating(page, "3");
    await expect.poll(() => starRating(page), "r 3 did not set 3 stars").toBe(3);

    // it was written server-side: reopen the same image and re-read
    await closeLightbox(page);
    await openViaMagnifier(page, card);
    expect(await waitForLightbox(page), "lightbox did not reopen").toBe(true);
    await expect.poll(() => starRating(page), "rating did not persist").toBe(3);
  } finally {
    // teardown: leave the image unrated so re-runs start from a known state
    await pressRating(page, "0");
  }
});

test("a second r-sequence near the 1s window boundary still updates the rating", async ({
  page,
}) => {
  // Regression for the overlapping-timeout bug: a quick "r 3" then "r 4" dropped
  // the "4" when the second sequence straddled the first sequence's unbind timer.
  await goto(page);
  await page.waitForSelector(".gallery-card");
  const card = pickCard(page);
  await card.scrollIntoViewIfNeeded();

  await openViaMagnifier(page, card);
  expect(await waitForLightbox(page), "lightbox did not open").toBe(true);

  try {
    await pressRating(page, "0");
    await expect.poll(() => starRating(page)).toBe(0);

    // Drive the keys on a fixed clock relative to the first "r" (no polling in
    // between, which would add variable delay). The first "r" schedules a digit
    // unbind at +1000ms; we start the second sequence at +850ms (window still
    // open) and press its digit at ~+1050ms (after the first timer fires). Before
    // the fix, that stale timer unbinds the digits and the "4" is dropped.
    await parkMouse(page);
    await page.keyboard.press("r"); // t = 0
    await page.keyboard.press("3");
    await page.waitForTimeout(850);
    await page.keyboard.press("r"); // t = 850, second sequence
    await page.waitForTimeout(200);
    await page.keyboard.press("4"); // t = 1050, after the first sequence's timer

    await expect.poll(() => starRating(page), "second sequence (r 4) was dropped").toBe(4);
  } finally {
    await pressRating(page, "0");
  }
});
