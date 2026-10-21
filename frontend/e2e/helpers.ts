import { expect, type Page } from "@playwright/test";

export const account = {
  email: process.env.E2E_EMAIL ?? "",
  password: process.env.E2E_PASSWORD ?? "",
};

/** Sign in through the real login form, the way a student does. */
export async function signIn(page: Page) {
  if (!account.email || !account.password) {
    throw new Error("Set E2E_EMAIL and E2E_PASSWORD (see backend/scripts/ui_test_account.py).");
  }

  await page.goto("/login");
  await page.locator('input[name="email"]').first().fill(account.email);
  await page.locator('input[name="password"]').first().fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Pages that need a signed-in student: the session comes from auth.setup.ts. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page).not.toHaveURL(/\/login/);
}
