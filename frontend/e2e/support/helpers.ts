import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { installSupabaseMock, type MockOptions } from "./supabaseMock";

/** Attach a full-page screenshot to the HTML report. */
export async function shot(page: Page, name: string) {
  const body = await page.screenshot({ fullPage: true });
  await test.info().attach(name, { body, contentType: "image/png" });
  // SHOT_DIR=<dir> also writes every named screenshot to disk.
  const dir = process.env.SHOT_DIR;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.png`), body);
  }
}

/**
 * Pages are kept alive (hidden) after navigation, so plain getByText can hit a
 * stale copy. Always match the visible one.
 */
export function shown(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true }).first();
}

/** Install the mock backend and sign in through the real welcome form. */
export async function signIn(page: Page, options: MockOptions = {}) {
  await installSupabaseMock(page, options);
  await page.goto("/");
  await page.getByTestId("welcome-email").fill("operator@gracechapel.test");
  await page.getByTestId("welcome-password").fill("correct-horse");
  await page.getByTestId("welcome-continue").click();
  if (options.onboarded === false) {
    await expect(page).toHaveURL(/onboarding/, { timeout: 30_000 });
  } else if (options.role === "superadmin") {
    await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });
  } else {
    await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible({
      timeout: 30_000,
    });
  }
}

/** Nav link names include the icon ligature ("music_note Songs"), so match the label at the end. */
export async function openSection(page: Page, name: string) {
  const label = new RegExp(`(^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  await page.locator("nav").getByRole("link", { name: label }).first().click();
}

/** Client-side navigation that keeps the in-memory session and IndexedDB. */
export async function goTo(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}
