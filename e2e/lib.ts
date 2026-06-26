/**
 * Shared fixtures and page helpers for the Stash web-UI end-to-end tests.
 *
 * The @playwright/test runner owns the browser/context/trace lifecycle (see
 * playwright.config.ts), so this file is just: an `errors` fixture (console +
 * page errors) and the gallery page helpers.
 *
 * Run:  pnpm test            (drives http://localhost:3000, the vite dev server)
 *       STASH_BASE=http://localhost:9999 pnpm test   (drives a running instance)
 *
 * On failure the HTML report + trace (pnpm report) is the replayable evidence.
 */
import { test as base, expect, type Locator, type Page } from "@playwright/test";

/**
 * `errors` accumulates console errors/warnings and uncaught page errors seen
 * during the test — read it after driving, an empty list is a good sign.
 *
 * This is *informational*: collected but not auto-asserted, because the dev
 * server emits benign React/Apollo warnings. A spec that wants to gate on it
 * does `expect(errors).toEqual([])` itself.
 */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      const t = m.type();
      if (t === "error" || t === "warning") errors.push(`[${t}] ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`[pageerror] ${e}`));
    await use(errors);
  },
});

export { expect };

export async function goto(page: Page, path = "/galleries?sortby=path"): Promise<void> {
  // baseURL (STASH_BASE) is applied by the config; path is relative.
  // domcontentloaded, not networkidle: image-heavy pages (and cold-cache cover
  // generation) keep the network busy long past usability, and networkidle
  // there blows the per-test timeout. Callers wait for a concrete element next.
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

/** Instantaneous predicate. Races the React mount — for assertions right after
 * an open/reopen use waitForLightbox(), which waits. */
export async function lightboxOpen(page: Page): Promise<boolean> {
  return (await page.locator(".Lightbox").count()) > 0;
}

/** Wait for the lightbox to actually mount and settle past the empty loading
 * state (the gallery lightbox briefly shows no content while the lazy query
 * resolves). Use this, not lightboxOpen(), to assert an open. */
export async function waitForLightbox(page: Page, timeout = 6000): Promise<boolean> {
  try {
    await page.waitForSelector(".Lightbox", { timeout });
    await page.waitForTimeout(400);
    return (await page.locator(".Lightbox").count()) > 0;
  } catch {
    return false;
  }
}

/** Move the cursor to the top-left corner, away from cards and the lightbox
 * footer. Two reasons: (1) the hover-scrubber only re-arms on a *fresh* trusted
 * mousemove, so the cursor must leave the card before reopening — a bare
 * re-hover() while it never left is a no-op; (2) hovering the rating stars
 * changes the displayed value, so reads must happen with the mouse off them. */
export async function parkMouse(page: Page): Promise<void> {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
}

/** Number of fully-filled stars in the lightbox footer (the persisted rating).
 * Parks the mouse first so footer hover doesn't skew the read. */
export async function starRating(page: Page): Promise<number> {
  await parkMouse(page);
  return page.locator(".Lightbox .rating-stars button.star-fill-100").count();
}

/** Click the n-th rating star in the lightbox footer (1-based). */
export async function setStarRating(page: Page, n: number): Promise<void> {
  const btn = page.locator(".Lightbox .rating-stars button").nth(n - 1);
  await btn.hover();
  await btn.click();
  await page.waitForTimeout(500); // mutation + re-render settle
}

export async function closeLightbox(page: Page): Promise<void> {
  const btn = page
    .locator(".Lightbox button")
    .filter({ has: page.locator("svg[data-icon=times], svg[data-icon=xmark]") });
  if ((await btn.count()) > 0) {
    await btn.first().click();
    await page.waitForSelector(".Lightbox", { state: "detached", timeout: 3000 });
  }
}

/** Open the gallery lightbox by clicking the card's hover-scrubber slider.
 *
 * Parks the mouse first (so a reopen gets a fresh trusted mousemove that re-arms
 * the scrubber), hovers, then clicks at a real pixel offset so the trusted event
 * carries a correct offsetX — this is the path that exposed the reopen bug; a
 * synthetic .click() does not.
 *
 * NB: a non-zero `fraction` opens a *mid-gallery* image, while openViaMagnifier
 * opens index 0. Don't compare per-image state across the two entry points
 * unless you account for that. */
export async function openViaScrubber(page: Page, card: Locator, fraction = 0.6): Promise<void> {
  await parkMouse(page);
  const area = card.locator(".hover-scrubber-area");
  await area.hover();
  const box = await area.boundingBox();
  if (!box) throw new Error("hover-scrubber-area has no bounding box");
  await area.click({ position: { x: box.width * fraction, y: box.height / 2 } });
}

/** Open the gallery lightbox at index 0 via the cover magnifier button. */
export async function openViaMagnifier(page: Page, card: Locator): Promise<void> {
  await parkMouse(page);
  await card.locator(".preview-button button").click();
}

// --- Touch variants (mobile/tablet projects, hasTouch) -----------------------
// Touch contexts have no hover, so the desktop open helpers above don't apply.
// HoverScrubber.tsx handles onTouchMove/onTouchEnd, so a tap at a pixel offset
// opens the lightbox at the scrubbed position. tap() requires hasTouch (set by
// the mobile device descriptors). No parkMouse — there's no resting cursor.

/** Touch equivalent of openViaScrubber: tap the card's scrubber at a pixel
 * offset (fraction across its width). This is the reliable touch entry point —
 * note that tapping a gallery *detail* image instead navigates to the image
 * detail page (the lightbox onClick yields to the anchor on touch). */
export async function tapScrubber(page: Page, card: Locator, fraction = 0.6): Promise<void> {
  const area = card.locator(".hover-scrubber-area");
  const box = await area.boundingBox();
  if (!box) throw new Error("hover-scrubber-area has no bounding box");
  await area.tap({ position: { x: box.width * fraction, y: box.height / 2 } });
}
