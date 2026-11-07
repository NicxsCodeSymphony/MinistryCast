import { expect, test } from "@playwright/test";
import { openSection, shot, shown, signIn } from "./support/helpers";
import { SETLIST_ID, tableRows } from "./support/supabaseMock";

/**
 * Custom stage background images: upload on the deck, apply to the setlist,
 * see it on the projector, persist to the backend, and fall back correctly.
 */

test.use({ viewport: { width: 1440, height: 900 } });

// 4×4 PNG (real image bytes so createImageBitmap decodes it).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4oWEDRwzEcQDwgxLBOV5x7gAAAABJRU5ErkJggg==",
  "base64",
);

test("an uploaded background image shows on the deck and projector and syncs", async ({
  page,
  context,
}) => {
  await signIn(page);
  await openSection(page, "Presentation");
  await expect(shown(page, "Standby Preview")).toBeVisible();

  const projectorOpened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Go Live" }).click();
  const projector = await projectorOpened;
  await expect(projector.getByText("Amazing grace how sweet the sound")).toBeVisible({
    timeout: 20_000,
  });

  // Open the background section and scope changes to this setlist.
  await page.getByRole("button", { name: /Stage background/ }).first().click();
  await page.getByRole("radio", { name: "This setlist" }).click();
  await expect(page.getByRole("radio", { name: "This setlist" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await page.getByTestId("background-upload-input").setInputFiles({
    name: "Easter cross.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(shown(page, "Background added.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Easter cross" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Deck preview and projector both render the image.
  await expect(page.locator('[data-stage-background^="img:"]').first()).toBeVisible();
  await expect(projector.locator('[data-stage-background^="img:"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(projector.getByText("Amazing grace how sweet the sound")).toBeVisible();
  await shot(projector, "projector-custom-background");
  await shot(page, "deck-custom-background");

  // A church-default change does not override the setlist's own image.
  await page.getByRole("radio", { name: "Church default" }).click();
  await page.getByRole("button", { name: "Midnight" }).click();
  await projector.waitForTimeout(1_500);
  await expect(projector.locator('[data-stage-background^="img:"]')).toBeVisible();

  // Reset the setlist to the church default: the projector drops the image.
  await page.getByRole("radio", { name: "This setlist" }).click();
  await page.getByRole("button", { name: "Reset to church default" }).click();
  await expect(projector.locator('[data-stage-background^="img:"]')).toHaveCount(0, {
    timeout: 15_000,
  });

  // Choose the image again and confirm everything reaches the backend.
  await page.getByRole("button", { name: "Easter cross" }).click();
  await expect(projector.locator('[data-stage-background^="img:"]')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "End Presentation" }).click();
  await page
    .getByRole("dialog", { name: "End the presentation?" })
    .getByRole("button", { name: "End Presentation" })
    .click();
  await page.getByText("Back to dashboard").filter({ visible: true }).first().click();
  await page.locator("header button").filter({ hasText: /Backed up|waiting|Saved/ }).first().click();

  await expect
    .poll(() => tableRows("media_assets").filter((row) => row.kind === "background").length, {
      timeout: 20_000,
    })
    .toBe(1);
  const asset = tableRows("media_assets").find((row) => row.kind === "background")!;
  expect(String(asset.url)).toMatch(/^data:image\/jpeg;base64,/);
  expect(asset.name).toBe("Easter cross");
  await expect
    .poll(
      () => tableRows("setlists").find((row) => row.id === SETLIST_ID)?.stage_background,
      { timeout: 20_000 },
    )
    .toBe(`img:${asset.id}`);
  const settings = tableRows("church_settings")[0];
  expect(settings.stage_background).toBe("midnight");
});

test("a background image can be removed and falls back safely", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Settings");
  await page.getByRole("tab", { name: /Presentation/ }).first().click();
  const upload = page.getByTestId("background-upload-input").first();
  await upload.setInputFiles({ name: "Harvest.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("button", { name: "Harvest" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Removing requires confirmation; cancel keeps it.
  await page.getByRole("button", { name: "Harvest" }).first().hover();
  await page.getByRole("button", { name: "Remove background Harvest" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Remove background image?" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Harvest" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Harvest" }).first().hover();
  await page.getByRole("button", { name: "Remove background Harvest" }).first().click();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("button", { name: "Harvest" })).toHaveCount(0);
  // The selection fell back to the default background.
  await expect(page.getByRole("button", { name: "Sanctuary" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a setlist's own background is set from the Setlists page and used by the deck", async ({
  page,
}) => {
  await signIn(page);
  await openSection(page, "Setlists");
  await page.getByRole("button", { name: /Sunday Morning/ }).first().click();
  await expect(page.getByRole("heading", { name: "Sunday Morning" })).toBeVisible();

  const label = page.getByTestId("setlist-background-label").filter({ visible: true });
  await expect(label).toContainText("Church default");

  await page.getByRole("button", { name: "Change setlist background" }).click();
  const sheet = page.getByRole("dialog", { name: /Background for/ });
  await sheet.getByRole("button", { name: "Midnight" }).click();
  await expect(shown(page, "Setlist background updated.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(label).toHaveText("Midnight");

  // The deck shows the setlist's background, marked as a setlist override.
  await openSection(page, "Presentation");
  await expect(page.getByRole("button", { name: /Stage background/ }).first()).toContainText(
    "Midnight · setlist",
  );

  // Back on the setlist: reset to the church default.
  await page.getByText("Back to dashboard").filter({ visible: true }).first().click();
  await openSection(page, "Setlists");
  await page.getByRole("button", { name: /Sunday Morning/ }).first().click();
  await page.getByRole("button", { name: "Change setlist background" }).click();
  await sheet.getByRole("button", { name: /Use church default/ }).click();
  await page.keyboard.press("Escape");
  await expect(label).toContainText("Church default");

  await page.locator("header button").filter({ hasText: /Backed up|waiting|Saved/ }).first().click();
  await expect
    .poll(() => tableRows("setlists").find((row) => row.id === SETLIST_ID)?.stage_background ?? null, {
      timeout: 20_000,
    })
    .toBeNull();
  expect(
    tableRows("setlists").find((row) => row.id === SETLIST_ID),
  ).toBeTruthy();
});
