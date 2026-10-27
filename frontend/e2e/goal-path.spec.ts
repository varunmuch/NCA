import { expect, test } from "@playwright/test";

/**
 * One plan, not two: a career page sends you to My Path instead of building
 * its own roadmap. "Make this my goal" sets the goal. Home is profile-first.
 */

test("a career page links to My Path and has no separate roadmap", async ({ page }) => {
  await page.goto("/explore/software-developers");

  await expect(page.getByRole("heading", { level: 1, name: "Software Developers" })).toBeVisible();
  await expect(page.getByText("Pay, jobs, and how to get started")).toBeVisible();
  await expect(page.getByText("In 30 seconds")).toHaveCount(0);
  await expect(page.getByText(/Roadmap preview/)).toHaveCount(0);

  const path = page.getByRole("link", { name: "Build My Path for this" });
  await expect(path).toHaveAttribute("href", /\/plan\?generate=1&goal=Software/);
});

test("making a career the goal", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Changes the account's goal; runs once.");

  await page.request.put("/api/cie/me/profile", { data: { career_aspiration: "", career_status: "exploring" } });

  await page.goto("/explore/software-developers");
  await page.getByRole("button", { name: "Make this my goal" }).click();
  await expect(page.getByText("Your goal").first()).toBeVisible();
});

test("Home leads with one next step, the profile and My Path", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My Path" })).toBeVisible();
});
