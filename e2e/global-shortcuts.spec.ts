/**
 * Regression coverage for shortcuts OUTSIDE the lightbox, to make sure the
 * `useRatingKeybinds` changes (new optional Mousetrap-instance param + the
 * cancel-and-reschedule unbind timer) did not break the scene/image detail pages
 * — which use the hook with the *default* (global) Mousetrap — or global nav.
 *
 * Targets fixed ids on the dev instance: scene 4, image 1. Stars rating system.
 * Ratings persist, so each test normalises to 0 and resets to 0 in teardown.
 */
import { test, expect, goto } from "./lib";
import type { Page } from "@playwright/test";

/** Filled stars in the (single) detail-page rating control. Parks the mouse so
 * hover-preview doesn't skew the read. */
async function pageStarRating(page: Page) {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
  return page.locator(".rating-stars button.star-fill-100").count();
}

async function pressRating(page: Page, ...keys: string[]) {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(150);
  await page.keyboard.press("r");
  for (const k of keys) await page.keyboard.press(k);
  await page.waitForTimeout(500);
}

test("global navigation shortcuts still route", async ({ page }) => {
  await goto(page); // galleries
  await page.waitForSelector(".gallery-card");
  await page.mouse.move(5, 5);

  for (const [key, re] of [
    ["s", /\/scenes(\b|\/|\?|$)/],
    ["i", /\/images(\b|\/|\?|$)/],
    ["p", /\/performers(\b|\/|\?|$)/],
    ["u", /\/studios(\b|\/|\?|$)/],
  ] as const) {
    await page.keyboard.press("g");
    await page.keyboard.press(key);
    await page.waitForURL(re, { timeout: 5000 });
  }
});

test("rating shortcut works on the scene detail page", async ({ page }) => {
  await page.goto("/scenes/4", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".scene-toolbar .rating-stars", { timeout: 15000 });
  try {
    await pressRating(page, "0");
    await expect.poll(() => pageStarRating(page)).toBe(0);

    await pressRating(page, "3");
    await expect.poll(() => pageStarRating(page), "scene r 3 did not set 3 stars").toBe(3);
  } finally {
    await pressRating(page, "0");
  }
});

test("rating shortcut works on the image detail page", async ({ page }) => {
  await page.goto("/images/1", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".rating-stars", { timeout: 15000 });
  try {
    await pressRating(page, "0");
    await expect.poll(() => pageStarRating(page)).toBe(0);

    await pressRating(page, "4");
    await expect.poll(() => pageStarRating(page), "image r 4 did not set 4 stars").toBe(4);
  } finally {
    await pressRating(page, "0");
  }
});

test("the cancel-and-reschedule unbind fix also applies on a detail page", async ({ page }) => {
  await page.goto("/images/1", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".rating-stars", { timeout: 15000 });
  try {
    await pressRating(page, "0");
    await expect.poll(() => pageStarRating(page)).toBe(0);

    // second sequence straddles the first sequence's 1s unbind timer
    await page.mouse.move(5, 5);
    await page.keyboard.press("r"); // t = 0
    await page.keyboard.press("3");
    await page.waitForTimeout(850);
    await page.keyboard.press("r"); // t = 850
    await page.waitForTimeout(200);
    await page.keyboard.press("4"); // t = 1050

    await expect.poll(() => pageStarRating(page), "second sequence (r 4) was dropped").toBe(4);
  } finally {
    await pressRating(page, "0");
  }
});
