import { expect, test, type Page, type Route } from "@playwright/test";
import {
  installSupabaseMock,
  PENDING_USER_ID,
  profile,
  requestLog,
  writesTo,
} from "./support/supabaseMock";
import { goTo, shot, shown, signIn } from "./support/helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/* ------------------------------------------------------------------ helpers */

function rpcCalls(name: string) {
  return requestLog
    .filter((entry) => entry.method === "POST" && entry.path === `/rest/v1/rpc/${name}`)
    .map((entry) => JSON.parse(entry.body || "{}") as Record<string, unknown>);
}

/** Settings rows associate each label with its control (`for`/`id`). */
function field(page: Page, label: string) {
  return page.getByRole("tabpanel").getByLabel(label, { exact: true });
}

function navLink(page: Page, label: string) {
  return page.locator("aside nav").getByRole("link", { name: new RegExp(`${label}$`) });
}

async function openSettings(page: Page, tab?: string) {
  await navLink(page, "Settings").click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  if (tab) {
    await page.getByRole("tab", { name: new RegExp(tab) }).click();
    await expect(page.getByRole("tab", { name: new RegExp(tab) })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }
}

function json(route: Route, status: number, body: unknown) {
  const origin = route.request().headers()["origin"] || "*";
  return route.fulfill({
    status,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "*",
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
}

/** Register an RPC override after the shared mock (later routes win). */
async function overrideRpc(
  page: Page,
  name: string,
  handler: (body: Record<string, unknown>, route: Route) => Promise<void>,
) {
  await page.route(new RegExp(`/rest/v1/rpc/${name}(\\?|$)`), async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": route.request().headers()["origin"] || "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });
      return;
    }
    await handler(JSON.parse(route.request().postData() || "{}"), route);
  });
}

/* -------------------------------------------------------------------- tests */

test("profile: display name saves through update_my_profile and persists", async ({ page }) => {
  await signIn(page);
  await expect(shown(page, /Avery/)).toBeVisible(); // dashboard greeting uses first name
  await openSettings(page, "Your profile");

  const name = page.getByRole("tabpanel").locator('input[autocomplete="name"]');
  await expect(name).toHaveValue("Avery Lane");
  await expect(shown(page, "Signed in as operator@gracechapel.test")).toBeVisible();

  await name.fill("Morgan Reed");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(shown(page, "Profile updated.")).toBeVisible();

  await expect.poll(() => rpcCalls("update_my_profile").at(-1)?.p_name).toBe("Morgan Reed");
  await expect(name).toHaveValue("Morgan Reed");
  // Avatar fallback initial follows the saved name.
  await expect(page.getByRole("tabpanel").getByText("M", { exact: true })).toBeVisible();

  // Mismatched new password is rejected locally, no second profile write.
  const writes = rpcCalls("update_my_profile").length;
  const passwords = page.getByRole("tabpanel").locator('input[autocomplete="new-password"]');
  await passwords.nth(0).fill("longenough1");
  await passwords.nth(1).fill("longenough2");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(shown(page, "Passwords do not match.")).toBeVisible();
  expect(rpcCalls("update_my_profile")).toHaveLength(writes);

  // Server copy survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("tabpanel").locator('input[autocomplete="name"]')).toHaveValue(
    "Morgan Reed",
  );
  await shot(page, "settings-profile");
});

test("team accounts: approve the pending member, then promote them", async ({ page }) => {
  await signIn(page);
  await openSettings(page, "Team accounts");

  const approvals = page.getByRole("tabpanel").locator("section").filter({ hasText: "Pending join approvals (1)" });
  await expect(approvals).toBeVisible();
  await expect(approvals.getByText("Jordan Pending")).toBeVisible();
  const jordanRow = page.getByRole("row").filter({ hasText: "Jordan Pending" });
  await expect(jordanRow).toContainText("Pending · church");
  await expect(page.getByRole("row").filter({ hasText: "Avery Lane" })).toContainText("You");

  await approvals.getByRole("button", { name: "Approve & activate" }).click();
  await expect(shown(page, "Member approved and set to active.")).toBeVisible();
  expect(rpcCalls("review_member_join").at(-1)).toEqual({
    p_user_id: PENDING_USER_ID,
    p_action: "approve",
  });
  await expect(approvals).toHaveCount(0);
  await expect(jordanRow).toContainText("Active");
  await expect(jordanRow.getByRole("cell").nth(3)).toHaveText("Active");

  // Change role in the member sheet.
  await jordanRow.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Jordan Pending" })).toBeVisible();
  await sheet
    .locator('div:has(> label:text-is("Role")) > select')
    .selectOption("producer");
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet.getByText("Changes saved.")).toBeVisible();
  expect(rpcCalls("church_update_account").at(-1)).toMatchObject({
    p_user_id: PENDING_USER_ID,
    p_role: "producer",
    p_status: "active",
  });
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(jordanRow).toContainText("Producer");

  // Search filters the roster.
  await page.getByPlaceholder("Search by name, email, phone, role…").fill("zzz-nobody");
  await expect(shown(page, "No accounts match your search.")).toBeVisible();
  await shot(page, "settings-team");
});

test("church information saves through update_my_church", async ({ page }) => {
  await signIn(page);
  await overrideRpc(page, "update_my_church", async (body, route) => {
    requestLog.push({
      method: "POST",
      path: "/rest/v1/rpc/update_my_church",
      search: "",
      body: JSON.stringify(body),
    });
    const next = profile();
    next.church.name = String(body.p_name ?? next.church.name);
    next.church.address = String(body.p_address ?? next.church.address);
    next.church.phone = String(body.p_phone ?? next.church.phone);
    await json(route, 200, next);
  });
  await openSettings(page, "Church information");

  await expect(field(page, "Church name")).toHaveValue("Grace Chapel");
  await expect(field(page, "Address")).toHaveValue("12 Chapel Road");
  await expect(field(page, "Phone")).toHaveValue("555-0100");

  await field(page, "Church name").fill("Grace Chapel North");
  await field(page, "Address").fill("99 Hill Street");
  await field(page, "Phone").fill("555-0199");
  await page.getByRole("button", { name: "Save church" }).click();
  await expect(shown(page, "Church information updated.")).toBeVisible();

  expect(rpcCalls("update_my_church").at(-1)).toMatchObject({
    p_name: "Grace Chapel North",
    p_address: "99 Hill Street",
    p_phone: "555-0199",
  });
  await expect(field(page, "Church name")).toHaveValue("Grace Chapel North");
  await expect(field(page, "Address")).toHaveValue("99 Hill Street");
  await shot(page, "settings-church");
});

test("general: theme, interface language, and backup frequency", async ({ page }) => {
  await signIn(page);
  await openSettings(page, "Appearance");
  const html = page.locator("html");

  await expect(html).not.toHaveClass(/theme-light/);
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(html).toHaveClass(/theme-light/);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(html).not.toHaveClass(/theme-light/);

  // Interface language is per user and re-labels the sidebar immediately.
  const language = page
    .getByRole("tabpanel")
    .getByRole("combobox")
    .filter({ has: page.locator('option[value="es"]') });
  await expect(language).toHaveValue("en");
  await language.selectOption("es");
  await expect(navLink(page, "Ajustes")).toBeVisible();
  await expect(navLink(page, "Canciones")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Apariencia/ })).toBeVisible();
  await expect(shown(page, "Idioma de la interfaz")).toBeVisible();
  await language.selectOption("en");
  await expect(navLink(page, "Settings")).toBeVisible();
  await expect(navLink(page, "Songs")).toBeVisible();

  // Backup frequency is a church setting: save, then push to the server.
  await page.getByRole("tab", { name: /Sync & backup/ }).click();
  await field(page, "Backup Frequency").selectOption("daily");
  // Dirty state shows the sticky save bar; saving clears it.
  const saveBar = page.getByRole("region", { name: "Unsaved changes" });
  await expect(saveBar).toContainText("Unsaved changes");
  await saveBar.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(shown(page, "Settings saved.")).toBeVisible();
  await expect(saveBar).toHaveCount(0);

  await page.getByRole("button", { name: "Backup Now" }).click();
  await expect(shown(page, "Backup complete.")).toBeVisible();
  await expect
    .poll(() =>
      writesTo("church_settings").some((entry) => entry.body.includes('"backup_frequency":"daily"')),
    )
    .toBe(true);
  await shot(page, "settings-general");
});

test("presentation & projection: transition and font persist", async ({ page }) => {
  await signIn(page);
  await openSettings(page, "Presentation & Projection");

  await expect(field(page, "Transition Style")).toHaveValue("dissolve");
  await expect(field(page, "Active Output Display")).toHaveValue(/9999/);
  await field(page, "Transition Style").selectOption("cut");
  await expect(page.getByRole("tabpanel").getByText("Unsaved")).toBeVisible();
  await page.getByRole("tabpanel").getByRole("button", { name: /Save Changes/ }).click();
  await expect(shown(page, "Settings saved.")).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText("Unsaved")).toHaveCount(0);

  // Push to the server via the header cloud control, then check the row.
  await page
    .locator("header")
    .filter({ visible: true })
    .getByRole("button", { name: /Backed up|Saved on this device|waiting to sync/ })
    .click();
  await expect
    .poll(() =>
      writesTo("church_settings").some(
        (entry) =>
          entry.body.includes('"default_transition":"cut"') &&
          entry.body.includes('"transition_ms":0'),
      ),
    )
    .toBe(true);

  // And the local copy survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("tab", { name: /Presentation & Projection/ }).click();
  await expect(field(page, "Transition Style")).toHaveValue("cut");
  await shot(page, "settings-presentation");
});

test("header: notifications panel and backup status control", async ({ page }) => {
  await signIn(page);
  let unread = true;
  await overrideRpc(page, "list_my_notifications", async (_body, route) => {
    await json(route, 200, [
      {
        id: "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f1",
        kind: "system",
        title: "Backup reminder",
        body: "Sunday service is tomorrow",
        icon: null,
        actor_id: null,
        actor_avatar_url: null,
        href: null,
        read_at: unread ? null : new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
  });
  let markedAll = false;
  await overrideRpc(page, "mark_all_notifications_read", async (_body, route) => {
    markedAll = true;
    unread = false;
    await json(route, 200, null);
  });

  const header = page.locator("header").filter({ visible: true });
  const bell = header.getByRole("button", { name: "Notifications", exact: true });
  await expect(bell).toHaveAttribute("aria-expanded", "false");
  await bell.click();
  await expect(bell).toHaveAttribute("aria-expanded", "true");
  await expect(header.getByText("Backup reminder")).toBeVisible();
  await expect(header.getByText("Sunday service is tomorrow")).toBeVisible();
  await header.getByRole("button", { name: "Mark all read" }).click();
  await expect.poll(() => markedAll).toBe(true);
  await expect(header.getByRole("button", { name: "Mark all read" })).toHaveCount(0);

  // Clicking outside closes the panel.
  await page.getByRole("heading", { name: "Production Command" }).click();
  await expect(header.getByText("Backup reminder")).toHaveCount(0);

  // Footer link opens notification settings.
  await bell.click();
  await header.getByRole("link", { name: "Notification settings" }).click();
  await expect(page).toHaveURL(/\/settings\?tab=notifications/);
  await expect(shown(page, "Notifications")).toBeVisible();
  await expect(page.getByRole("switch").first()).toHaveAttribute("aria-checked", "true");

  // Backup status control (dashboard header) runs a manual sync.
  await navLink(page, "Dashboard").click();
  await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible();
  const before = requestLog.length;
  const status = page
    .locator("header")
    .filter({ visible: true })
    .getByRole("button", { name: /Backed up|Saved on this device|waiting to sync/ });
  await expect(status).toBeVisible();
  await status.click();
  await expect.poll(() => requestLog.length).toBeGreaterThan(before);
  await expect(status).toBeEnabled();
  await shot(page, "header");
});

test("sign out returns to welcome and locks protected routes", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("welcome-email")).toBeVisible();
  expect(requestLog.some((entry) => entry.path.endsWith("/auth/v1/logout"))).toBe(true);

  for (const path of ["/settings", "/dashboard", "/songs"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/localhost:1420\/$/);
    await expect(page.getByTestId("welcome-email")).toBeVisible();
  }
  await shot(page, "signed-out");
});

test("onboarding: migration completes and lands on the dashboard", async ({ page }) => {
  await signIn(page, { onboarded: false });
  await expect(page.getByRole("heading", { name: "Welcome to Grace Chapel" })).toBeVisible();
  await expect(shown(page, /Avery Lane, this is a new MinistryCast workspace/)).toBeVisible();
  // Private routes bounce back to onboarding until it is complete.
  await goTo(page, "/settings");
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByRole("button", { name: "Start migration" }).click();
  await expect(page.getByRole("heading", { name: "Migrating your workspace" })).toBeVisible();
  await expect(shown(page, "Worship categories")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your sanctuary is ready" })).toBeVisible({
    timeout: 10_000,
  });
  expect(rpcCalls("complete_onboarding")).toHaveLength(0);

  await page.getByRole("button", { name: "Enter production" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible({
    timeout: 30_000,
  });
  expect(rpcCalls("complete_onboarding")).toHaveLength(1);

  // Onboarding is closed once done.
  await goTo(page, "/onboarding");
  await expect(page).toHaveURL(/\/dashboard/);
  await shot(page, "onboarding-done");
});

test("operator role: library nav hidden and library routes redirect", async ({ page }) => {
  await signIn(page, { role: "operator" });
  const nav = page.locator("aside nav");
  await expect(navLink(page, "Dashboard")).toBeVisible();
  await expect(navLink(page, "Setlists")).toBeVisible();
  await expect(navLink(page, "Settings")).toBeVisible();
  for (const hidden of ["Songs", "Sermon", "Categories"]) {
    await expect(nav.getByRole("link", { name: new RegExp(`${hidden}$`) })).toHaveCount(0);
  }

  for (const path of ["/songs", "/sermon", "/categories"]) {
    await goTo(page, path);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible();

  // Operators only get personal settings: profile, notifications and the
  // device/workspace pages (formerly all under General Configuration).
  await openSettings(page);
  await expect(shown(page, "Church member / operator")).toBeVisible();
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(4);
  await expect(page.getByRole("tab", { name: /Your profile/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Notifications/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Appearance/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Sync & backup/ })).toBeVisible();
  for (const hidden of [/Team accounts/, /Church information/, /Presentation/, /Approvals/]) {
    await expect(page.getByRole("tab", { name: hidden })).toHaveCount(0);
  }
  await shot(page, "operator");
});

test("sign-in shows the server error message", async ({ page }) => {
  await installSupabaseMock(page);
  await page.route(/\/auth\/v1\/token/, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": route.request().headers()["origin"] || "*",
          "access-control-allow-headers": "*",
        },
      });
      return;
    }
    await json(route, 400, {
      error: "invalid_grant",
      error_description: "Invalid login credentials",
      msg: "Invalid login credentials",
    });
  });
  await page.goto("/");
  await page.getByTestId("welcome-email").fill("operator@gracechapel.test");
  await page.getByTestId("welcome-password").fill("wrong-password");
  await page.getByTestId("welcome-continue").click();
  await expect(shown(page, /Invalid login credentials/)).toBeVisible();
  await expect(page).toHaveURL(/localhost:1420\/$/);
  await expect(page.getByTestId("welcome-continue")).toBeEnabled();
  await expect(page.getByTestId("welcome-continue")).toHaveText(/Continue/);

  await page.getByTestId("welcome-email").fill("a@b");
  await page.getByTestId("welcome-continue").click();
  await expect(shown(page, "Enter a valid email address to continue.")).toBeVisible();
  await shot(page, "sign-in-error");
});

test("reset password waits for a link, then validates and saves", async ({ page }) => {
  await installSupabaseMock(page);
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(shown(page, "Waiting for the reset link…")).toBeVisible();
  await expect(page.getByTestId("reset-password")).toHaveCount(0);

  // A recovery link signs the user in; simulate that with a real session.
  await signIn(page);
  await page.goto("/reset-password");
  await expect(shown(page, "Enter a new password for this account.")).toBeVisible();

  await page.getByTestId("reset-password").fill("abc");
  await page.getByTestId("reset-confirm").fill("abc");
  await page.getByTestId("reset-submit").click();
  await expect(shown(page, "Password must be at least 6 characters.")).toBeVisible();

  await page.getByTestId("reset-password").fill("brand-new-pass");
  await page.getByTestId("reset-confirm").fill("brand-new-pass2");
  await page.getByTestId("reset-submit").click();
  await expect(shown(page, "Passwords do not match.")).toBeVisible();
  expect(requestLog.some((e) => e.method === "PUT" && e.path === "/auth/v1/user")).toBe(false);

  await page.getByTestId("reset-confirm").fill("brand-new-pass");
  await page.getByTestId("reset-submit").click();
  await expect(shown(page, "Password updated. Sign in with the new password.")).toBeVisible();
  await expect(page).toHaveURL(/localhost:1420\/$/);
  const update = requestLog.find((e) => e.method === "PUT" && e.path === "/auth/v1/user");
  expect(JSON.parse(update?.body || "{}")).toMatchObject({ password: "brand-new-pass" });
  await expect(page.getByTestId("welcome-email")).toBeVisible();
  await shot(page, "reset-password");
});
