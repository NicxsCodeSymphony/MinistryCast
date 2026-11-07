import { expect, test, type Page } from "@playwright/test";
import { openSection, shot, signIn } from "./support/helpers";

/** Color palettes in Settings › Appearance. */

test.use({ viewport: { width: 1440, height: 900 } });

const PALETTES = [
  "Indigo",
  "Ocean",
  "Evergreen",
  "Lagoon",
  "Amethyst",
  "Rose",
  "Sunset",
  "Sanctuary Gold",
  "Graphite",
];

function tokens(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      palette: document.documentElement.getAttribute("data-palette"),
      button: style.getPropertyValue("--mc-button").trim(),
      surface: style.getPropertyValue("--mc-surface-container").trim(),
      sidebar: getComputedStyle(document.querySelector("aside.app-sidebar")!).backgroundColor,
      activeBar: getComputedStyle(document.querySelector(".nav-item-active")!).boxShadow,
      activeIcon: getComputedStyle(document.querySelector(".nav-item-active .mc-icon")!).color,
    };
  });
}

async function openGeneral(page: Page) {
  await openSection(page, "Settings");
  await page.getByRole("tab", { name: /Appearance/ }).click();
  await expect(page.getByRole("radiogroup", { name: "Color theme" })).toBeVisible();
}

test("every color palette re-themes the app and persists", async ({ page }) => {
  await signIn(page);
  await openGeneral(page);
  const group = page.getByRole("radiogroup", { name: "Color theme" });
  await expect(group.getByRole("radio")).toHaveCount(PALETTES.length);
  await expect(group.getByRole("radio", { name: "Indigo" })).toHaveAttribute("aria-checked", "true");

  const seen = new Set<string>();
  const sidebars = new Set<string>();
  const activeIcons = new Set<string>();
  for (const name of PALETTES) {
    await group.getByRole("radio", { name }).click();
    await expect(group.getByRole("radio", { name })).toHaveAttribute("aria-checked", "true");
    const current = await tokens(page);
    if (name === "Indigo") expect(current.palette).toBeNull();
    else expect(current.palette).not.toBeNull();
    seen.add(current.button);
    sidebars.add(current.sidebar);
    activeIcons.add(current.activeIcon);
    // The selected nav item carries an accent bar.
    expect(current.activeBar).toContain("inset");
  }
  // Each palette has its own accent fill.
  expect(seen.size).toBe(PALETTES.length);
  // The sidebar surface and the selected item's icon follow each palette.
  expect(sidebars.size).toBe(PALETTES.length);
  expect(activeIcons.size).toBe(PALETTES.length);

  // Pick one, confirm it survives a full reload (applied before first paint).
  await group.getByRole("radio", { name: "Evergreen" }).click();
  const before = await tokens(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Production Command" }).or(page.getByText("Settings").first())).toBeVisible({ timeout: 30_000 });
  const after = await tokens(page);
  expect(after).toEqual(before);
});

test("palettes work in light mode too, with a tinted surface", async ({ page }) => {
  await signIn(page);
  await openGeneral(page);
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/theme-light/);
  const group = page.getByRole("radiogroup", { name: "Color theme" });

  await group.getByRole("radio", { name: "Indigo" }).click();
  const neutral = await tokens(page);
  await group.getByRole("radio", { name: "Rose" }).click();
  const rose = await tokens(page);
  expect(rose.button).not.toBe(neutral.button);
  expect(rose.surface).not.toBe(neutral.surface);

  await group.getByRole("radio", { name: "Indigo" }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
});

test("palette gallery screenshots", async ({ page }) => {
  await signIn(page);
  for (const name of ["Ocean", "Evergreen", "Amethyst", "Sanctuary Gold", "Sunset", "Graphite"]) {
    await openGeneral(page);
    await page.getByRole("radiogroup", { name: "Color theme" }).getByRole("radio", { name }).click();
    await openSection(page, "Dashboard");
    await page.waitForTimeout(400);
    await shot(page, `palette-${name.toLowerCase().replace(/\s+/g, "-")}`);
  }
  await openGeneral(page);
  await shot(page, "palette-settings");
});
