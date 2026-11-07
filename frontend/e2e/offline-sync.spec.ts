import { expect, test, type Page } from "@playwright/test";
import { openSection, shot, shown, signIn } from "./support/helpers";
import { setNetworkDown, tableRows, writesTo } from "./support/supabaseMock";
import type { BrowserContext } from "@playwright/test";

/** Real offline: browser reports offline AND the backend is unreachable. */
async function goOffline(context: BrowserContext) {
  setNetworkDown(true);
  await context.setOffline(true);
}

async function goOnline(context: BrowserContext) {
  setNetworkDown(false);
  await context.setOffline(false);
}

/**
 * Offline-first backend flow.
 * The app writes to IndexedDB first and pushes an outbox to Supabase when it
 * can. These tests cut the network for real (browser offline emulation) and
 * check, through the mock's request log, what did and did not reach the server.
 */

test.use({ viewport: { width: 1440, height: 900 } });

function syncStatus(page: Page) {
  // Header pill: "Backed up", "Offline", "N pending · offline", "Backup failed"...
  return page.locator("header button").filter({ hasText: /Backed up|Offline|pending|waiting|Backing up|Backup failed|Saved on this device/ });
}

async function addSong(page: Page, title: string, artist: string) {
  await openSection(page, "Songs");
  await expect(page.getByRole("heading", { name: "Song Library", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Song" }).click();
  await page.locator("#song-title").fill(title);
  await page.locator("#song-artist").fill(artist);
  await page.getByRole("button", { name: "Save Song" }).click();
  await expect(shown(page, title)).toBeVisible();
}

test("edits made offline stay on the device, then sync when the network returns", async ({
  page,
  context,
}) => {
  await signIn(page);
  await expect(syncStatus(page)).toHaveText(/Backed up/, { timeout: 20_000 });
  // Web builds pull the remaining page code in the background once idle; a
  // real session is open longer than this test before the network drops.
  await expect(page.locator("html[data-pages-ready='1']")).toHaveCount(1, { timeout: 30_000 });

  // ── Go offline ────────────────────────────────────────────────────────
  await goOffline(context);
  await expect(syncStatus(page)).toHaveText(/Offline/);

  await addSong(page, "Offline Anthem", "Basement Choir");
  await expect(syncStatus(page)).toHaveText(/pending · offline/, { timeout: 15_000 });
  await shot(page, "offline-song-saved-locally");

  // Nothing reached the backend while offline, and the session survived
  // the failed profile checks (falls back to the cached profile).
  expect(writesTo("songs")).toHaveLength(0);
  expect(tableRows("songs").map((row) => row.title)).not.toContain("Offline Anthem");

  // Offline reads still work: navigate elsewhere and back, data comes from IndexedDB.
  await openSection(page, "Setlists");
  await expect(page.getByRole("button", { name: /Sunday Morning/ })).toBeVisible();
  await openSection(page, "Songs");
  await expect(shown(page, "Offline Anthem")).toBeVisible();
  await expect(shown(page, "Amazing Grace")).toBeVisible();

  // ── Back online: the outbox flushes on its own ────────────────────────
  await goOnline(context);
  await expect
    .poll(() => tableRows("songs").map((row) => row.title), { timeout: 20_000 })
    .toContain("Offline Anthem");
  const pushed = tableRows("songs").find((row) => row.title === "Offline Anthem");
  expect(pushed).toMatchObject({ artist: "Basement Choir" });
  expect(writesTo("songs").length).toBeGreaterThan(0);
  await expect(syncStatus(page)).toHaveText(/Backed up/, { timeout: 20_000 });
  await shot(page, "online-synced");
});

test("a failed backup keeps the change queued and retries successfully", async ({ page }) => {
  await signIn(page);
  await expect(syncStatus(page)).toHaveText(/Backed up/, { timeout: 20_000 });

  // Server rejects song writes (e.g. an outage).
  let failing = true;
  await page.route(/\.supabase\.co\/rest\/v1\/songs/, async (route) => {
    if (failing && route.request().method() !== "GET") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ message: "Service unavailable" }),
      });
      return;
    }
    await route.fallback();
  });

  await addSong(page, "Retry Hymn", "Resilient Band");
  await syncStatus(page).click(); // manual "Backup now"
  await expect(syncStatus(page)).toHaveText(/Backup failed/, { timeout: 20_000 });
  expect(tableRows("songs").map((row) => row.title)).not.toContain("Retry Hymn");
  // The song is still on the device.
  await expect(shown(page, "Retry Hymn")).toBeVisible();
  await shot(page, "backup-failed");

  // Server recovers; the next manual backup pushes the queued song.
  failing = false;
  await syncStatus(page).click();
  await expect
    .poll(() => tableRows("songs").map((row) => row.title), { timeout: 20_000 })
    .toContain("Retry Hymn");
  await expect(syncStatus(page)).toHaveText(/Backed up/, { timeout: 20_000 });
});

test("data written online on one device is pulled into a fresh session", async ({ page }) => {
  await signIn(page);
  await addSong(page, "Shared Psalm", "Device A");
  await syncStatus(page).click();
  await expect
    .poll(() => tableRows("songs").map((row) => row.title), { timeout: 20_000 })
    .toContain("Shared Psalm");

  // Simulate a second device: wipe all local state, keep the backend.
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(
        (db) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(db.name!);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          }),
      ),
    );
  });
  await page.goto("/");
  await page.getByTestId("welcome-email").fill("operator@gracechapel.test");
  await page.getByTestId("welcome-password").fill("correct-horse");
  await page.getByTestId("welcome-continue").click();
  await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible({
    timeout: 30_000,
  });
  await openSection(page, "Songs");
  await expect(shown(page, "Shared Psalm")).toBeVisible({ timeout: 15_000 });
  await shot(page, "pulled-on-second-device");
});

test("the app cold-starts from the device when the backend is unreachable", async ({ page }) => {
  await signIn(page);
  await expect(syncStatus(page)).toHaveText(/Backed up/, { timeout: 20_000 });

  // Backend goes away (dev server still serves the app shell), then a full reload.
  setNetworkDown(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "Sunday Morning" })).toBeVisible();
  await openSection(page, "Songs");
  await expect(shown(page, "Amazing Grace")).toBeVisible();
  // The details sheet opens when a song is picked.
  await page.locator("tr[data-song-row]").filter({ hasText: "Amazing Grace", visible: true }).first().click();
  await expect(shown(page, "Amazing grace how sweet the sound")).toBeVisible();
  await shot(page, "cold-start-backend-down");
});
