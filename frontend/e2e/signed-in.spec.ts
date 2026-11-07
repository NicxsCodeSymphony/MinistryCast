import { expect, test, type Page } from "@playwright/test";
import { installSupabaseMock, SONG_ID, tableRows } from "./support/supabaseMock";

test.use({ viewport: { width: 1440, height: 900 } });

async function shot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

function shown(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true }).first();
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByTestId("welcome-email").fill("operator@gracechapel.test");
  await page.getByTestId("welcome-password").fill("correct-horse");
  await page.getByTestId("welcome-continue").click();
  await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible({
    timeout: 30_000,
  });
}

async function openSection(page: Page, name: string) {
  await page.locator("nav").getByRole("link", { name }).click();
}

test.beforeEach(async ({ page }) => {
  await installSupabaseMock(page);
});

test("dashboard shows the service and opens presentation", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Sunday Morning" })).toBeVisible();
  await expect(shown(page, "Amazing Grace")).toBeVisible();
  await expect(shown(page, "Library Songs")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go Live Now" })).toBeVisible();
  await shot(page, "dashboard");

  await page.getByRole("link", { name: "Go Live Now" }).click();
  await expect(shown(page, "Standby")).toBeVisible();
  await expect(shown(page, "Amazing grace how sweet the sound")).toBeVisible();
  await shot(page, "dashboard-to-live");
});

test("songs can be searched and added", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Songs");
  await expect(page.getByRole("heading", { name: "Song Library", exact: true })).toBeVisible();
  await expect(shown(page, "Amazing Grace")).toBeVisible();
  // The details sheet opens when a song is picked.
  await page.locator("tr[data-song-row]").filter({ hasText: "Amazing Grace", visible: true }).first().click();
  await expect(shown(page, "Amazing grace how sweet the sound")).toBeVisible();

  const songSearch = page.getByPlaceholder(
    "Search by title, artist, key, category, or lyrics...",
  );
  await songSearch.fill("newton");
  await expect(shown(page, "Amazing Grace")).toBeVisible();
  await songSearch.fill("zzz-no-such-song");
  await expect(shown(page, "No songs match")).toBeVisible();
  // The empty state offers a one-click reset.
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(songSearch).toHaveValue("");
  await expect(shown(page, "Amazing Grace")).toBeVisible();
  // "/" jumps to search from anywhere on the page.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  await expect(songSearch).toBeFocused();
  await page.getByRole("button", { name: "Add Song" }).click();
  await page.locator("#song-title").fill("Playwright Hymn");
  await page.locator("#song-artist").fill("Test Choir");
  await page.getByRole("button", { name: "Save Song" }).click();
  await expect(shown(page, "Playwright Hymn")).toBeVisible();
  await shot(page, "songs");
});

test("categories can be created", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Categories");
  await expect(page.getByRole("heading", { name: "Category Management" })).toBeVisible();
  await expect(shown(page, "Worship")).toBeVisible();

  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByPlaceholder("e.g. Worship").fill("Playwright Band");
  await page.getByPlaceholder("How this category is used in a service.").fill("Automation category");
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(shown(page, "Playwright Band")).toBeVisible();
  await expect(shown(page, "Automation category")).toBeVisible();
  await shot(page, "categories");
});

test("setlists can be created and a song can be added", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Setlists");
  await expect(page.getByRole("heading", { name: "Setlists", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Sunday Morning/ }).click();
  await expect(page.getByRole("heading", { name: "Sunday Morning" })).toBeVisible();
  await expect(shown(page, "Amazing Grace")).toBeVisible();

  // New setlists are created from the index (breadcrumb back to "Setlists").
  await page.getByRole("button", { name: "Setlists", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "New Setlist" }).click();
  await page.getByPlaceholder("e.g. Sunday Morning Worship").fill("Playwright Service");
  await page.getByRole("button", { name: "Create Setlist" }).click();
  await expect(page.getByRole("heading", { name: "Playwright Service" })).toBeVisible();

  const quickAdd = page.getByRole("complementary", { name: "Add to setlist" });
  await quickAdd.getByRole("button", { name: "Add Amazing Grace to setlist" }).click();
  // The song is now an item of the new setlist, on screen and on the backend.
  await expect(
    page.getByRole("heading", { name: "Amazing Grace", level: 4 }).filter({ visible: true }),
  ).toBeVisible();
  await page.locator("header button").filter({ hasText: /Backed up|waiting|Saved/ }).first().click();
  await expect
    .poll(() => {
      const setlist = tableRows("setlists").find((row) => row.name === "Playwright Service");
      return tableRows("setlist_items").filter(
        (row) => row.setlist_id === setlist?.id && row.song_id === SONG_ID,
      ).length;
    }, { timeout: 20_000 })
    .toBe(1);
  await shot(page, "setlists");
});

test("sermons can be opened and saved", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Sermon");
  await expect(page.getByRole("heading", { name: "Sermons" })).toBeVisible();
  await expect(shown(page, "Grace Upon Grace")).toBeVisible();
  await page.getByRole("button", { name: /Grace Upon Grace John/ }).click();
  await expect(shown(page, "Edit sermon")).toBeVisible();
  await page.getByRole("button", { name: "Sermons" }).click();

  await page.getByRole("button", { name: "New Sermon" }).click();
  await page.getByPlaceholder("Sermon title").fill("Playwright Message");
  await page.getByRole("button", { name: /Save/ }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();
  await page.getByRole("button", { name: "Sermons" }).click();
  await expect(shown(page, "Playwright Message")).toBeVisible();
  await shot(page, "sermons");
});

test("presentation decks, go live, blackout, and end session", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Presentation");

  await expect(shown(page, "Standby")).toBeVisible();
  await expect(shown(page, "Standby Preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Setlist" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sunday Morning" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(shown(page, "Amazing grace how sweet the sound")).toBeVisible();
  await expect(shown(page, "Slide 1 / 1")).toBeVisible();
  await expect(
    shown(page, "Standby is preview only. Press Go Live to edit slides, assignments, and output."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Blackout" })).toBeDisabled();

  await page.getByTitle("Hide setlist deck").click();
  await expect(page.getByRole("heading", { name: "Setlist" })).toBeHidden();
  await page.getByTitle("Show setlist deck").click();
  await expect(page.getByRole("heading", { name: "Setlist" })).toBeVisible();

  await page.getByTitle("Hide controls deck").click();
  await expect(page.getByRole("button", { name: "Blackout" })).toBeHidden();
  await page.getByTitle("Show controls deck").click();
  await expect(page.getByRole("button", { name: "Blackout" })).toBeVisible();
  await shot(page, "presentation-standby");

  await page.getByRole("button", { name: "Go Live" }).click();
  await expect(shown(page, "You’re live.")).toBeVisible();
  await expect(shown(page, "On Air")).toBeVisible();
  await expect(shown(page, "On Air Preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Blackout" })).toBeEnabled();

  await page.getByRole("button", { name: "Edit Mode" }).click();
  await expect(page.getByLabel("Item to edit")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByLabel("Item to edit")).toBeHidden();

  await page.getByRole("button", { name: "Blackout" }).click();
  await expect(page.locator("p").filter({ hasText: /^Blackout$/ })).toBeVisible();
  await page.getByRole("button", { name: "Blackout" }).click();
  await expect(shown(page, "Amazing grace how sweet the sound")).toBeVisible();

  await page.getByRole("button", { name: "Next slide" }).click();
  await expect(shown(page, "Slide 1 / 1")).toBeVisible();
  await shot(page, "presentation-live");

  await page.getByRole("button", { name: "End Presentation" }).click();
  // Ending a live service asks first; Cancel keeps you on air.
  await page.getByRole("dialog", { name: "End the presentation?" }).getByRole("button", { name: "Cancel" }).click();
  await expect(shown(page, "On Air")).toBeVisible();
  await page.getByRole("button", { name: "End Presentation" }).click();
  await page
    .getByRole("dialog", { name: "End the presentation?" })
    .getByRole("button", { name: "End Presentation" })
    .click();
  await expect(shown(page, "Live session ended.")).toBeVisible();
  await expect(shown(page, "Standby")).toBeVisible();
  await expect(page.getByRole("button", { name: "Go Live" })).toBeVisible();
});

test("chat can send a message in the church channel", async ({ page }) => {
  await signIn(page);
  await openSection(page, "Chat");
  await expect(page.getByRole("heading", { name: "Communications" })).toBeVisible();
  await expect(shown(page, "Grace Chapel")).toBeVisible();
  const composer = page.getByPlaceholder("Message Grace Chapel...");
  await composer.fill("Playwright checking in");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(shown(page, "Playwright checking in")).toBeVisible();
  await expect(composer).toHaveValue("");
  await shot(page, "chat");
});
