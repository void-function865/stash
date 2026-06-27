/**
 * Regression coverage for the lightbox keyboard shortcuts that the rating change
 * touched (issue #5616). Moving ratings + "d d" onto a lightbox-scoped Mousetrap
 * instance must not disturb the existing arrow / Escape navigation, the "d d"
 * delete shortcut, or the suppression of global shortcuts while the overlay is up.
 *
 * These are read-only/non-destructive (the delete dialog is opened then cancelled).
 */
import {
  test,
  expect,
  goto,
  closeLightbox,
  openViaMagnifier,
  waitForLightbox,
  parkMouse,
} from "./lib";
import type { Page } from "@playwright/test";

function pickCard(page: Page) {
  return page
    .locator(".gallery-card")
    .filter({ has: page.locator(".preview-button") })
    .first();
}

async function openLightbox(page: Page) {
  await goto(page);
  await page.waitForSelector(".gallery-card");
  const card = pickCard(page);
  await card.scrollIntoViewIfNeeded();
  await openViaMagnifier(page, card);
  expect(await waitForLightbox(page), "lightbox did not open").toBe(true);
}

// The carousel offsets by `left: {index * -100}vw`, so its inline style is a
// fixture-independent indicator of which image is shown.
function carouselLeft(page: Page) {
  return page.locator(".Lightbox-carousel").getAttribute("style");
}

test("ArrowRight / ArrowLeft navigate between images", async ({ page }) => {
  await openLightbox(page);
  await parkMouse(page);

  const atStart = await carouselLeft(page);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  const afterRight = await carouselLeft(page);
  expect(afterRight, "ArrowRight did not change the displayed image").not.toBe(atStart);

  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  expect(await carouselLeft(page), "ArrowLeft did not return to the first image").toBe(atStart);

  await closeLightbox(page);
});

test("Escape closes the lightbox", async ({ page }) => {
  await openLightbox(page);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".Lightbox", { state: "detached", timeout: 3000 });
  expect(await page.locator(".Lightbox").count()).toBe(0);
});

test("d d opens the delete dialog (cancelled without deleting)", async ({ page }) => {
  await openLightbox(page);
  await parkMouse(page);

  await page.keyboard.press("d");
  await page.keyboard.press("d");

  const modal = page.locator(".modal");
  await expect(modal, "d d did not open the delete dialog").toBeVisible({ timeout: 3000 });

  // cancel — do NOT delete anything on the durable dev instance
  await modal.getByRole("button", { name: /cancel/i }).click();
  await expect(modal).toBeHidden({ timeout: 3000 });

  await closeLightbox(page);
});

test("global shortcuts stay inert while the lightbox is open", async ({ page }) => {
  await openLightbox(page);
  await parkMouse(page);

  const before = page.url();
  // `g s` is the global "go to Scenes" shortcut; the lightbox pauses the global
  // Mousetrap instance, so it must not navigate while the overlay is up.
  await page.keyboard.press("g");
  await page.keyboard.press("s");
  await page.waitForTimeout(400);

  expect(page.url(), "a global shortcut navigated while the lightbox was open").toBe(before);
  expect(await page.locator(".Lightbox").count(), "lightbox closed unexpectedly").toBeGreaterThan(0);

  await closeLightbox(page);
});
