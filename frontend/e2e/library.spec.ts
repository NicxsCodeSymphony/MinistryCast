import { expect, test, type Page } from "@playwright/test";
import { openSection, shot, shown, signIn } from "./support/helpers";
import {
  CATEGORY_ID,
  SERMON_ID,
  SETLIST_ID,
  SONG_ID,
  tableRows,
} from "./support/supabaseMock";

test.use({ viewport: { width: 1440, height: 900 } });

const ENGLISH_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

type Row = Record<string, unknown>;

/**
 * Writes land in IndexedDB first and reach the backend through the sync outbox.
 * Press the header "Backup to cloud now" button until the backend matches.
 */
async function expectBackend(page: Page, check: () => void) {
  await expect(async () => {
    const backup = page.getByTitle("Backup to cloud now").filter({ visible: true }).first();
    if (await backup.isEnabled().catch(() => false)) {
      await backup.click({ timeout: 2_000 }).catch(() => undefined);
    }
    check();
  }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });
}

function rows(table: string) {
  return tableRows(table) as Row[];
}

function songRow(title: string) {
  return rows("songs").find((row) => row.title === title);
}

function dialog(page: Page, name: string | RegExp) {
  return page.getByRole("dialog", { name });
}

/** Rows of the visible Songs table. */
function songTableRow(page: Page, title: string) {
  return page
    .locator("tbody tr")
    .filter({ visible: true })
    .filter({ has: page.getByText(title, { exact: true }) });
}

/** The visible song detail pane. */
function songDetail(page: Page) {
  return page.getByRole("complementary", { name: "Song details" }).filter({ visible: true });
}

async function openSongs(page: Page) {
  await openSection(page, "Songs");
  await expect(page.getByRole("heading", { name: "Song Library", exact: true })).toBeVisible();
  await expect(songTableRow(page, "Amazing Grace")).toHaveCount(1);
}

/* ------------------------------------------------------------------ Songs */

test("songs: create with title, artist, key, category, and lyrics", async ({ page }) => {
  await signIn(page);
  await openSongs(page);

  await page.getByRole("button", { name: "Add Song" }).click();
  const form = dialog(page, /New Song|Add Song|Song/);
  await expect(form).toBeVisible();
  await page.locator("#song-title").fill("Playwright Hymn");
  await page.locator("#song-artist").fill("Test Choir");
  await page
    .locator("#song-lyrics")
    .fill("[Verse 1]\nPlaywright verse line\n\n[Chorus]\nPlaywright chorus line");
  await page.locator("#song-bpm").fill("96");
  await page.getByRole("listbox", { name: "Category" }).getByRole("option", { name: /Worship/ }).click();
  await page.locator("#song-key").selectOption("D");
  await expect(page.locator("#song-key")).toHaveValue("D");
  await page.getByRole("button", { name: "Save Song" }).click();
  await expect(form).toBeHidden();

  // Table row and the detail panel reflect what was entered.
  const row = songTableRow(page, "Playwright Hymn");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Test Choir");
  await expect(row).toContainText("D");
  await expect(row).toContainText("Worship");
  await expect(page.getByRole("heading", { name: "Playwright Hymn" })).toBeVisible();
  await expect(shown(page, "Playwright chorus line")).toBeVisible();
  await expect(shown(page, "Playwright verse line")).toBeVisible();
  await expect(shown(page, "2 songs in the shared library")).toBeVisible();

  await expectBackend(page, () => {
    const saved = songRow("Playwright Hymn");
    expect(saved).toMatchObject({
      artist: "Test Choir",
      musical_key: "D",
      bpm: 96,
      category_id: CATEGORY_ID,
    });
    const sections = rows("song_lyric_sections")
      .filter((section) => section.song_id === saved?.id)
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    expect(sections.map((section) => [section.section, section.content])).toEqual([
      ["Verse 1", "Playwright verse line"],
      ["Chorus", "Playwright chorus line"],
    ]);
  });
  await shot(page, "library-song-created");
});

test("songs: edit an existing song's title keeps its language", async ({ page }) => {
  await signIn(page);
  await openSongs(page);

  await songTableRow(page, "Amazing Grace").click();
  await page.getByRole("button", { name: "Edit song" }).click();
  await expect(page.locator("#song-title")).toHaveValue("Amazing Grace");
  await expect(page.locator("#song-artist")).toHaveValue("John Newton");
  await page.locator("#song-title").fill("Amazing Grace (My Chains Are Gone)");
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect(songTableRow(page, "Amazing Grace (My Chains Are Gone)")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Amazing Grace (My Chains Are Gone)" }),
  ).toBeVisible();
  // Lyrics survived the edit.
  await expect(shown(page, "Amazing grace how sweet the sound")).toBeVisible();

  // Editing must not wipe the song's language: it still shows under the English chip.
  await page.getByRole("button", { name: "English", exact: true }).filter({ visible: true }).click();
  await expect(songTableRow(page, "Amazing Grace (My Chains Are Gone)")).toHaveCount(1);

  await expectBackend(page, () => {
    const saved = rows("songs").find((row) => row.id === SONG_ID);
    expect(saved).toMatchObject({
      title: "Amazing Grace (My Chains Are Gone)",
      artist: "John Newton",
      language_id: ENGLISH_ID,
      category_id: CATEGORY_ID,
    });
  });
});

test("songs: delete a song through the confirm dialog", async ({ page }) => {
  await signIn(page);
  await openSongs(page);

  // Delete is in the detail panel and always asks for confirmation.
  await songTableRow(page, "Amazing Grace").click();
  await songDetail(page).getByRole("button", { name: "Delete song" }).click();
  const confirm = dialog(page, "Delete Song?");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('"Amazing Grace"');

  // Cancel keeps the song.
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(songTableRow(page, "Amazing Grace")).toHaveCount(1);

  // Confirming deletes it.
  await songDetail(page).getByRole("button", { name: "Delete song" }).click();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(songTableRow(page, "Amazing Grace")).toHaveCount(0);
  await expect(shown(page, "No songs found. Add one to start your library.")).toBeVisible();
  // The details sheet closes with the deleted song.
  await expect(songDetail(page)).toHaveCount(0);

  await expectBackend(page, () => {
    expect(rows("songs").some((row) => row.id === SONG_ID)).toBe(false);
  });
});

test("songs: filter by category chip and language chip", async ({ page }) => {
  await signIn(page);
  await openSongs(page);

  // An uncategorised song created with "All" languages has no language.
  await page.getByRole("button", { name: "Add Song" }).click();
  await page.locator("#song-title").fill("Loose Chorus");
  await page.locator("#song-artist").fill("Nobody");
  await page.getByRole("button", { name: "Save Song" }).click();
  await expect(songTableRow(page, "Loose Chorus")).toHaveCount(1);
  await expect(songTableRow(page, "Loose Chorus")).toContainText("Uncategorized");

  const chip = (name: string) =>
    page.getByRole("button", { name, exact: true }).filter({ visible: true });

  // Category chip
  await chip("Worship").click();
  await expect(songTableRow(page, "Amazing Grace")).toHaveCount(1);
  await expect(songTableRow(page, "Loose Chorus")).toHaveCount(0);
  await chip("Worship").click(); // toggles off
  await expect(songTableRow(page, "Loose Chorus")).toHaveCount(1);
  await expect(songTableRow(page, "Amazing Grace")).toHaveCount(1);

  // Language chip
  await chip("English").click();
  await expect(songTableRow(page, "Amazing Grace")).toHaveCount(1);
  await expect(songTableRow(page, "Loose Chorus")).toHaveCount(0);
  await chip("All").click();
  await expect(songTableRow(page, "Loose Chorus")).toHaveCount(1);

  // Both filters combine; a song created under the English chip inherits English.
  await chip("English").click();
  await page.getByRole("button", { name: "Add Song" }).click();
  await page.locator("#song-title").fill("English Anthem");
  await page.locator("#song-artist").fill("Choir");
  await page.getByRole("button", { name: "Save Song" }).click();
  await expect(songTableRow(page, "English Anthem")).toHaveCount(1);
  await chip("Worship").click();
  await expect(songTableRow(page, "Amazing Grace")).toHaveCount(1);
  await expect(songTableRow(page, "English Anthem")).toHaveCount(0);
  await expect(songTableRow(page, "Loose Chorus")).toHaveCount(0);

  await expectBackend(page, () => {
    expect(songRow("Loose Chorus")?.language_id ?? null).toBeNull();
    expect(songRow("English Anthem")?.language_id).toBe(ENGLISH_ID);
  });
});

test("songs: selecting a song opens its detail and lyrics preview", async ({ page }) => {
  await signIn(page);
  await openSongs(page);

  // Add a second song so selection actually changes the panel.
  await page.getByRole("button", { name: "Add Song" }).click();
  await page.locator("#song-title").fill("Be Thou My Vision");
  await page.locator("#song-artist").fill("Traditional");
  await page.locator("#song-lyrics").fill("[Verse 1]\nBe thou my vision O Lord of my heart");
  await page.locator("#song-key").selectOption("Eb");
  await page.getByRole("button", { name: "Save Song" }).click();
  await expect(page.getByRole("heading", { name: "Be Thou My Vision" })).toBeVisible();

  await songTableRow(page, "Amazing Grace").click();
  await expect(page).toHaveURL(new RegExp(`song=${SONG_ID}`));
  await expect(page.getByRole("heading", { name: "Amazing Grace", exact: true })).toBeVisible();
  const detail = songDetail(page);
  await expect(detail.getByText("John Newton", { exact: true })).toBeVisible();
  await expect(detail.getByText("Lyrics", { exact: true })).toBeVisible();
  await expect(detail.getByText("Verse 1", { exact: true })).toBeVisible();
  await expect(shown(page, "Amazing grace how sweet the sound")).toBeVisible();
  await expect(shown(page, "Be thou my vision O Lord of my heart")).toBeHidden();
  // Properties: key, BPM, time signature
  await expect(detail.locator("dl")).toContainText(/Key\s*G/);
  await expect(detail.locator("dl")).toContainText(/BPM\s*72/);
  await expect(detail.locator("dl")).toContainText(/Time signature\s*3\/4/);

  await songTableRow(page, "Be Thou My Vision").click();
  await expect(page.getByRole("heading", { name: "Be Thou My Vision" })).toBeVisible();
  await expect(shown(page, "Be thou my vision O Lord of my heart")).toBeVisible();
  await expect(shown(page, "Amazing grace how sweet the sound")).toBeHidden();

  // Deep link straight to a song's detail.
  await page.goto(`/songs?song=${SONG_ID}`);
  await expect(page.getByRole("heading", { name: "Amazing Grace", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(shown(page, "Amazing grace how sweet the sound")).toBeVisible();
  await shot(page, "library-song-detail");
});

/* ------------------------------------------------------------- Categories */

async function openCategories(page: Page) {
  await openSection(page, "Categories");
  await expect(page.getByRole("heading", { name: "Category Management" })).toBeVisible();
}

test("categories: create a category", async ({ page }) => {
  await signIn(page);
  await openCategories(page);

  await page.getByRole("button", { name: "Add Category" }).click();
  const form = dialog(page, "New Category");
  await expect(form).toBeVisible();
  await form.getByPlaceholder("e.g. Worship").fill("Youth Night");
  await form.getByPlaceholder("How this category is used in a service.").fill("Friday youth songs");
  await form.getByRole("button", { name: "Create Category" }).click();
  await expect(form).toBeHidden();

  await expect(page.getByRole("heading", { name: "Youth Night" })).toBeVisible();
  await expect(shown(page, "Friday youth songs")).toBeVisible();

  await expectBackend(page, () => {
    const saved = rows("categories").find((row) => row.name === "Youth Night");
    expect(saved).toMatchObject({ description: "Friday youth songs", sort_order: 1 });
  });

  // New category is offered as a filter chip on the Songs page.
  await openSection(page, "Songs");
  await expect(
    page.getByRole("button", { name: "Youth Night", exact: true }).filter({ visible: true }),
  ).toBeVisible();
});

test("categories: rename a category", async ({ page }) => {
  await signIn(page);
  await openCategories(page);
  await expect(page.getByRole("heading", { name: "Worship" })).toBeVisible();

  await page.getByRole("button", { name: "More actions for Worship" }).click();
  await page.getByRole("menuitem", { name: "Edit Details" }).click();
  const form = dialog(page, "Edit Category");
  await expect(form).toBeVisible();
  const name = form.getByPlaceholder("e.g. Worship");
  await expect(name).toHaveValue("Worship");
  await name.fill("Praise & Worship");
  await form.getByPlaceholder("How this category is used in a service.").fill("Opening set");
  await form.getByRole("button", { name: "Save Changes" }).click();
  await expect(form).toBeHidden();

  await expect(page.getByRole("heading", { name: "Praise & Worship" })).toBeVisible();
  await expect(shown(page, "Opening set")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Worship", exact: true })).toHaveCount(0);

  await expectBackend(page, () => {
    const saved = rows("categories").find((row) => row.id === CATEGORY_ID);
    expect(saved).toMatchObject({ name: "Praise & Worship", description: "Opening set" });
  });

  // The song in that category shows the new name.
  await openSection(page, "Songs");
  await expect(songTableRow(page, "Amazing Grace")).toContainText("Praise & Worship");
});

test("categories: delete a category", async ({ page }) => {
  await signIn(page);
  await openCategories(page);

  await page.getByRole("button", { name: "More actions for Worship" }).click();
  await page.getByRole("menuitem", { name: /Delete$/ }).click();
  const confirm = dialog(page, "Delete Category?");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("delete “Worship”?");
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("heading", { name: "Worship", exact: true })).toHaveCount(0);

  await expectBackend(page, () => {
    expect(rows("categories").some((row) => row.id === CATEGORY_ID)).toBe(false);
  });
});

/* ---------------------------------------------------------------- Sermons */

async function openSermons(page: Page) {
  await openSection(page, "Sermon");
  await expect(page.getByRole("heading", { name: "Sermons" })).toBeVisible();
}

test("sermons: create and save a new sermon", async ({ page }) => {
  await signIn(page);
  await openSermons(page);

  await page.getByRole("button", { name: "New Sermon" }).click();
  await expect(shown(page, "New sermon")).toBeVisible();
  await page.getByPlaceholder("Sermon title").fill("Living Water");
  await page.getByRole("button", { name: /^(save)?\s*Save$/i }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();
  await expect(shown(page, "Edit sermon")).toBeVisible();
  await expect(page).toHaveURL(/sermon=[0-9a-f-]{36}/);

  await page.getByRole("button", { name: "Sermons" }).click();
  await expect(shown(page, "Living Water")).toBeVisible();

  await expectBackend(page, () => {
    const saved = rows("sermons").find((row) => row.title === "Living Water");
    expect(saved).toMatchObject({ status: "ready", archived_at: null });
  });
});

test("sermons: edit an existing sermon's title", async ({ page }) => {
  await signIn(page);
  await openSermons(page);

  await page.getByRole("button", { name: /Grace Upon Grace John/ }).click();
  await expect(shown(page, "Edit sermon")).toBeVisible();
  const titleInput = page.getByPlaceholder("Sermon title");
  await expect(titleInput).toHaveValue("Grace Upon Grace");
  await titleInput.fill("Grace Upon Grace, Part 2");
  await expect(shown(page, /Unsaved changes/)).toBeVisible();
  await page.getByRole("button", { name: /^(save)?\s*Save$/i }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();
  await expect(shown(page, "All changes saved")).toBeVisible();

  await page.getByRole("button", { name: "Sermons" }).click();
  await expect(shown(page, "Grace Upon Grace, Part 2")).toBeVisible();

  await expectBackend(page, () => {
    const saved = rows("sermons").find((row) => row.id === SERMON_ID);
    expect(saved).toMatchObject({ title: "Grace Upon Grace, Part 2", speaker_name: "Pastor Kim" });
  });
});

test("sermons: delete a sermon from the library", async ({ page }) => {
  await signIn(page);
  await openSermons(page);
  await expect(shown(page, "Grace Upon Grace")).toBeVisible();

  await page.getByRole("button", { name: "More actions for Grace Upon Grace" }).click();
  await page.getByRole("menuitem", { name: /Delete$/ }).click();
  const confirm = dialog(page, "Delete Sermon?");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("button", { name: /Grace Upon Grace John/ })).toHaveCount(0);

  await expectBackend(page, () => {
    expect(rows("sermons").some((row) => row.id === SERMON_ID)).toBe(false);
  });
});

/* --------------------------------------------------------------- Setlists */

async function openSetlists(page: Page) {
  await openSection(page, "Setlists");
  await expect(page.getByRole("heading", { name: "Setlists", exact: true })).toBeVisible();
}

function setlistItems(page: Page) {
  return page.getByRole("button", { name: "Remove item" }).filter({ visible: true });
}

test("setlists: create, quick-add a song, and remove an item", async ({ page }) => {
  await signIn(page);
  await openSetlists(page);

  await page.getByRole("button", { name: "New Setlist" }).click();
  const form = dialog(page, /New Setlist|Create Setlist|Setlist/);
  await page.getByPlaceholder("e.g. Sunday Morning Worship").fill("Evening Prayer");
  await page.getByRole("button", { name: "Create Setlist" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("heading", { name: "Evening Prayer" })).toBeVisible();
  await expect(setlistItems(page)).toHaveCount(0);

  const quickAdd = page.getByRole("complementary", { name: "Add to setlist" });
  await quickAdd.getByRole("button", { name: "Add Amazing Grace to setlist" }).click();
  await expect(setlistItems(page)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Amazing Grace" }).filter({ visible: true })).toBeVisible();

  let setlistId = "";
  await expectBackend(page, () => {
    const created = rows("setlists").find((row) => row.name === "Evening Prayer");
    expect(created).toBeTruthy();
    setlistId = String(created?.id);
    const items = rows("setlist_items").filter((row) => row.setlist_id === setlistId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ item_type: "song", song_id: SONG_ID, title: "Amazing Grace" });
  });

  await setlistItems(page).first().click();
  await expect(setlistItems(page)).toHaveCount(0);
  await expect(shown(page, "Item removed.")).toBeVisible();

  await expectBackend(page, () => {
    expect(rows("setlist_items").filter((row) => row.setlist_id === setlistId)).toHaveLength(0);
  });
  // The seeded setlist is untouched.
  expect(rows("setlist_items").filter((row) => row.setlist_id === SETLIST_ID)).toHaveLength(1);
  await shot(page, "library-setlist-items");
});

async function openSundayMorning(page: Page) {
  await openSetlists(page);
  await page.getByRole("button", { name: /Sunday Morning/ }).first().click();
  await expect(page.getByRole("heading", { name: "Sunday Morning" })).toBeVisible();
}

test("setlists: rename a setlist", async ({ page }) => {
  await signIn(page);
  await openSundayMorning(page);

  await page.getByRole("button", { name: "Edit setlist", exact: true }).filter({ visible: true }).click();
  const name = page.locator("#setlist-name");
  await expect(name).toHaveValue("Sunday Morning");
  await name.fill("Sunday Celebration");
  await page.getByRole("button", { name: "Save Setlist" }).click();
  await expect(name).toBeHidden();

  await expect(page.getByRole("heading", { name: "Sunday Celebration" })).toBeVisible();
  // Items are kept.
  await expect(setlistItems(page)).toHaveCount(1);

  // Back on the setlist index, only the new name is listed.
  await page.getByRole("button", { name: "Setlists", exact: true }).filter({ visible: true }).click();
  await expect(
    page.getByRole("button", { name: /Sunday Celebration/ }).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /Sunday Morning/ }).filter({ visible: true }),
  ).toHaveCount(0);

  await expectBackend(page, () => {
    const saved = rows("setlists").find((row) => row.id === SETLIST_ID);
    expect(saved).toMatchObject({ name: "Sunday Celebration", archived_at: null });
  });
});

test("setlists: delete a setlist", async ({ page }) => {
  await signIn(page);
  await openSundayMorning(page);

  await page.getByRole("button", { name: "More setlist actions" }).click();
  await page.getByRole("menuitem", { name: "Delete setlist" }).click();
  const confirm = dialog(page, "Delete Setlist?");
  await expect(confirm).toContainText('"Sunday Morning"');
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("heading", { name: "Sunday Morning" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Sunday Morning/ }).filter({ visible: true })).toHaveCount(0);

  await expectBackend(page, () => {
    expect(rows("setlists").some((row) => row.id === SETLIST_ID)).toBe(false);
  });
});

test("setlists: assignments dialog closes from its X (date picker never covers it)", async ({ page }) => {
  await signIn(page);
  await openSundayMorning(page);
  await page
    .getByRole("complementary", { name: "Add to setlist" })
    .getByRole("button", { name: /Assignments/ })
    .first()
    .click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Assignments" })).toBeVisible();

  // The native calendar opens above the date field. Keep the field in the left
  // column so that popup can never sit on top of the close button (top-right).
  const date = (await panel.locator('input[type="date"]').boundingBox())!;
  const close = (await panel.getByRole("button", { name: "Close" }).boundingBox())!;
  expect(date.x + date.width).toBeLessThan(close.x - 120);

  await panel.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(rows("setlist_items").filter((row) => row.item_type === "roster")).toHaveLength(0);
});
