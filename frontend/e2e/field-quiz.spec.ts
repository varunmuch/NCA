import { expect, test } from "@playwright/test";

/**
 * A student with a goal gets a quiz focused on that field, and every career
 * in the results belongs to it. Sets the throwaway account's goal first.
 */

const TECH = /Software|Data|Security|Network|Computer|Web|Video Game|Digital Interface/;

test("a goal of software engineer keeps the quiz and results in software", async ({ page }) => {
  const saved = await page.request.put("/api/cie/me/profile", {
    data: { career_aspiration: "software engineer", career_status: "have_goal" },
  });
  expect(saved.ok()).toBeTruthy();

  await page.goto("/discover");
  await expect(page.getByRole("heading", { name: /^(Find your fit in|Where you fit in) software engineer$/ })).toBeVisible();

  // Taken before (the other screen size ran first): start again.
  const retake = page.getByRole("button", { name: "Retake" });
  if (await retake.isVisible()) {
    await retake.click();
  }

  await expect(page.getByRole("heading", { name: "Find your fit in software engineer" })).toBeVisible();

  // Every career the quiz covers is a technology career.
  const chips = await page.locator("ul li.rounded-full").allInnerTexts();
  expect(chips.length).toBeGreaterThan(2);
  for (const title of chips) {
    expect(title).toMatch(TECH);
  }

  await page.getByRole("button", { name: "Start" }).click();

  for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
    const groups = page.getByRole("radiogroup");
    const count = await groups.count();

    for (let index = 0; index < count; index += 1) {
      await groups.nth(index).getByRole("radio", { name: index % 3 === 0 ? "Strongly like" : "Not sure", exact: true }).click();
    }

    await page.getByRole("button", { name: "Next" }).click();
  }

  const tradeoffs = page.getByRole("button", { name: /^Option A/ });
  while (await tradeoffs.isVisible().catch(() => false)) {
    await tradeoffs.click();
    await page.waitForTimeout(250);
  }

  await page.getByRole("radio", { name: /A four-year degree/ }).click();
  await page.getByRole("button", { name: "See my results" }).click();

  await expect(page.getByRole("heading", { name: "Where you fit in software engineer" })).toBeVisible();
  const results = await page.locator("ol li a[href^='/explore/']").allInnerTexts();
  expect(results.length).toBeGreaterThan(2);
  for (const title of results) {
    expect(title).toMatch(TECH);
  }

  // The general quiz is still one click away.
  await expect(page.getByRole("link", { name: "Take the general quiz" })).toBeVisible();
});
