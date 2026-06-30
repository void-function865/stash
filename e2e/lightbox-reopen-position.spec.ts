/**
 * OPEN BUG (not yet fixed) — in-SPA close + reopen lands on the PREVIOUS image.
 *
 * Closing the lightbox and reopening it by clicking a card WITHOUT a full page
 * reload reopens on the image that was showing before the close, not the clicked
 * card. With the gallery grid kept mounted, the LightboxComponent instance (and
 * its index/page state) persists across close, and the reopen does not reset the
 * index to the clicked card's initialIndex.
 *
 * Surfaced 2026-06-30 while building the page-boundary repro. Reproduces on the
 * shipped void build too, so it predates and is independent of the page-number
 * settle fix (the backward-wrap "40/77" bug, covered by void-boundary.spec.ts).
 * The full-reload reopen path (page.goto) lands correctly — a remount resets the
 * refs — so this is specific to the in-SPA reopen.
 *
 * Marked test.fixme: it documents the bug and is skipped from the pass/fail gate.
 * Flip it to `test(...)` in a fresh debugging session (it should fail at the
 * "1 / 77" assertion, showing "41 / 77").
 */
import { test, expect, waitForLightbox, parkMouse, closeLightbox } from "./lib";
import type { Page } from "@playwright/test";

const indicator = (page: Page) => page.locator(".Lightbox-header-indicator b");
const card = (page: Page, nth: number) => page.locator(".image-card img").nth(nth);

async function openCard(page: Page, nth: number): Promise<void> {
  await expect(async () => {
    await card(page, nth).click({ timeout: 8000 });
    expect(await waitForLightbox(page, 2500)).toBe(true);
  }).toPass({ timeout: 20_000 });
  await parkMouse(page);
}

test.fixme("in-SPA close+reopen opens the clicked card, not the previous image", async ({
  page,
}) => {
  // Load the gallery grid ONCE; everything below stays in the same SPA session
  // (no page.goto), so the Lightbox instance + its index/page state persist.
  await page.goto("/galleries/17", { waitUntil: "domcontentloaded" });
  await card(page, 0).waitFor();
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  // Open at the 40th image of page 1, cross forward to page 2, then close.
  await openCard(page, 39);
  await expect(indicator(page)).toHaveText("40 / 77");
  await page.keyboard.press("ArrowRight");
  await parkMouse(page);
  await expect(indicator(page)).toHaveText("41 / 77");
  await closeLightbox(page);

  // Reopen by clicking the FIRST card (no reload). It must open at 1/77 — the
  // bug reopens at 41/77 (the image shown before the close).
  await openCard(page, 0);
  await expect(indicator(page)).toHaveText("1 / 77");
});
