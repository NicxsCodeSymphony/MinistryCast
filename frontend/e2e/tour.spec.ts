import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { installSupabaseMock, type MockOptions } from "./support/supabaseMock";

/**
 * Visual tour: one full-page screenshot per screen, written to TOUR_DIR
 * (default test-results/tour). Used to compare the UI before/after a redesign.
 */
const outDir = process.env.TOUR_DIR || "test-results/tour";
test.use({ viewport: { width: 1440, height: 900 } });

async function capture(page: Page, name: string) {
  await page.waitForTimeout(600);
  // Every icon must resolve to a Lucide glyph.
  const missing = await page.locator("[data-icon-missing]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-icon-missing")),
  );
  expect(missing, `unmapped icons on ${name}`).toEqual([]);
  fs.mkdirSync(outDir, { recursive: true });
  const body = await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  await test.info().attach(name, { body, contentType: "image/png" });
}

async function signIn(page: Page, options: MockOptions = {}) {
  await installSupabaseMock(page, options);
  await page.goto("/");
  await page.getByTestId("welcome-email").fill("operator@gracechapel.test");
  await page.getByTestId("welcome-password").fill("correct-horse");
  await page.getByTestId("welcome-continue").click();
}

test("public screens", async ({ page }) => {
  await installSupabaseMock(page);
  for (const [name, url] of [
    ["01-welcome", "/"],
    ["02-register", "/register"],
    ["03-forgot-password", "/forgot-password"],
    ["04-reset-password", "/reset-password"],
  ]) {
    await page.goto(url);
    await capture(page, name);
  }
});

test("church workspace screens", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible({
    timeout: 30_000,
  });
  for (const [name, link] of [
    ["10-dashboard", "Dashboard"],
    ["11-setlists", "Setlists"],
    ["12-songs", "Songs"],
    ["13-sermon", "Sermon"],
    ["14-categories", "Categories"],
    ["15-chat", "Chat"],
    ["16-settings", "Settings"],
  ]) {
    await page.locator("nav").getByRole("link", { name: link }).first().click();
    await capture(page, name);
  }
  await page.locator("nav").getByRole("link", { name: "Presentation" }).click();
  await expect(page.getByText("Standby").filter({ visible: true }).first()).toBeVisible();
  await capture(page, "17-presentation");

  // Light theme variants of the main screens.
  await page.evaluate(() => document.documentElement.classList.add("theme-light"));
  await page.getByText("Back to dashboard").filter({ visible: true }).click();
  await capture(page, "30-light-dashboard");
  await page.locator("nav").getByRole("link", { name: /Songs$/ }).click();
  await capture(page, "31-light-songs");
});

test("onboarding screen", async ({ page }) => {
  await signIn(page, { onboarded: false });
  await expect(page).toHaveURL(/onboarding/, { timeout: 30_000 });
  await capture(page, "18-onboarding");
});

test("superadmin screens", async ({ page }) => {
  await signIn(page, { role: "superadmin" });
  await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });
  await capture(page, "20-admin-home");
  for (const [name, url] of [
    ["21-admin-churches", "/admin/churches"],
    ["22-admin-accounts", "/admin/accounts"],
    ["23-admin-audit", "/admin/audit"],
  ]) {
    await page.evaluate((to) => {
      window.history.pushState({}, "", to);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, url);
    await capture(page, name);
  }
});
