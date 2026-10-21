import { test } from "@playwright/test";


/**
 * Full-page screenshots of the key pages, for before/after comparison.
 * Saved to e2e/screenshots/<SHOTS_LABEL>/<project>-<page>.png.
 * Run only when SHOTS_LABEL is set:
 *   SHOTS_LABEL=before npx playwright test screenshots
 */

const PAGES = [
  ["home", "/"],
  ["counselor", "/counselor"],
  ["quiz", "/discover"],
  ["explore", "/explore"],
  ["career", "/explore/registered-nurses"],
  ["plan-list", "/plan"],
] as const;

test.skip(!process.env.SHOTS_LABEL, "Set SHOTS_LABEL to take screenshots.");

test("key pages", async ({ page }, info) => {

  const shot = async (name: string) => {
    await page.waitForLoadState("networkidle");
    // Let entrance animations settle.
    await page.waitForTimeout(800);
    await page.screenshot({ path: `e2e/screenshots/${process.env.SHOTS_LABEL}/${info.project.name}-${name}.png`, fullPage: true });
  };

  for (const [name, path] of PAGES) {
    await page.goto(path);
    await shot(name);
  }

  // A conversation with messages (the smoke test leaves one).
  await page.goto("/conversations");
  const chat = page.locator('a[href^="/counselor/"]').first();

  if (await chat.count()) {
    await chat.click();
    await page.waitForSelector(".prose-chat");
    await shot("chat");
  }

  // The student's saved plan.
  await page.goto("/plan");
  await page.locator('a[href^="/plan/"]').first().click();
  await shot("plan");

  // Dark mode, which follows the device setting.
  await page.emulateMedia({ colorScheme: "dark" });

  for (const [name, path] of [["home", "/"], ["counselor", "/counselor"], ["career", "/explore/registered-nurses"]] as const) {
    await page.goto(path);
    await shot(`dark-${name}`);
  }

  await page.emulateMedia({ colorScheme: "light" });
});

test("signed-out pages", async ({ page }, info) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `e2e/screenshots/${process.env.SHOTS_LABEL}/${info.project.name}-login.png`, fullPage: true });
});
