import { expect, test } from "@playwright/test";
import { openSection, shot, signIn } from "./support/helpers";

/** Toasts: bottom-right, sticker style, never block what's under them. */

test.use({ viewport: { width: 1440, height: 900 } });

test("toasts stack bottom-right, are click-through, and can be dismissed", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Songs");
  await page.getByRole("button", { name: "Add Song" }).click();
  await page.locator("#song-title").fill("Toast Test Hymn");
  await page.getByRole("button", { name: "Save Song" }).click();

  const toast = page.locator(".toast-sticker").filter({ hasText: /saved|added|created/i }).first();
  await expect(toast).toBeVisible();
  // Let the pop-in animation settle before measuring.
  await toast.evaluate((el) => Promise.all(el.getAnimations().filter((a) => a.animationName === "toast-pop" || (a as CSSAnimation).animationName === "toast-pop").map((a) => a.finished)));

  // Bottom-right corner with breathing room.
  const box = (await toast.boundingBox())!;
  expect(1440 - (box.x + box.width)).toBeGreaterThanOrEqual(20);
  expect(1440 - (box.x + box.width)).toBeLessThanOrEqual(40);
  expect(900 - (box.y + box.height)).toBeGreaterThanOrEqual(20);
  expect(900 - (box.y + box.height)).toBeLessThanOrEqual(40);

  // Sticker look: solid outline and hard offset shadow, countdown line.
  const style = await toast.evaluate((el) => {
    const css = getComputedStyle(el);
    return { border: css.borderTopWidth, shadow: css.boxShadow, events: css.pointerEvents };
  });
  expect(style.border).toBe("2px");
  expect(style.shadow).toMatch(/4px 4px 0px/);
  expect(style.events).toBe("none");
  await expect(toast.locator(".toast-timer")).toHaveCount(1);
  await shot(page, "toast-dark");

  // Click-through: a click on the toast's body reaches what's underneath.
  const center = { x: box.x + box.width / 2 - 20, y: box.y + box.height / 2 };
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest(".toast-sticker") ? "toast" : "page";
  }, center);
  expect(hit).toBe("page");

  // The close button still works.
  await toast.getByRole("button", { name: "Dismiss" }).click();
  await expect(toast).toBeHidden();

  // Light theme variant.
  await page.evaluate(() => document.documentElement.classList.add("theme-light"));
  await page.getByRole("button", { name: "Add Song" }).click();
  await page.locator("#song-title").fill("Toast Light Hymn");
  await page.getByRole("button", { name: "Save Song" }).click();
  await expect(page.locator(".toast-sticker").first()).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "toast-light");
});
