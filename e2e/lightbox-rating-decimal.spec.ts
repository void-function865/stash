/**
 * Lightbox image rating shortcuts under the *decimal* rating system (issue #5616).
 *
 * With the decimal system the shortcut is `r` then two digits (e.g. `r 3 5` =>
 * 3.5), and `` r ` `` clears it. This flips the instance's rating system to
 * decimal for the duration of the test (deep-merged via configureUI) and restores
 * it to stars in `finally`, so it is self-contained and re-runnable. Ratings are
 * persistent, so it normalises to unset first and clears again at the end.
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
import type { Page, APIRequestContext } from "@playwright/test";

const GRAPHQL = "http://localhost:9999/graphql";

function pickCard(page: Page) {
  return page
    .locator(".gallery-card")
    .filter({ has: page.locator(".preview-button") })
    .first();
}

/** Deep-merge the instance's rating system (stars|decimal) via configureUI. */
async function setRatingSystem(request: APIRequestContext, type: "stars" | "decimal") {
  const res = await request.post(GRAPHQL, {
    data: {
      query: "mutation($p: Map!) { configureUI(partial: $p) }",
      variables: { p: { ratingSystemOptions: { type } } },
    },
  });
  expect(res.ok(), `configureUI(${type}) failed`).toBeTruthy();
}

/** Press "r" then the given keys, letting the mutation + re-render settle. */
async function pressRating(page: Page, ...keys: string[]) {
  await parkMouse(page);
  await page.keyboard.press("r");
  for (const k of keys) await page.keyboard.press(k);
  await page.waitForTimeout(500);
}

/** The decimal rating shown in the lightbox footer, e.g. "3.5" / "0.0". */
async function decimalRating(page: Page) {
  await parkMouse(page);
  return (await page.locator(".Lightbox .rating-number span").first().textContent())?.trim();
}

test("decimal system: r + two digits sets a decimal rating, and it persists", async ({
  page,
  request,
}) => {
  await setRatingSystem(request, "decimal");
  try {
    await goto(page);
    await page.waitForSelector(".gallery-card");
    const card = pickCard(page);
    await card.scrollIntoViewIfNeeded();

    await openViaMagnifier(page, card);
    expect(await waitForLightbox(page), "lightbox did not open").toBe(true);

    // sanity: the footer is rendering the decimal control, not stars
    await expect(page.locator(".Lightbox .rating-number")).toBeVisible();

    // normalise: clear any residual rating ( ` clears in decimal mode )
    await pressRating(page, "`");
    await expect.poll(() => decimalRating(page), "r ` did not clear").toBe("0.0");

    // set 3.5 via "r 3 5"
    await pressRating(page, "3", "5");
    await expect.poll(() => decimalRating(page), "r 3 5 did not set 3.5").toBe("3.5");

    // persisted server-side: reopen and re-read
    await closeLightbox(page);
    await openViaMagnifier(page, card);
    expect(await waitForLightbox(page), "lightbox did not reopen").toBe(true);
    await expect.poll(() => decimalRating(page), "decimal rating did not persist").toBe("3.5");

    // clear again so re-runs start clean
    await pressRating(page, "`");
    await expect.poll(() => decimalRating(page)).toBe("0.0");
  } finally {
    await setRatingSystem(request, "stars");
  }
});
