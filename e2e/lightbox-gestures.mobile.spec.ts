/**
 * Touch-gesture coverage for the gallery lightbox (issue #2538).
 *
 * Runs on the touch projects only (ipad / iphone / pixel — see
 * playwright.config.ts testMatch). Playwright has no high-level swipe/pinch API,
 * so these drive the gestures with locator.dispatchEvent("touch…", { touches })
 * passing plain touch points — Playwright builds engine-correct Touch objects,
 * which works on WebKit too (a literal `new Touch()` throws there). The events
 * feed the component's onTouchStart/Move/End handlers. See
 * https://playwright.dev/docs/touch-events.
 *
 * Non-destructive: the swipe-up case opens the delete dialog and cancels — it
 * never confirms a delete against the durable dev instance.
 */
import {
  test,
  expect,
  goto,
  closeLightbox,
  lightboxOpen,
  tapScrubber,
  waitForLightbox,
} from "./lib";
import type { Locator, Page } from "@playwright/test";

// The carousel offsets by `left: {index * -100}vw`, so its inline style is a
// fixture-independent indicator of which image is shown.
function carouselLeft(page: Page) {
  return page.locator(".Lightbox-carousel").getAttribute("style");
}

async function openLightbox(page: Page) {
  await goto(page);
  await page.waitForSelector(".gallery-card");
  const card = page
    .locator(".gallery-card")
    .filter({ has: page.locator(".hover-scrubber-area") })
    .first();
  await card.scrollIntoViewIfNeeded();
  await tapScrubber(page, card);
  expect(await waitForLightbox(page), "lightbox did not open").toBe(true);
  // wait for the centered image to have laid out (gesture geometry needs it)
  await page.waitForFunction(() => {
    const img = document.querySelector(
      ".Lightbox-carousel-image img, .Lightbox-carousel-image video"
    ) as HTMLElement | null;
    return !!img && img.getBoundingClientRect().width > 0;
  });
  await page.waitForTimeout(300);
}

// A single touch point. We avoid constructing `Touch`/`TouchEvent` in-page
// (WebKit throws "Illegal constructor"); instead we hand plain objects to
// locator.dispatchEvent and let Playwright build engine-correct Touch objects.
// See https://playwright.dev/docs/touch-events. The component reads pageX/pageY,
// so set them alongside clientX/Y. (dispatchEvent leaves isTrusted false; the
// lightbox handlers don't check it.)
type TouchPoint = {
  identifier: number;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
};

function point(id: number, x: number, y: number): TouchPoint {
  return { identifier: id, clientX: x, clientY: y, pageX: x, pageY: y };
}

// Locator for the carousel image nearest the viewport centre (the current one).
async function centerImage(page: Page): Promise<Locator> {
  const imgs = page.locator(
    ".Lightbox-carousel-image img, .Lightbox-carousel-image video"
  );
  const count = await imgs.count();
  const vw = page.viewportSize()?.width ?? 0;
  let bestIndex = 0;
  let best = Infinity;
  for (let i = 0; i < count; i++) {
    const box = await imgs.nth(i).boundingBox();
    if (!box) continue;
    const d = Math.abs(box.x + box.width / 2 - vw / 2);
    if (d < best) {
      best = d;
      bestIndex = i;
    }
  }
  return imgs.nth(bestIndex);
}

/**
 * Dispatch a touch gesture on the centered carousel image. `fingers` touches
 * start at its centre and travel `(dx,dy)` over `steps` touchmoves; a
 * single-finger zero-distance gesture is a tap. Extra fingers are spread 40px
 * apart so a 2-finger gesture is distinct from a 1-finger one.
 */
async function dispatchGesture(
  page: Page,
  dx: number,
  dy: number,
  fingers: number,
  steps: number
) {
  const loc = await centerImage(page);
  const box = await loc.boundingBox();
  if (!box) throw new Error("carousel image has no bounding box");
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;

  const at = (fx: number, fy: number) =>
    Array.from({ length: fingers }, (_, f) => point(f, fx + f * 40, fy));

  const start = at(x0, y0);
  await loc.dispatchEvent("touchstart", {
    touches: start,
    changedTouches: start,
    targetTouches: start,
  });

  for (let s = 1; s <= steps; s++) {
    const moved = at(x0 + (dx * s) / steps, y0 + (dy * s) / steps);
    await loc.dispatchEvent("touchmove", {
      touches: moved,
      changedTouches: moved,
      targetTouches: moved,
    });
  }

  const end = [point(0, x0 + dx, y0 + dy)];
  await loc.dispatchEvent("touchend", {
    touches: [],
    changedTouches: end,
    targetTouches: [],
  });
}

const swipe = (page: Page, dx: number, dy: number) =>
  dispatchGesture(page, dx, dy, 1, 6);
const tap = (page: Page) => dispatchGesture(page, 0, 0, 1, 0);
const twoFingerSwipe = (page: Page, dx: number, dy: number) =>
  dispatchGesture(page, dx, dy, 2, 6);

// transform of the centered image's transform-carrying child (carries the zoom
// scale + pan). The Safari aspect-ratio fix moves this from a <picture> onto a
// `.Lightbox-carousel-image-wrapper` <div>; accept either so the spec runs
// against a build with or without that fix.
function centerTransform(page: Page) {
  return page.evaluate(() => {
    const pics = Array.from(
      document.querySelectorAll(
        ".Lightbox-carousel-image-wrapper, .Lightbox-carousel-image picture"
      )
    ) as HTMLElement[];
    const cx = window.innerWidth / 2;
    let el = pics[0];
    let best = Infinity;
    for (const p of pics) {
      const r = p.getBoundingClientRect();
      const d = Math.abs((r.left + r.right) / 2 - cx);
      if (d < best) {
        best = d;
        el = p;
      }
    }
    return el?.style.transform ?? "";
  });
}

test.beforeEach(async ({ page }) => {
  await openLightbox(page);
});

test("swipe left/right navigates between images", async ({ page }) => {
  const atStart = await carouselLeft(page);

  await swipe(page, -150, 0); // swipe left -> next image
  await page.waitForTimeout(400);
  const afterNext = await carouselLeft(page);
  expect(afterNext, "swipe left did not advance to the next image").not.toBe(
    atStart
  );

  await swipe(page, 150, 0); // swipe right -> previous image
  await page.waitForTimeout(400);
  expect(await carouselLeft(page), "swipe right did not go back").toBe(atStart);

  await closeLightbox(page);
});

test("swipe up opens the delete dialog (cancelled, no delete)", async ({
  page,
}) => {
  const atStart = await carouselLeft(page);

  await swipe(page, 0, -180); // swipe up
  const modal = page.locator(".modal");
  await expect(modal, "swipe up did not open the delete dialog").toBeVisible({
    timeout: 3000,
  });

  // cancel — never delete on the durable dev instance
  await modal.getByRole("button", { name: /cancel/i }).click();
  await expect(modal).toBeHidden({ timeout: 3000 });
  expect(await carouselLeft(page), "image changed after cancel").toBe(atStart);

  await closeLightbox(page);
});

test("swipe down closes the lightbox", async ({ page }) => {
  expect(await lightboxOpen(page), "lightbox not open at start").toBe(true);

  await swipe(page, 0, 180); // swipe down -> close

  await page
    .waitForSelector(".Lightbox", { state: "detached", timeout: 3000 })
    .catch(() => {});
  expect(
    await lightboxOpen(page),
    "swipe down did not close the lightbox"
  ).toBe(false);
});

test("double-tap toggles zoom", async ({ page }) => {
  const fit = await centerTransform(page);

  await tap(page);
  await tap(page); // double-tap -> zoom in
  await page.waitForTimeout(300);
  const zoomed = await centerTransform(page);
  expect(zoomed, "double-tap did not zoom in").not.toBe(fit);

  await tap(page);
  await tap(page); // double-tap -> back to fit
  await page.waitForTimeout(300);
  expect(await centerTransform(page), "double-tap did not reset zoom").toBe(fit);

  await closeLightbox(page);
});

test("while zoomed in, a horizontal drag pans instead of navigating", async ({
  page,
}) => {
  const atStart = await carouselLeft(page);

  // zoom in first
  await tap(page);
  await tap(page);
  await page.waitForTimeout(300);
  const zoomed = await centerTransform(page);

  await swipe(page, -120, 0); // horizontal drag while zoomed
  await page.waitForTimeout(300);

  expect(await carouselLeft(page), "a zoomed drag changed the image").toBe(
    atStart
  );
  expect(await centerTransform(page), "a zoomed drag did not pan").not.toBe(
    zoomed
  );

  await closeLightbox(page);
});

test("a two-finger horizontal drag does not navigate", async ({ page }) => {
  const atStart = await carouselLeft(page);

  await twoFingerSwipe(page, -150, 0);
  await page.waitForTimeout(400);

  expect(
    await carouselLeft(page),
    "a two-finger gesture navigated (single-finger guard failed)"
  ).toBe(atStart);

  await closeLightbox(page);
});
