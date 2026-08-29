import { test, expect } from "@playwright/test";

test("welcome page loads sign-in fields", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome-email")).toBeVisible();
  await expect(page.getByTestId("welcome-password")).toBeVisible();
  await expect(page.getByTestId("welcome-forgot")).toBeVisible();
});

test("register page calls register-account", async ({ page }) => {
  await page.goto("/register");
  await page.getByTestId("register-email").fill("playwright@example.com");
  await page.getByTestId("register-password").fill("testpass1");
  await page.getByTestId("register-confirm").fill("testpass1");

  const call = page.waitForResponse(
    (res) => res.url().includes("/functions/v1/register-account"),
    { timeout: 30_000 },
  );
  await page.getByTestId("register-submit").click();
  const response = await call;

  await test.info().attach("register-status", {
    body: `${response.status()} ${response.url()}\n${await response.text()}`,
    contentType: "text/plain",
  });

  expect(response.status()).not.toBe(404);
  expect([200, 400]).toContain(response.status());
});
