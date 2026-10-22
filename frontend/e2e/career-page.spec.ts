import { expect, test } from "@playwright/test";

/**
 * A career that isn't in the list gets its own page from official job data,
 * the counselor points to it, and "Build my roadmap" starts the roadmap.
 * Makes one real counselor call; the page it creates is shared, as intended.
 */

test("saying 'I want to become an AI Engineer' opens an AI Engineer page with a roadmap", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Runs once.");

  await page.goto("/counselor");
  const composer = page.getByPlaceholder(/Ask anything/);
  await composer.fill("Help me build a roadmap. I want to become an AI Engineer.");
  await composer.press("Enter");

  // The reply ends with the page and its buttons.
  const build = page.getByRole("link", { name: "Build my roadmap" });
  await expect(build).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Open AI Engineer" })).toBeVisible();

  await build.click();
  await expect(page.getByRole("heading", { level: 1, name: "AI Engineer" })).toBeVisible();
  await expect(page.getByText(/AI Engineer is a job title within Computer and Information Research Scientists/)).toBeVisible();
  // Official pay for the occupation, and the roadmap building without another click.
  await expect(page.getByText("Pay, jobs, and how to get started")).toBeVisible();
  // The roadmap starts building on arrival: its first progress line shows.
  await expect(page.getByText("Reading what you've shared…")).toBeVisible();
});
