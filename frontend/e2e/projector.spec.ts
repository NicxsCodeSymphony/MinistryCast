import { expect, test } from "@playwright/test";
import { openSection, shot, shown, signIn } from "./support/helpers";
import { tableRows } from "./support/supabaseMock";

/**
 * Operator console → projector window, end to end.
 * Go Live opens a real second window (/output). Every control on the operator
 * side must show up on the projector, and the presentation row must persist.
 */

test.use({ viewport: { width: 1440, height: 900 } });

test("going live drives the projector window: lyrics, blackout, logo, end", async ({
  page,
  context,
}) => {
  await signIn(page);
  await openSection(page, "Presentation");
  await expect(shown(page, "Standby Preview")).toBeVisible();

  const projectorOpened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Go Live" }).click();
  const projector = await projectorOpened;
  await projector.setViewportSize({ width: 1280, height: 720 });
  await expect(projector).toHaveURL(/\/output\?presentation=/);
  await expect(shown(page, "On Air")).toBeVisible();

  const lyric = projector.getByText("Amazing grace how sweet the sound");
  await expect(lyric).toBeVisible({ timeout: 20_000 });
  await shot(projector, "projector-live-lyric");

  // Blackout on the console blanks the projector.
  await page.getByRole("button", { name: "Blackout" }).click();
  await expect(lyric).toBeHidden({ timeout: 15_000 });
  await shot(projector, "projector-blackout");

  // Back from blackout.
  await page.getByRole("button", { name: "Blackout" }).click();
  await expect(lyric).toBeVisible({ timeout: 15_000 });

  // Logo replaces the lyric with the church mark.
  await page.getByRole("button", { name: "Logo" }).click();
  await expect(projector.locator(`[data-icon="church"]`)).toBeVisible({ timeout: 15_000 });
  await expect(lyric).toBeHidden();
  await shot(projector, "projector-logo");
  await page.getByRole("button", { name: "Logo" }).click();
  await expect(lyric).toBeVisible({ timeout: 15_000 });

  // Ending the session returns the console to standby.
  await page.getByRole("button", { name: "End Presentation" }).click();
  await page
    .getByRole("dialog", { name: "End the presentation?" })
    .getByRole("button", { name: "End Presentation" })
    .click();
  await expect(shown(page, "Live session ended.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Go Live" })).toBeVisible();
  await shot(page, "console-ended");

  // The session is recorded on the backend after the next backup.
  await page.getByText("Back to dashboard").filter({ visible: true }).click();
  await page.locator("header button").filter({ hasText: /Backed up|waiting|Saved/ }).click();
  await expect
    .poll(() => tableRows("presentations").length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  await expect(shown(page, "Recent Presentations")).toBeVisible();
});
