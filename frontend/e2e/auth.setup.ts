import { test as setup } from "@playwright/test";

import { signIn } from "./helpers";

setup("sign in the test student", async ({ page }) => {
  await signIn(page);
  await page.context().storageState({ path: "e2e/.auth/student.json" });
});
