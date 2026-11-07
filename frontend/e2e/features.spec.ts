import { expect, test, type Page } from "@playwright/test";
import { installSupabaseMock } from "./support/supabaseMock";

async function shot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test.beforeEach(async ({ page }) => {
  await installSupabaseMock(page);
});

test("sign-in rejects a blank password before calling the server", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-email").fill("operator@gracechapel.test");
  await page.getByTestId("welcome-continue").click();
  await expect(page.getByText("Enter your password.").first()).toBeVisible();
  await shot(page, "welcome-password-required");
});

test("forgot password confirms a reset email", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByTestId("forgot-email").fill("a@b");
  await page.getByTestId("forgot-submit").click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();

  await page.getByTestId("forgot-email").fill("operator@gracechapel.test");
  await page.getByTestId("forgot-submit").click();
  await expect(page.getByText(/reset email is on the way/i)).toBeVisible();
  await shot(page, "forgot-password-sent");
});

test("register blocks mismatched passwords", async ({ page }) => {
  await page.goto("/register");
  await page.getByTestId("register-email").fill("new@gracechapel.test");
  await page.getByTestId("register-password").fill("secret12");
  await page.getByTestId("register-confirm").fill("secret13");
  await page.getByTestId("register-submit").click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  await shot(page, "register-mismatch");
});
