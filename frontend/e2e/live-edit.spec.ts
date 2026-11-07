import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { openSection, shot, shown, signIn } from "./support/helpers";
import {
  SERMON_ID,
  SETLIST_ID,
  setNetworkDown,
  SONG_ID,
  tableRows,
  writesTo,
} from "./support/supabaseMock";

/**
 * Edit Mode while live: edits must reach the projector immediately, persist on
 * the device, survive a reload, and land on Supabase, both when online and
 * when the edit is made offline and synced later (without being reverted by
 * the post-sync pull).
 */

test.use({ viewport: { width: 1440, height: 900 } });

const EDITED = "Amazing grace how sweet the sound\nThat saved a wretch like me";
const NEW_LINE = "That saved a wretch like me";

function lyricsOnServer() {
  return tableRows("song_lyric_sections")
    .filter((row) => row.song_id === SONG_ID)
    .map((row) => String(row.content));
}

async function goLive(page: Page, context: BrowserContext) {
  await openSection(page, "Presentation");
  await expect(shown(page, "Standby Preview")).toBeVisible();
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Go Live" }).click();
  const projector = await opened;
  await expect(projector.getByText("Amazing grace how sweet the sound")).toBeVisible({
    timeout: 20_000,
  });
  return projector;
}

async function editLyricsInEditMode(page: Page) {
  await page.getByRole("button", { name: "Edit Mode" }).click();
  await expect(page.getByLabel("Item to edit")).toBeVisible();
  const field = page.locator("textarea").filter({ visible: true }).first();
  await expect(field).toHaveValue(/Amazing grace how sweet the sound/);
  await field.fill(EDITED);
  await page.getByRole("button", { name: /(^|\s)Save$/ }).click();
  await expect(page.getByRole("button", { name: /(^|\s)Save$/ })).toBeDisabled({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByLabel("Item to edit")).toBeHidden();
}

/** Press the header's "Backup to cloud now" button (best effort: the outbox also flushes on its own). */
async function backup(page: Page) {
  const button = page.getByTitle("Backup to cloud now").filter({ visible: true }).first();
  await expect(button).toBeVisible({ timeout: 15_000 });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
}

async function leaveLive(page: Page) {
  await page.getByText("Back to dashboard").filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible({
    timeout: 30_000,
  });
}

test("live edits reach the projector, persist, survive reload, and sync to Supabase", async ({
  page,
  context,
}) => {
  await signIn(page);
  const projector = await goLive(page, context);
  await editLyricsInEditMode(page);

  // Projector shows the edit right away.
  await expect(projector.getByText(NEW_LINE)).toBeVisible({ timeout: 15_000 });
  await shot(projector, "live-edit-projector");

  // Persisted on the device: the song library shows the new lyrics.
  await page.getByText("Back to dashboard").filter({ visible: true }).first().click();
  await openSection(page, "Songs");
  // The details sheet opens when a song is picked.
  await page.locator("tr[data-song-row]").filter({ hasText: "Amazing Grace", visible: true }).first().click();
  await expect(shown(page, NEW_LINE)).toBeVisible();

  // Synced to Supabase.
  await backup(page);
  await expect.poll(() => lyricsOnServer().join("\n"), { timeout: 20_000 }).toContain(NEW_LINE);

  // Survives a full reload (local store + server agree).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Song Library" })).toBeVisible({
    timeout: 30_000,
  });
  // Pressing backup (outside the sheet) closed it, so open the song again.
  await page.locator("tr[data-song-row]").filter({ hasText: "Amazing Grace", visible: true }).first().click();
  await expect(shown(page, NEW_LINE)).toBeVisible();
});

test("live edits made offline are kept and synced after reconnecting", async ({
  page,
  context,
}) => {
  await signIn(page);
  const projector = await goLive(page, context);

  // Lose the connection mid-service.
  setNetworkDown(true);
  await context.setOffline(true);
  const writesBefore = writesTo("song_lyric_sections").length;

  await editLyricsInEditMode(page);
  // The projector (same machine) still updates while offline.
  await expect(projector.getByText(NEW_LINE)).toBeVisible({ timeout: 15_000 });
  // Nothing reached the server.
  expect(writesTo("song_lyric_sections").length).toBe(writesBefore);
  expect(lyricsOnServer().join("\n")).not.toContain(NEW_LINE);

  // Connection comes back: the outbox flushes on its own.
  setNetworkDown(false);
  await context.setOffline(false);
  await expect.poll(() => lyricsOnServer().join("\n"), { timeout: 30_000 }).toContain(NEW_LINE);

  // After the post-sync pull the edit is still there (not reverted).
  await page.waitForTimeout(2_000);
  await expect(projector.getByText(NEW_LINE)).toBeVisible();
  await page.getByText("Back to dashboard").filter({ visible: true }).first().click();
  await openSection(page, "Songs");
  // The details sheet opens when a song is picked.
  await page.locator("tr[data-song-row]").filter({ hasText: "Amazing Grace", visible: true }).first().click();
  await expect(shown(page, NEW_LINE)).toBeVisible();
});

/* ------------------------------------------------------------------ */
/* Sermon points, canvas slides and assignments edited while live.     */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

const POINT_ID = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const CANVAS_ID = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const SERMON_ITEM_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const ROSTER_ITEM_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3";

const OLD_CANVAS = "Old canvas words";
const NEW_CANVAS = "Fresh canvas words";
const NEW_POINT = "Grace that is greater than all our sin";

function canvasContent(text: string) {
  const layout = {
    v: 1,
    els: [
      { id: "el-bg", type: "box", x: 5, y: 20, w: 90, h: 60, fill: "rgba(0,0,0,0.45)", radius: 24 },
      { id: "el-text", type: "text", x: 10, y: 35, w: 80, h: 30, text, size: 96, align: "center" },
    ],
  };
  return `${text}<!--mc-layout:${encodeURIComponent(JSON.stringify(layout))}-->`;
}

/** Adds a canvas slide to the seeded sermon, and puts the sermon and an assignments slide in the live setlist. */
const liveItems = {
  extraRows: {
    sermon_slides: [
      {
        id: CANVAS_ID,
        sermon_id: SERMON_ID,
        background_asset_id: null,
        content: canvasContent(OLD_CANVAS),
        scripture_reference: null,
        sort_order: 1,
      },
    ],
    setlist_items: [
      {
        id: SERMON_ITEM_ID,
        setlist_id: SETLIST_ID,
        item_type: "sermon",
        song_id: null,
        sermon_id: SERMON_ID,
        passage_id: null,
        media_asset_id: null,
        payload: null,
        title: "Grace Upon Grace",
        subtitle: "Pastor Kim",
        duration_seconds: 1800,
        sort_order: 1,
      },
      {
        id: ROSTER_ITEM_ID,
        setlist_id: SETLIST_ID,
        item_type: "roster",
        song_id: null,
        sermon_id: null,
        passage_id: null,
        media_asset_id: null,
        payload: {
          heading: "Next Week",
          date: "2026-11-15",
          roles: [{ role: "Worship Leader", name: "Sam Rivers" }],
        },
        title: "Next Week",
        subtitle: null,
        duration_seconds: 60,
        sort_order: 2,
      },
    ],
  },
};

function slideOnServer(id: string) {
  return String((tableRows("sermon_slides") as Row[]).find((row) => row.id === id)?.content ?? "");
}

function rosterOnServer() {
  const row = (tableRows("setlist_items") as Row[]).find((r) => r.id === ROSTER_ITEM_ID);
  return JSON.stringify(row?.payload ?? null);
}

/** Everything the app keeps in IndexedDB, as one string (the device copy). */
async function deviceStore(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("ministrycast");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction("kv", "readonly").objectStore("kv").getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(JSON.stringify(request.result));
        };
      }),
  );
}

async function openEditMode(page: Page, option: RegExp) {
  await page.getByRole("button", { name: "Edit Mode" }).click();
  const picker = page.getByLabel("Item to edit");
  await expect(picker).toBeVisible();
  const label = await picker.locator("option").filter({ hasText: option }).first().textContent();
  await picker.selectOption({ label: label! });
}

async function showOnScreen(page: Page) {
  await page.getByRole("button", { name: /Show on screen$/ }).click();
  await expect(page.getByRole("button", { name: /On screen now$/ })).toBeVisible();
}

async function saveEdits(page: Page) {
  const save = page.getByRole("button", { name: /(^|\s)Save$/ });
  await save.click();
  await expect(save).toBeDisabled({ timeout: 10_000 });
}

async function closeEditMode(page: Page) {
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByLabel("Item to edit")).toBeHidden();
}

async function editCanvasSlide(page: Page, projector: Page) {
  await page.getByRole("button", { name: /^Point 2/ }).click();
  await showOnScreen(page);
  await expect(projector.locator("[data-slide-layout]")).toContainText(OLD_CANVAS, {
    timeout: 15_000,
  });

  // The canvas slide opens in the canvas editor, not the plain point editor.
  const canvas = page.getByTestId("slide-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByLabel("Edit point")).toBeHidden();
  await canvas.getByLabel(`Text box: ${OLD_CANVAS}`).dblclick();
  await page.getByLabel("Text box text").fill(NEW_CANVAS);
  await page.keyboard.press("Escape");
  await expect(canvas.getByLabel(`Text box: ${NEW_CANVAS}`)).toBeVisible();
  await saveEdits(page);
}

async function editRoster(page: Page) {
  await openEditMode(page, /^Assignments/);
  await showOnScreen(page);
  await page.getByLabel("Name for Worship Leader").fill("Jordan Hale");
  await saveEdits(page);
}

test("live edits to sermon points and canvas slides reach the projector and sync", async ({
  page,
  context,
}) => {
  await signIn(page, liveItems);
  const projector = await goLive(page, context);

  await openEditMode(page, /^Sermon/);

  // Plain text point.
  await page.getByRole("button", { name: /^Point 1/ }).click();
  await showOnScreen(page);
  await expect(projector.getByText("Grace upon grace", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  const point = page.getByLabel("Edit point");
  await point.click();
  await point.press("ControlOrMeta+a");
  await point.pressSequentially(NEW_POINT);
  await saveEdits(page);
  await expect(projector.getByText(NEW_POINT)).toBeVisible({ timeout: 15_000 });

  // Canvas slide: the edited layout (not the old one) is what the projector shows.
  await editCanvasSlide(page, projector);
  const onStage = projector.locator("[data-slide-layout]");
  await expect(onStage).toContainText(NEW_CANVAS, { timeout: 15_000 });
  await expect(onStage).not.toContainText(OLD_CANVAS);
  await shot(projector, "live-edit-canvas-projector");
  await closeEditMode(page);

  // Saved on the device.
  const local = await deviceStore(page);
  expect(local).toContain(NEW_POINT);
  expect(local).toContain(NEW_CANVAS);

  // Synced to Supabase, with the layout marker carrying the new text.
  await leaveLive(page);
  await backup(page);
  await expect.poll(() => slideOnServer(POINT_ID), { timeout: 20_000 }).toContain(NEW_POINT);
  await expect.poll(() => slideOnServer(CANVAS_ID), { timeout: 20_000 }).toContain(
    encodeURIComponent(NEW_CANVAS).slice(0, 10),
  );
  const canvasRow = slideOnServer(CANVAS_ID);
  expect(decodeURIComponent(canvasRow)).toContain(`"text":"${NEW_CANVAS}"`);
  expect(canvasRow).not.toContain(OLD_CANVAS);

  // Survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible({
    timeout: 30_000,
  });
  const reloaded = await deviceStore(page);
  expect(reloaded).toContain(NEW_POINT);
  expect(reloaded).toContain(NEW_CANVAS);
  expect(reloaded).not.toContain(OLD_CANVAS);
});

test("live edits to assignments reach the projector and sync", async ({ page, context }) => {
  await signIn(page, liveItems);
  const projector = await goLive(page, context);
  await expect(projector.getByText("Amazing grace how sweet the sound")).toBeVisible();

  await editRoster(page);
  await expect(projector.getByText("Jordan Hale")).toBeVisible({ timeout: 15_000 });
  await expect(projector.getByText("Sam Rivers")).toBeHidden();
  await closeEditMode(page);

  expect(await deviceStore(page)).toContain("Jordan Hale");
  await leaveLive(page);
  await backup(page);
  await expect.poll(rosterOnServer, { timeout: 20_000 }).toContain("Jordan Hale");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible({
    timeout: 30_000,
  });
  const reloaded = await deviceStore(page);
  expect(reloaded).toContain("Jordan Hale");
  expect(reloaded).not.toContain("Sam Rivers");
});

test("sermon canvas and assignment edits made offline sync after reconnecting", async ({
  page,
  context,
}) => {
  await signIn(page, liveItems);
  const projector = await goLive(page, context);

  setNetworkDown(true);
  await context.setOffline(true);
  const slideWrites = writesTo("sermon_slides").length;
  const itemWrites = writesTo("setlist_items").length;

  await openEditMode(page, /^Sermon/);
  await editCanvasSlide(page, projector);
  await expect(projector.locator("[data-slide-layout]")).toContainText(NEW_CANVAS, {
    timeout: 15_000,
  });
  await closeEditMode(page);
  await editRoster(page);
  await expect(projector.getByText("Jordan Hale")).toBeVisible({ timeout: 15_000 });
  await closeEditMode(page);

  // Kept on the device, nothing reached the server.
  const local = await deviceStore(page);
  expect(local).toContain(NEW_CANVAS);
  expect(local).toContain("Jordan Hale");
  expect(writesTo("sermon_slides").length).toBe(slideWrites);
  expect(writesTo("setlist_items").length).toBe(itemWrites);
  expect(slideOnServer(CANVAS_ID)).toContain(OLD_CANVAS);

  // Back online: the outbox flushes on its own.
  setNetworkDown(false);
  await context.setOffline(false);
  await expect
    .poll(() => decodeURIComponent(slideOnServer(CANVAS_ID)), { timeout: 30_000 })
    .toContain(`"text":"${NEW_CANVAS}"`);
  await expect.poll(rosterOnServer, { timeout: 30_000 }).toContain("Jordan Hale");

  // The post-sync pull does not revert anything.
  await page.waitForTimeout(2_000);
  await expect(projector.getByText("Jordan Hale")).toBeVisible();
  const after = await deviceStore(page);
  expect(after).toContain(NEW_CANVAS);
  expect(after).not.toContain(OLD_CANVAS);
  expect(after).toContain("Jordan Hale");
  expect(after).not.toContain("Sam Rivers");
});

test("live edit: canvas slide in full screen; Esc leaves full screen, not Edit Mode", async ({
  page,
  context,
}) => {
  await signIn(page, liveItems);
  await goLive(page, context);
  await openEditMode(page, /^Sermon/);
  await page.getByRole("button", { name: /^Point 2/ }).click();
  await expect(page.getByTestId("slide-canvas")).toBeVisible();
  // Canvas text is sized in the slide toolbar; the plain-point size control is hidden.
  await expect(page.getByText("Point text size")).toHaveCount(0);

  await page.getByRole("button", { name: "Edit in full screen" }).click();
  const full = page.getByRole("dialog", { name: "Slide editor, full screen" });
  await expect(full).toBeVisible();
  await full.getByLabel(`Text box: ${OLD_CANVAS}`).click();
  await expect(full.getByRole("group", { name: "Text size" })).toBeVisible();
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/fullscreen-live.png` });

  // Focus on a toolbar button (outside the canvas): Esc still only steps back.
  await full.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.press("Escape"); // deselect
  await expect(full).toBeVisible();
  await page.keyboard.press("Escape"); // leave full screen
  await expect(full).toBeHidden();
  await expect(page.getByLabel("Item to edit")).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
});

test("live edit: a very long point shrinks to fit the slide while typing", async ({ page, context }) => {
  await signIn(page, liveItems);
  await goLive(page, context);
  await openEditMode(page, /^Sermon/);
  await page.getByRole("button", { name: /^Point 1/ }).click();
  const point = page.getByLabel("Edit point");
  await point.click();
  await point.press("ControlOrMeta+a");
  const long = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: grace that is greater than all our sin`).join(" ");
  await page.keyboard.insertText(long);
  await expect(page.getByText(/Long point: the text is shrunk to fit the screen/)).toBeVisible();
  // Nothing scrolls inside the slide: the text fits.
  const fits = await point.evaluate((el) => el.scrollHeight <= el.clientHeight + 2);
  expect(fits).toBe(true);
});
