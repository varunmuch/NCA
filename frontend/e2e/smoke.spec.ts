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
  await expect(page.getByText("Your next step", { exact: true })).toBeVisible();
  await context.close();
});

test("interest quiz can be taken start to finish", async ({ page }) => {
  await page.goto("/discover");

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

  // Part 6: the quiz reads the student's records and asks only what's missing.
  await expect(page.getByRole("heading", { name: "A few questions about you" })).toBeVisible();
  await page.getByPlaceholder(/Computer Science, Nursing/).fill("Computer Science");
  await page.getByRole("button", { name: "See my major and minor" }).click();

  await expect(page.getByText("Your interest code")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Your major and minor" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Option 1/ })).toBeVisible();
  await expect(page.getByText("est. chance").first()).toBeVisible();
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
  await page.getByRole("tab", { name: "Classes" }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await page.getByRole("tab", { name: "Major, colleges & scholarships" }).click();
  await expect(page.getByRole("heading", { name: /Other routes after high school|Florida colleges and universities/ }).first()).toBeVisible();
  await page.getByRole("tab", { name: "This month" }).click();
  await expect(page.getByRole("heading", { name: "Your next 3 steps this month" })).toBeVisible();
});

test("community hours: see places, log hours, remove them", async ({ page }) => {
  await page.goto("/plan");
  await page.locator('a[href^="/plan/"]').first().click();
  await page.getByRole("tab", { name: "Community hours" }).click();

  await expect(page.getByRole("heading", { name: "Places to earn hours near NeoCity" })).toBeVisible();
  const total = page.locator("#hours-total + p");
  const before = Number((await total.innerText()).match(/\d+/)?.[0]);

  await page.getByRole("button", { name: "Log hours here" }).first().click();
  await page.getByRole("spinbutton", { name: "Hours" }).fill("3");
  await page.getByRole("button", { name: "Add hours" }).click();
  await expect(total).toContainText(String(before + 3));

  await page.getByRole("button", { name: /^Remove 3 hours/ }).first().click();
  await expect(total).toContainText(String(before));
});

test("the counselor acts on a request and says what it did", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Adds a checklist step; runs once.");

  await page.goto("/counselor");
  const composer = page.getByPlaceholder(/Ask anything/);
  await composer.fill("Please add visit the UCF campus to my plan");
  await composer.press("Enter");

  const card = page.locator("div", { has: page.getByText("What I did", { exact: true }) }).last();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByText(/visit the UCF campus/i)).toBeVisible();

  // Home lists it as something the counselor did.
  await page.goto("/");
  await expect(page.getByText(/Added to your checklist: visit the UCF campus/i)).toBeVisible();
});

test("the floating counselor explains the plan from the page it's on", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "One real counselor call.");

  await page.goto("/plan");
  await page.locator('a[href^="/plan/"]').first().click();
  await page.getByRole("button", { name: "Chat with your counselor" }).click();

  const widget = page.getByRole("region", { name: "Chat with your counselor" });
  await expect(widget.getByText(/Looking at My Path/)).toBeVisible();
  await widget.getByRole("button", { name: "Why are these colleges in my plan?" }).click();
  await expect(widget.locator(".prose-chat").last()).toContainText(/\w+/, { timeout: 60_000 });
  await page.screenshot({ path: "e2e/screenshots/widget.png" });

  // The full counselor page has no bubble.
  await page.goto("/counselor");
  await expect(page.getByRole("button", { name: "Chat with your counselor" })).toHaveCount(0);
});

test("scrolling up while a reply streams keeps your place", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "One real counselor call.");
  test.setTimeout(120_000);

  await page.goto("/explore");
  await page.getByRole("button", { name: "Chat with your counselor" }).click();
  const widget = page.getByRole("region", { name: "Chat with your counselor" });
  const box = widget.getByRole("textbox").first();
  await box.fill("Explain in detail, with many paragraphs, how I can become a software engineer from 9th grade through college.");
  await box.press("Enter");

  const scroller = widget.locator("[tabindex='-1'].overflow-y-auto");
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight), { timeout: 60_000 }).toBeGreaterThan(250);
  await scroller.hover();
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(300);
  const held = await scroller.evaluate((el) => el.scrollTop);
  await page.waitForTimeout(3000);
  expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - held)).toBeLessThan(5);
});

test("asking the counselor to open the quiz takes you there", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "One real counselor call.");

  await page.goto("/");
  await page.getByRole("button", { name: "Chat with your counselor" }).click();
  const widget = page.getByRole("region", { name: "Chat with your counselor" });
  await widget.getByLabel("Message your counselor").fill("Can you open the quiz for me? I want to retake it");
  await widget.getByLabel("Message your counselor").press("Enter");

  await page.waitForURL(/\/discover/, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
});
