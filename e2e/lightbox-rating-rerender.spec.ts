/**
 * Regression for a bug introduced by an earlier fix to the "r 3 then r 4"
 * overlapping-timeout issue (#7088 review feedback). That fix cancelled a
 * sequence's pending digit-unbind in the "r"-binding effect's cleanup, but
 * that effect reran on every render of the lightbox (its deps included
 * handlers that close over `setRating`, which the lightbox recreates every
 * render). So *any* unrelated re-render mid-sequence -- not just a second
 * "r" press -- flushed the pending unbind and dropped the digit keys before
 * the 1s window elapsed.
 *
 * This drives that exact path: press "r", trigger a re-render via something
 * that has nothing to do with rating (toggling the options panel), then
 * finish the sequence. Before the fix this drops the rating.
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

async function setRatingSystem(request: APIRequestContext, type: "stars" | "decimal") {
  const res = await request.post(GRAPHQL, {
    data: {
      query: "mutation($p: Map!) { configureUI(partial: $p) }",
      variables: { p: { ratingSystemOptions: { type } } },
    },
  });
  expect(res.ok(), `configureUI(${type}) failed`).toBeTruthy();
}

async function decimalRating(page: Page) {
  await parkMouse(page);
  return (await page.locator(".Lightbox .rating-number span").first().textContent())?.trim();
}

test("an unrelated re-render mid-sequence does not drop the pending digit", async ({
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

    // normalise
    await parkMouse(page);
    await page.keyboard.press("r");
    await page.keyboard.press("`");
    await page.waitForTimeout(500);
    await expect.poll(() => decimalRating(page), "r ` did not clear").toBe("0.0");

    // start a sequence, then force a re-render of the lightbox that has
    // nothing to do with rating (toggle the options panel) before finishing
    // it -- this is the re-render the old effect's cleanup mishandled.
    await page.keyboard.press("r");
    await page.locator(".Lightbox-header-options-icon").click();
    await page.waitForTimeout(100);
    await page.keyboard.press("3");
    await page.keyboard.press("5");
    await page.waitForTimeout(500);

    await expect
      .poll(() => decimalRating(page), "digits were dropped by the intervening re-render")
      .toBe("3.5");

    await page.keyboard.press("r");
    await page.keyboard.press("`");
    await page.waitForTimeout(500);
    await expect.poll(() => decimalRating(page)).toBe("0.0");
  } finally {
    await setRatingSystem(request, "stars");
  }
});
