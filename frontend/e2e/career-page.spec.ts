import { expect, test } from "@playwright/test";

/**
 * A career that isn't in the list gets its own page from official job data,
 * the counselor points to it, and offers to build My Path for it in the chat.
 * Makes one real counselor call; the page it creates is shared, as intended.
 */

test("saying 'I want to become an AI Engineer' offers an AI Engineer page and My Path", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Runs once.");

  await page.goto("/counselor");
  const composer = page.getByPlaceholder(/Ask anything/);
  await composer.fill("Help me build a roadmap. I want to become an AI Engineer.");
  await composer.press("Enter");

  // The reply ends with the page and its buttons.
  const build = page.getByRole("button", { name: "Build My Path" }).first();
  await expect(build).toBeVisible({ timeout: 60_000 });
  const open = page.getByRole("link", { name: "Open AI Engineer" });
  await expect(open).toBeVisible();

  await open.click();
  await expect(page.getByRole("heading", { level: 1, name: "AI Engineer" })).toBeVisible();
  await expect(page.getByText(/AI Engineer is a job title within Computer and Information Research Scientists/)).toBeVisible();
  await expect(page.getByText("Pay, jobs, and how to get started")).toBeVisible();
});
