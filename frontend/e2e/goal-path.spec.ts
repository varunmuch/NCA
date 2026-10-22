import { expect, test } from "@playwright/test";

/**
 * The 30-second card on a career page (official data, no AI), "Make this
 * my goal", and quiz results that stay in the goal's field.
 */

test("a career page opens with the 30-second card and real Florida options", async ({ page }) => {
  await page.goto("/explore/software-developers");

  const card = page.locator("section", { has: page.getByText("In 30 seconds") });
  await expect(card).toBeVisible();
  await expect(card.getByText(/a year/).first()).toBeVisible();
  await expect(card.getByText("University near you")).toBeVisible();
  await expect(card.getByText("Or start at a state college")).toBeVisible();
  await expect(card.getByText("AP Computer Science A", { exact: false })).toBeVisible();
  // An official CareerOneStop video, loaded only when played.
  await expect(card.locator("video source")).toHaveAttribute("src", /cdn\.careeronestop\.org\/.+\.mp4$/);

  // React to each task; the summary appears once all are answered.
  const yes = card.getByRole("button", { name: "Sounds like me" });
  const count = await yes.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await yes.nth(index).click();
  }
  await expect(card.getByText("All of these sound like you.")).toBeVisible();
});

test("making a career the goal keeps quiz results in that field", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Changes the account's goal; runs once.");

  // Start from a different goal so the button is offered.
  await page.request.put("/api/cie/me/profile", { data: { career_aspiration: "", career_status: "exploring" } });

  await page.goto("/explore/software-developers");
  await page.getByRole("button", { name: "Make this my goal" }).click();
  await expect(page.getByText("Your goal").first()).toBeVisible();

  // The seeded account has general quiz results: they now lead with the field.
  await page.goto("/discover?mode=general");
  await expect(page.getByRole("heading", { name: "Careers in your field: Software Developers" })).toBeVisible();
  await expect(page.getByText(/Outside your goal/)).toBeVisible();
});

test("Home shows this week's step from the saved plan, checkable in one tap", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Checks a step off; runs once.");

  await page.goto("/");
  const section = page.locator("section", { has: page.getByText("Your step this week") });
  await expect(section).toBeVisible();

  const box = section.getByRole("checkbox");
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "true");
  await expect(section.getByText("Nice work.")).toBeVisible();
  // Undo, so the account stays as it was.
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "false");
});
