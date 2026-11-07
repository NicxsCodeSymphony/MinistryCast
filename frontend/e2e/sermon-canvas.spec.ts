import { expect, test, type Page } from "@playwright/test";
import { openSection, shown, signIn } from "./support/helpers";
import { SERMON_ID, tableRows } from "./support/supabaseMock";

test.use({ viewport: { width: 1440, height: 900 } });

type Row = Record<string, unknown>;
type El = { type: string; text?: string; size?: number; color?: string; x: number; y: number };

async function expectBackend(page: Page, check: () => void) {
  await expect(async () => {
    const backup = page.getByTitle("Backup to cloud now").filter({ visible: true }).first();
    if (await backup.isEnabled().catch(() => false)) {
      await backup.click({ timeout: 2_000 }).catch(() => undefined);
    }
    check();
  }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });
}

function slideLayout(): El[] | null {
  const slide = (tableRows("sermon_slides") as Row[]).find(
    (row) => row.sermon_id === SERMON_ID && String(row.content).includes("<!--mc-layout:"),
  );
  if (!slide) return null;
  const match = String(slide.content).match(/<!--mc-layout:([^<>]*?)-->/);
  return match ? (JSON.parse(decodeURIComponent(match[1])).els as El[]) : null;
}

test("sermons: design a slide on the canvas and keep it after reload", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Sermon");
  await page.getByRole("button", { name: /Grace Upon Grace John/ }).click();
  await expect(shown(page, "Edit sermon")).toBeVisible();

  // Select point 1 and turn it into a canvas slide with a new text box.
  await page.getByRole("button", { name: "Edit point 1" }).click();
  await page.getByRole("button", { name: "Add text box" }).click();
  const canvas = page.getByTestId("slide-canvas");
  await expect(canvas).toBeVisible();
  // The point's existing text became a box; the new box is ready to type.
  await expect(canvas.getByLabel("Text box: Grace upon grace")).toBeVisible();
  await page.getByLabel("Text box text").pressSequentially("Living hope");
  await page.keyboard.press("Escape");

  const box = canvas.getByLabel("Text box: Living hope");
  await expect(box).toBeVisible();
  const before = await box.boundingBox();
  if (!before) throw new Error("text box has no box");

  // Drag it down and to the right.
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 90, before.y + before.height / 2 + 70, {
    steps: 8,
  });
  await page.mouse.up();
  const after = await box.boundingBox();
  expect(after!.x).toBeGreaterThan(before.x + 40);
  expect(after!.y).toBeGreaterThan(before.y + 40);

  // Format the selected box.
  await page.getByRole("button", { name: "Text size L" }).click();
  await page.getByRole("button", { name: "Color Gold" }).click();
  await expect(page.getByRole("button", { name: "Text size L" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // The stage preview in the side panel renders the positioned layout.
  const preview = page.getByRole("complementary", { name: "Sermon side panel" });
  await expect(preview.locator("[data-slide-layout]")).toContainText("Living hope");
  await expect(shown(page, /Unsaved changes/)).toBeVisible();

  await page.getByRole("button", { name: /^(save)?\s*Save$/i }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();

  await expectBackend(page, () => {
    const els = slideLayout();
    expect(els).not.toBeNull();
    const added = els!.find((el) => el.text === "Living hope");
    expect(added).toMatchObject({ type: "text", size: 96, color: "#f0c674" });
    expect(added!.x).toBeGreaterThan(22);
    expect(added!.y).toBeGreaterThan(43);
    expect(els!.some((el) => el.text === "Grace upon grace")).toBe(true);
  });

  // Reload: the design comes back in the editor and the preview.
  await page.reload();
  await expect(shown(page, "Edit sermon")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Edit point 1" }).click();
  const reloaded = page.getByTestId("slide-canvas").getByLabel("Text box: Living hope");
  await expect(reloaded).toBeVisible();
  await expect(reloaded.locator("div").first()).toHaveCSS("color", "rgb(240, 198, 116)");
  await expect(
    page.getByRole("complementary", { name: "Sermon side panel" }).locator("[data-slide-layout]"),
  ).toContainText("Living hope");
});

test("sermons: edit a canvas slide in full screen, Esc steps back out", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Sermon");
  await page.getByRole("button", { name: /Grace Upon Grace John/ }).click();
  await page.getByRole("button", { name: "Edit point 1" }).click();
  await page.getByRole("button", { name: "Add text box" }).click();
  const canvas = page.getByTestId("slide-canvas");
  await expect(canvas).toBeVisible();
  await page.keyboard.press("Escape");
  const inline = (await canvas.boundingBox())!;

  await page.getByRole("button", { name: "Edit in full screen" }).click();
  const full = page.getByRole("dialog", { name: "Slide editor, full screen" });
  await expect(full).toBeVisible();
  const big = (await full.getByTestId("slide-canvas").boundingBox())!;
  expect(big.width).toBeGreaterThan(inline.width * 1.3);
  expect(Math.abs(big.width / big.height - 16 / 9)).toBeLessThan(0.02);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/fullscreen-sermon.png` });

  // Editing still works in full screen.
  const box = full.getByLabel("Text box: Grace upon grace");
  await box.dblclick();
  await expect(full.getByLabel("Text box text")).toBeVisible();

  // Esc: finish typing → deselect → leave full screen.
  await page.keyboard.press("Escape");
  await expect(full.getByLabel("Text box text")).toHaveCount(0);
  await expect(full).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(full).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(full).toBeHidden();
  await expect(page.getByTestId("slide-canvas")).toBeVisible();
  await expect(shown(page, "Edit sermon")).toBeVisible();
});

const LONG_TEXT =
  "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. For God sent not his Son into the world to condemn the world; but that the world through him might be saved.";

test("sermons: long canvas text shrinks to fit; Fill slide and Auto-fit toggle", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Sermon");
  await page.getByRole("button", { name: /Grace Upon Grace John/ }).click();
  await page.getByRole("button", { name: "Edit point 1" }).click();
  await page.getByRole("button", { name: "Add text box" }).click();
  await page.getByLabel("Text box text").fill(LONG_TEXT);
  await page.keyboard.press("Escape");

  const canvas = page.getByTestId("slide-canvas");
  const box = canvas.locator("[data-testid='canvas-element'][data-type='text']").filter({ hasText: "begotten" });
  const text = box.locator("[data-slide-text]");
  // Shrunk below the chosen size, and every line stays inside the box.
  await expect(text).toHaveAttribute("data-fit-scale", /^0\./);
  const inside = async () => {
    const outer = (await box.boundingBox())!;
    const words = (await text.locator("span").boundingBox())!;
    return words.y >= outer.y - 1 && words.y + words.height <= outer.y + outer.height + 1;
  };
  expect(await inside()).toBe(true);
  const smallScale = Number(await text.getAttribute("data-fit-scale"));

  // The read-only preview shrinks the same way (same scale, smaller stage).
  const previewText = page.locator("[data-slide-layout] [data-slide-text]").filter({ hasText: "begotten" }).first();
  await expect
    .poll(async () => Math.abs(Number(await previewText.getAttribute("data-fit-scale")) - smallScale))
    .toBeLessThan(0.05);

  // Fill slide: the box covers the slide, so the text gets room to grow back.
  await box.click();
  await page.getByRole("button", { name: "Fill slide" }).click();
  const slide = (await canvas.boundingBox())!;
  const filled = (await box.boundingBox())!;
  expect(filled.width).toBeGreaterThan(slide.width * 0.85);
  expect(filled.height).toBeGreaterThan(slide.height * 0.85);
  await expect
    .poll(async () => Number((await text.getAttribute("data-fit-scale")) ?? 1))
    .toBeGreaterThan(smallScale);
  expect(await inside()).toBe(true);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/autofit-canvas.png` });


  // Auto-fit off: exact chosen size (text may overflow).
  const toggle = page.getByRole("button", { name: "Shrink text to fit" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(text).not.toHaveAttribute("data-fit-scale", /.+/);
});
