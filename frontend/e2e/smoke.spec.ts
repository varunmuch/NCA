import { expect, test } from "@playwright/test";

import { account, signIn } from "./helpers";

/**
 * Smoke tests for the main student paths, against the running app with a
 * throwaway account (backend/scripts/ui_test_account.py create --seed).
 * The chat test makes one real counselor call.
 */

test.describe.configure({ mode: "serial" });

test("sign-in rejects a wrong password and accepts the right one", async ({ browser }, info) => {
  // Only once (desktop): each attempt counts toward the app's sign-in limit.
  test.skip(info.project.name !== "desktop", "Runs once.");
  // A fresh, signed-out browser.
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator('input[name="email"]').first().fill(account.email);
  await page.locator('input[name="password"]').first().fill(`${account.password}-wrong`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);

  await signIn(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
  await expect(page.getByText("Your next step")).toBeVisible();
  await context.close();
});

test("interest quiz can be taken start to finish", async ({ page }) => {
  // The general quiz (a student with a goal gets the focused one by default).
  await page.goto("/discover?mode=general");

  // Wait for the quiz to load: results (seeded account) or the intro.
  await expect(page.getByRole("button", { name: /^(Retake|Start)$/ })).toBeVisible();

  const retake = page.getByRole("button", { name: "Retake" });

  if (await retake.isVisible()) {
    await retake.click();
  }

  await page.getByRole("button", { name: "Start" }).click();

  // Part 1: rate every activity, page by page.
  for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
    const groups = page.getByRole("radiogroup");
    const count = await groups.count();

    for (let index = 0; index < count; index += 1) {
      await groups.nth(index).getByRole("radio", { name: "Like", exact: true }).click();
    }

    await page.getByRole("button", { name: "Next" }).click();
  }

  // Part 2: 15 trade-offs.
  for (let index = 0; index < 15; index += 1) {
    await page.getByRole("button", { name: /^Option A/ }).click();
    await page.waitForTimeout(250);
  }

  // Parts 3 and 4 are optional; part 5 needs a choice.
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("radio", { name: /Not sure yet/ }).click();
  await page.getByRole("button", { name: "See my results" }).click();

  await expect(page.getByText("Your interest code")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^(Careers that fit|Careers in your field)/ })).toBeVisible();
});

test("chat streams a reply", async ({ page }) => {
  await page.goto("/counselor");

  const composer = page.getByPlaceholder(/Ask anything/);
  await composer.fill("I like drawing and computers. What could I look into?");
  await composer.press("Enter");

  await expect(page.getByText("I like drawing and computers. What could I look into?")).toBeVisible();

  // While the counselor writes, the page announces it to screen readers;
  // the announcement goes away when the reply is saved.
  const writing = page.getByText("Your counselor is writing");
  const reply = page.locator(".prose-chat").last();

  await expect(writing.first()).toBeAttached();
  // Streaming: reply text shows up before the reply is finished.
  await expect(reply).toContainText(/\w{3,}/, { timeout: 30_000 });
  await expect(writing).toHaveCount(0, { timeout: 60_000 });
  expect((await reply.innerText()).length).toBeGreaterThan(40);
});

test("career search corrects a typo", async ({ page }) => {
  await page.goto("/explore");
  await page.locator("#career-search").fill("enginer");

  await expect(page.getByText(/Showing results for/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Engineers/ }).first()).toBeVisible();
});

test("plan shows the next 3 steps and they can be checked off", async ({ page }) => {
  await page.goto("/plan");
  await page.locator('a[href^="/plan/"]').first().click();

  await expect(page.getByRole("heading", { name: "Your next 3 steps this month" })).toBeVisible();

  const first = page.getByRole("checkbox").first();
  await first.click();
  await expect(first).toHaveAttribute("aria-checked", "true");
  await first.click();
  await expect(first).toHaveAttribute("aria-checked", "false");

  // My Path: one page, in tabs.
  await page.getByRole("tab", { name: "High school" }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await page.getByRole("tab", { name: "College" }).click();
  await expect(page.getByRole("heading", { name: /Other routes after high school|Florida colleges and universities/ }).first()).toBeVisible();
  await page.getByRole("tab", { name: "This month" }).click();
  await expect(page.getByRole("heading", { name: "Your next 3 steps this month" })).toBeVisible();
});
