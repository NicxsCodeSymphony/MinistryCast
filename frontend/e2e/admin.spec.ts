import { expect, test, type Page, type Route } from "@playwright/test";
import {
  CHURCH_ID,
  OTHER_CHURCH_ID,
  PENDING_USER_ID,
  USER_ID,
  requestLog,
  tableRows,
} from "./support/supabaseMock";
import { goTo, shown, signIn } from "./support/helpers";

/** JSON bodies of every mocked RPC call with this name, in order. */
function rpcCalls(name: string) {
  return requestLog
    .filter((entry) => entry.path === `/rest/v1/rpc/${name}`)
    .map((entry) => JSON.parse(entry.body || "{}") as Record<string, unknown>);
}

function corsJson(route: Route, body: unknown) {
  const origin = route.request().headers()["origin"] || "*";
  return route.fulfill({
    status: 200,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
}

/** Route one RPC to a custom handler (registered after the mock, so it wins). */
async function overrideRpc(
  page: Page,
  name: string,
  handler: (body: Record<string, unknown>, route: Route) => Promise<void>,
) {
  await page.route(`**/rest/v1/rpc/${name}`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const body = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
    await handler(body, route);
  });
}

/** One overview metric in the metrics strip, matched by its label. */
function metric(page: Page, label: string) {
  return page.locator(`[data-metric="${label}"]`).filter({ visible: true }).first();
}

/** A tab of the Platform sub-navigation shared by every Platform page. */
function platformTab(page: Page, name: string | RegExp) {
  return page
    .getByRole("navigation", { name: "Platform sections" })
    .getByRole("link", typeof name === "string" ? { name, exact: true } : { name })
    .filter({ visible: true });
}

function platformHeading(page: Page) {
  return page.getByRole("heading", { name: "Platform", exact: true });
}

/** The admin side editor that slides in beside the roster. */
function editor(page: Page) {
  return page.locator('aside[aria-hidden="false"]');
}

/** Sidebar links carry a Material icon ligature before the label. */
function navLink(page: Page, name: string) {
  return page.locator("nav").getByRole("link", { name: new RegExp(`^\\S+ ${name}$`) });
}

function search(page: Page) {
  return page.locator("#app-search");
}

test.describe("superadmin platform console", () => {
  test("overview shows live stats, devices, audit activity and working quick links", async ({
    page,
  }) => {
    await signIn(page, { role: "superadmin" });
    // Lazy route chunks can take a while on a loaded machine.
    await expect(platformHeading(page)).toBeVisible({ timeout: 30_000 });

    // Stats are derived from the mock rows: 2 churches (1 active), 2 accounts
    // (1 active), 1 pending church, 1 device, 1 audit event.
    const churches = metric(page, "Churches");
    await expect(churches.locator('[data-part="value"]')).toHaveText("2");
    await expect(churches.locator('[data-part="hint"]')).toHaveText("1 active · 0 suspended");
    const accounts = metric(page, "Accounts");
    await expect(accounts.locator('[data-part="value"]')).toHaveText("2");
    await expect(accounts.locator('[data-part="hint"]')).toHaveText("1 active");
    await expect(metric(page, "Approvals").locator('[data-part="value"]')).toHaveText("1");
    await expect(metric(page, "Devices").locator('[data-part="value"]')).toHaveText("1");
    const audit = metric(page, "Actions today");
    await expect(audit.locator('[data-part="value"]')).toHaveText("1");
    await expect(audit.locator('[data-part="hint"]')).toHaveText("1 all time");

    // Needs attention: the pending church signup and the pending account.
    const attention = page.getByRole("region", { name: "Needs attention" }).filter({ visible: true });
    await expect(attention.locator("li")).toHaveCount(2);
    await expect(attention.locator("li").nth(0)).toContainText("Hope Fellowship");
    await expect(attention.locator("li").nth(0)).toContainText("Church signup awaiting approval");
    await expect(attention.locator("li").nth(1)).toContainText("Jordan Pending");
    await expect(attention.locator("li").nth(1)).toContainText("Account pending activation");

    // Most active churches ranks Grace Chapel (14 actions) above Hope Fellowship.
    const ranked = page
      .getByRole("region", { name: "Most active churches" })
      .filter({ visible: true })
      .locator("li");
    await expect(ranked).toHaveCount(2);
    await expect(ranked.nth(0)).toContainText("Grace Chapel");
    await expect(ranked.nth(0)).toContainText("14");
    await expect(ranked.nth(1)).toContainText("Hope Fellowship");

    // Recent audit activity.
    await expect(shown(page, "Avery Lane added Amazing Grace")).toBeVisible();
    await expect(shown(page, /song\.create/)).toBeVisible();

    // Backend: the overview pages through events at the RPC's 200-row cap to
    // chart activity (one page here: the mock holds a single event).
    expect(rpcCalls("admin_overview").length).toBeGreaterThanOrEqual(1);
    expect(rpcCalls("admin_list_events")[0]).toMatchObject({ p_limit: 200, p_offset: 0 });
    expect(rpcCalls("admin_list_events").map((body) => body.p_offset)).not.toContain(200);

    // Bento charts: activity over time, accounts by role.
    const activity = page.getByRole("region", { name: "Activity", exact: true }).filter({ visible: true });
    await expect(activity).toContainText("1 event");
    await expect(activity.getByRole("img", { name: /Audit events per day/ })).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Accounts by role: Admins 1, Operators 1" }),
    ).toBeVisible();

    // Devices live on Accounts > Devices; the Devices metric links there.
    await metric(page, "Devices").click();
    await expect(page).toHaveURL(/\/admin\/accounts\?view=devices$/);
    await expect(page.getByRole("tab", { name: /Devices/ })).toHaveAttribute("aria-selected", "true");
    const deviceRow = page.getByRole("row").filter({ hasText: "macos browser" });
    await expect(deviceRow).toBeVisible();
    await expect(deviceRow).toContainText("Avery Lane");
    await expect(deviceRow).toContainText("Grace Chapel");
    await expect(deviceRow).toContainText("1.0.20");
    expect(rpcCalls("admin_list_devices").length).toBeGreaterThanOrEqual(1);
    await page.getByRole("tab", { name: /Accounts/ }).click();
    await expect(page).toHaveURL(/\/admin\/accounts$/);

    // Sub-navigation (replaces the old quick links) and the breadcrumb back.
    await platformTab(page, "Overview").click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(platformHeading(page)).toBeVisible();
    const links: [string, RegExp, string][] = [
      ["Churches", /\/admin\/churches$/, "Churches"],
      ["Accounts", /\/admin\/accounts$/, "Accounts"],
      ["Audit log", /\/admin\/audit$/, "Audit log"],
    ];
    for (const [label, url, heading] of links) {
      await platformTab(page, label).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(platformTab(page, label)).toHaveAttribute("aria-current", "page");
      await page.getByRole("button", { name: "Platform", exact: true }).filter({ visible: true }).click();
      await expect(page).toHaveURL(/\/admin$/);
      await expect(platformHeading(page)).toBeVisible();
    }

    // Needs-attention actions jump to the right place.
    await attention.getByRole("link", { name: "Review Jordan Pending" }).click();
    await expect(page).toHaveURL(/\/admin\/accounts$/);
    await expect(editor(page).getByRole("heading", { name: "Jordan Pending" })).toBeVisible();
    await goTo(page, "/admin");
    await expect(platformHeading(page)).toBeVisible();

    await page
      .getByRole("region", { name: "Needs attention" })
      .filter({ visible: true })
      .getByRole("link", { name: "Review Hope Fellowship" })
      .click();
    await expect(page).toHaveURL(/\/settings\?tab=approvals$/);
    await expect(page.getByRole("tab", { name: /Approvals/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await goTo(page, "/admin");
    await expect(platformHeading(page)).toBeVisible();
    await platformTab(page, /^Approvals/).click();
    await expect(page).toHaveURL(/\/settings\?tab=approvals$/);
    await expect(page.getByRole("tab", { name: /Approvals/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Metrics are links too.
    await goTo(page, "/admin");
    await metric(page, "Actions today").click();
    await expect(page).toHaveURL(/\/admin\/audit$/);
  });

  test("approvals: approve a church signup and reject a member join", async ({ page }) => {
    await signIn(page, { role: "superadmin" });

    // The real list_approval_requests only hands a superadmin members in the
    // "platform" phase, so model that queue here (the shared mock seeds a
    // church-phase member, which is the church admin's job).
    let queue: Record<string, unknown>[] = [
      {
        kind: "church",
        id: OTHER_CHURCH_ID,
        church_id: OTHER_CHURCH_ID,
        church_name: "Hope Fellowship",
        church_email: "hello@hope.test",
        status: "pending",
        phase: "platform",
        created_at: new Date().toISOString(),
        applicant_id: "abababab-abab-4bab-8bab-abababababab",
        applicant_name: "Riley Hope",
        applicant_email: "riley@hope.test",
      },
      {
        kind: "member",
        id: PENDING_USER_ID,
        church_id: CHURCH_ID,
        church_name: "Grace Chapel",
        church_email: "office@gracechapel.test",
        status: "pending",
        phase: "platform",
        created_at: new Date().toISOString(),
        applicant_id: PENDING_USER_ID,
        applicant_name: "Jordan Pending",
        applicant_email: "jordan@gracechapel.test",
        applicant_role: "operator",
      },
    ];
    const reviews: { rpc: string; body: Record<string, unknown> }[] = [];
    await overrideRpc(page, "list_approval_requests", (_, route) => corsJson(route, queue));
    for (const rpc of ["review_signup", "review_member_join"]) {
      await overrideRpc(page, rpc, (body, route) => {
        reviews.push({ rpc, body });
        const id = body.p_church_id ?? body.p_user_id;
        queue = queue.filter((row) => row.id !== id);
        return corsJson(route, queue);
      });
    }

    // Legacy deep link redirects to the Settings > Approvals tab.
    await goTo(page, "/admin/approvals");
    await expect(page).toHaveURL(/\/settings\?tab=approvals$/, { timeout: 30_000 });
    await expect(page.getByRole("tab", { name: /Approvals/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await expect(shown(page, "New churches (1)")).toBeVisible();
    await expect(shown(page, "Members (1)")).toBeVisible();

    // Local search narrows the queues.
    const filter = page.getByPlaceholder("Search requests…");
    await filter.fill("riley");
    await expect(shown(page, "Members (0)")).toBeVisible();
    await expect(shown(page, "New churches (1)")).toBeVisible();
    await filter.fill("");

    const church = page.getByRole("listitem").filter({ hasText: "Hope Fellowship" });
    await expect(church).toContainText("Riley Hope · riley@hope.test");
    await church.getByRole("button", { name: "Approve & activate" }).click();
    await expect(shown(page, "Church approved and activated.")).toBeVisible();
    await expect(shown(page, "New churches (0)")).toBeVisible();
    await expect(shown(page, "No churches waiting for review.")).toBeVisible();
    expect(reviews).toEqual([
      { rpc: "review_signup", body: { p_church_id: OTHER_CHURCH_ID, p_action: "approve" } },
    ]);

    const member = page.getByRole("listitem").filter({ hasText: "Jordan Pending" });
    await expect(member).toContainText("jordan@gracechapel.test · Grace Chapel");
    await member.getByRole("button", { name: "Reject" }).click();
    await expect(shown(page, "Join request rejected.")).toBeVisible();
    await expect(shown(page, "Members (0)")).toBeVisible();
    await expect(shown(page, "No members waiting for activation.")).toBeVisible();
    expect(reviews[1]).toEqual({
      rpc: "review_member_join",
      body: { p_user_id: PENDING_USER_ID, p_action: "reject" },
    });
    expect(queue).toHaveLength(0);
  });

  test("churches: edit, suspend, restore and delete", async ({ page }) => {
    await signIn(page, { role: "superadmin" });
    await goTo(page, "/admin/churches");
    await expect(page.getByRole("heading", { name: "Churches", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(shown(page, "Showing 2 of 2")).toBeVisible();

    // Header search filters the roster.
    await search(page).fill("hope");
    await expect(shown(page, "Showing 1 of 1 (filtered from 2)")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Grace Chapel" })).toHaveCount(0);
    await search(page).fill("");

    // Edit name, email and status.
    await page.getByRole("row").filter({ hasText: "Hope Fellowship" }).click();
    const panel = editor(page);
    await expect(panel.getByRole("heading", { name: "Hope Fellowship" })).toBeVisible();
    await expect(panel.getByLabel("Status")).toHaveValue("pending");
    await panel.getByLabel("Name").fill("Hope Fellowship Church");
    await panel.getByLabel("Email").fill("office@hope.test");
    await panel.getByLabel("Address").fill("12 Hope Street");
    await panel.getByLabel("Phone").fill("555-0100");
    await panel.getByLabel("Status").selectOption("active");
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel.getByText("Changes saved.")).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Hope Fellowship Church" })).toBeVisible();
    expect(rpcCalls("admin_update_church").at(-1)).toEqual({
      p_church_id: OTHER_CHURCH_ID,
      p_name: "Hope Fellowship Church",
      p_email: "office@hope.test",
      p_status: "active",
      p_address: "12 Hope Street",
      p_phone: "555-0100",
      p_photo_url: null,
    });
    let hope = tableRows("admin_churches").find((row) => row.id === OTHER_CHURCH_ID);
    expect(hope).toMatchObject({
      name: "Hope Fellowship Church",
      email: "office@hope.test",
      status: "active",
      address: "12 Hope Street",
      phone: "555-0100",
    });
    const row = page.getByRole("row").filter({ hasText: "Hope Fellowship Church" });
    await expect(row).toContainText("office@hope.test");
    await expect(row).toContainText("Active");

    // Suspend (confirm dialog), then restore.
    await panel.getByRole("button", { name: "Suspend" }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Suspend this church?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Suspend" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Suspended");
    await expect(panel.getByLabel("Status")).toHaveValue("suspended");
    hope = tableRows("admin_churches").find((r) => r.id === OTHER_CHURCH_ID);
    expect(hope?.status).toBe("suspended");

    await panel.getByRole("button", { name: "Restore" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Restore this church?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Restore" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Active");
    hope = tableRows("admin_churches").find((r) => r.id === OTHER_CHURCH_ID);
    expect(hope?.status).toBe("active");
    expect(rpcCalls("admin_update_church").slice(-2).map((b) => b.p_status)).toEqual([
      "suspended",
      "active",
    ]);

    // Cancel a delete first (from the panel and from the row menu): nothing happens.
    await panel.getByRole("button", { name: "Delete" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Delete this church?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await row.hover();
    await row.getByRole("button", { name: "Actions for Hope Fellowship Church" }).click();
    await expect(page.getByRole("menuitem", { name: "Suspend" })).toBeEnabled();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Delete this church?" })).toBeVisible();
    await expect(dialog).toContainText("Hope Fellowship Church");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(rpcCalls("admin_delete_church")).toHaveLength(0);

    // Delete for real.
    await panel.getByRole("button", { name: "Delete" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Hope Fellowship Church");
    await dialog.getByRole("button", { name: "Delete church" }).click();
    await expect(dialog).toBeHidden();
    await expect(shown(page, "Church deleted.")).toBeVisible();
    await expect(row).toHaveCount(0);
    await expect(shown(page, "Showing 1 of 1")).toBeVisible();
    await expect(editor(page)).toHaveCount(0);
    expect(rpcCalls("admin_delete_church")).toEqual([{ p_church_id: OTHER_CHURCH_ID }]);
    expect(tableRows("admin_churches").map((r) => r.id)).toEqual([CHURCH_ID]);
  });

  test("accounts: change role and status, suspend, delete, filter by church", async ({
    page,
  }) => {
    await signIn(page, { role: "superadmin" });
    await goTo(page, "/admin/accounts");
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(shown(page, "Showing 2 of 2")).toBeVisible();
    await expect(search(page)).toHaveAttribute("placeholder", "Search accounts...");

    // Filtering by church name via header search (no separate church picker).
    await search(page).fill("Hope Fellowship");
    await expect(shown(page, "No accounts match this search.")).toBeVisible();
    await search(page).fill("Grace Chapel");
    await expect(shown(page, "Showing 2 of 2")).toBeVisible();
    await search(page).fill("jordan");
    await expect(shown(page, "Showing 1 of 1 (filtered from 2)")).toBeVisible();
    await search(page).fill("");

    // Your own account cannot be suspended or deleted.
    await page.getByRole("row").filter({ hasText: "operator@gracechapel.test" }).click();
    const panel = editor(page);
    await expect(panel.getByText("You cannot suspend or delete your own account.")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Suspend" })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Delete" })).toBeDisabled();
    // ...and the row menu enforces the same rule.
    const selfRow = page.getByRole("row").filter({ hasText: "operator@gracechapel.test" });
    await selfRow.hover();
    await selfRow.getByRole("button", { name: /^Actions for / }).click();
    await expect(page.getByRole("menuitem", { name: "Suspend" })).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    // Promote the pending operator to an active producer.
    const jordan = page.getByRole("row").filter({ hasText: "jordan@gracechapel.test" });
    await jordan.click();
    await expect(panel.getByRole("heading", { name: "Jordan Pending" })).toBeVisible();
    await expect(panel.getByLabel("Role")).toHaveValue("operator");
    await expect(panel.getByLabel("Status")).toHaveValue("pending");
    await expect(panel.getByLabel("Email")).toBeDisabled();
    await panel.getByLabel("Role").selectOption("producer");
    await panel.getByLabel("Status").selectOption("active");
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel.getByText("Changes saved.")).toBeVisible();
    expect(rpcCalls("admin_update_account").at(-1)).toMatchObject({
      p_user_id: PENDING_USER_ID,
      p_name: "Jordan Pending",
      p_role: "producer",
      p_status: "active",
    });
    let row = tableRows("admin_accounts").find((r) => r.id === PENDING_USER_ID);
    expect(row).toMatchObject({ role: "producer", status: "active" });
    await expect(jordan).toContainText("Producer");
    await expect(jordan).toContainText("Active");

    // Suspend through the confirm dialog.
    await panel.getByRole("button", { name: "Suspend" }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Suspend this account?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Suspend" }).click();
    await expect(dialog).toBeHidden();
    await expect(jordan).toContainText("Suspended");
    await expect(panel.getByRole("button", { name: "Restore" })).toBeVisible();
    row = tableRows("admin_accounts").find((r) => r.id === PENDING_USER_ID);
    expect(row?.status).toBe("disabled");

    // Delete.
    await panel.getByRole("button", { name: "Delete" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Delete this account?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(dialog).toBeHidden();
    await expect(shown(page, "Account deleted.")).toBeVisible();
    await expect(jordan).toHaveCount(0);
    expect(rpcCalls("admin_delete_account")).toEqual([{ p_user_id: PENDING_USER_ID }]);
    expect(tableRows("admin_accounts").map((r) => r.id)).toEqual([USER_ID]);
    await expect(shown(page, "Showing 1 of 1")).toBeVisible();
  });

  test("audit log: lists events, searches, scopes and paginates", async ({ page }) => {
    await signIn(page, { role: "superadmin" });

    // 25 events so the 20-per-page list has a second page; filtering honours
    // p_query, p_church_id and p_offset like the real RPC.
    const events = Array.from({ length: 25 }, (_, index) => ({
      id: `e0e0e0e0-e0e0-4e0e-8e0e-${String(index).padStart(12, "0")}`,
      church_id: index % 5 === 0 ? OTHER_CHURCH_ID : CHURCH_ID,
      church_name: index % 5 === 0 ? "Hope Fellowship" : "Grace Chapel",
      actor_id: USER_ID,
      actor_email: "operator@gracechapel.test",
      actor_name: "Avery Lane",
      action: index === 3 ? "setlist.update" : "song.update",
      entity_type: "songs",
      entity_id: null,
      summary: index === 3 ? "Avery Lane renamed Baptism Sunday" : `Avery Lane edited song ${index + 1}`,
      metadata:
        index === 3 ? { changes: [{ field: "name", from: "Draft", to: "Baptism Sunday" }] } : {},
      device_id: null,
      created_at: new Date(Date.now() - index * 60_000).toISOString(),
    }));
    const calls: Record<string, unknown>[] = [];
    await overrideRpc(page, "admin_list_events", (body, route) => {
      calls.push(body);
      const q = String(body.p_query ?? "").toLowerCase();
      const found = events.filter(
        (row) =>
          (!body.p_church_id || row.church_id === body.p_church_id) &&
          (!body.p_actor_id || row.actor_id === body.p_actor_id) &&
          (!q || `${row.summary} ${row.action}`.toLowerCase().includes(q)),
      );
      const limit = Number(body.p_limit ?? 80);
      const offset = Number(body.p_offset ?? 0);
      return corsJson(route, {
        items: found.slice(offset, offset + limit),
        total: found.length,
        limit,
        offset,
      });
    });

    await goTo(page, "/admin/audit");
    await expect(page.getByRole("heading", { name: "Audit log", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(shown(page, "25 events")).toBeVisible();
    // Event rows of the LibraryTable (day-group label rows hold no <td>).
    const items = page
      .getByRole("table", { name: "Audit events" })
      .locator("tbody > tr:has(td)")
      .filter({ visible: true });
    await expect(items).toHaveCount(20);
    await expect(shown(page, "Showing 20 of 25")).toBeVisible();
    await expect(items.first()).toContainText("Avery Lane edited song 1");
    // Change details render under the event.
    await expect(shown(page, "Draft → Baptism Sunday")).toBeVisible();

    // Pagination.
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(items).toHaveCount(25);
    await expect(shown(page, "Showing 25 of 25")).toBeVisible();
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
    expect(calls.at(-1)).toMatchObject({ p_limit: 20, p_offset: 20, p_query: null });

    // Search goes to the server as p_query.
    await expect(search(page)).toHaveAttribute("placeholder", "Search audit logs...");
    const searched = page.waitForRequest(
      (req) =>
        req.url().includes("/rpc/admin_list_events") &&
        JSON.parse(req.postData() || "{}").p_query === "baptism",
    );
    await search(page).fill("baptism");
    await searched;
    await expect(shown(page, "1 event")).toBeVisible();
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Avery Lane renamed Baptism Sunday");
    expect(calls.at(-1)).toMatchObject({ p_query: "baptism", p_offset: 0 });

    await search(page).fill("no such thing");
    await expect(shown(page, "No audit events yet.")).toBeVisible();
    await search(page).fill("");
    await expect(shown(page, "25 events")).toBeVisible();

    // Scope to one church.
    await page.getByRole("button", { name: "By church" }).click();
    await expect(shown(page, "Choose a church to see its trail.")).toBeVisible();
    await page.getByRole("combobox").selectOption(OTHER_CHURCH_ID);
    await expect(shown(page, "5 events")).toBeVisible();
    await expect(items).toHaveCount(5);
    expect(calls.at(-1)).toMatchObject({ p_church_id: OTHER_CHURCH_ID, p_actor_id: null });

    // Scope to one account.
    await page.getByRole("button", { name: "By account" }).click();
    await expect(shown(page, "Choose an account to see that person’s trail.")).toBeVisible();
    await page.getByRole("combobox").selectOption(USER_ID);
    await expect(shown(page, "25 events")).toBeVisible();
    expect(calls.at(-1)).toMatchObject({ p_church_id: null, p_actor_id: USER_ID });

    await page.getByRole("button", { name: "All activity" }).click();
    expect(calls.at(-1)).toMatchObject({ p_church_id: null, p_actor_id: null });
  });

  test("superadmin can open church workspace pages and switch workspace", async ({ page }) => {
    await signIn(page, { role: "superadmin" });
    await overrideRpc(page, "list_church_names", (_, route) =>
      corsJson(route, [
        { id: CHURCH_ID, name: "Grace Chapel" },
        { id: OTHER_CHURCH_ID, name: "Hope Fellowship" },
      ]),
    );

    // Superadmin nav keeps the church workspace plus the Platform hub.
    for (const name of ["Dashboard", "Platform", "Setlists", "Songs", "Settings"]) {
      await expect(navLink(page, name)).toBeVisible({ timeout: 30_000 });
    }

    await navLink(page, "Dashboard").click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Production Command" })).toBeVisible();

    await navLink(page, "Setlists").click();
    await expect(page).toHaveURL(/\/setlists/);
    const picker = page.getByLabel("Viewing church").filter({ visible: true }).first();
    await expect(picker).toBeVisible();
    await expect(picker).toHaveValue(CHURCH_ID);
    await expect(picker.locator("option")).toHaveText([
      "Select a church",
      "Grace Chapel",
      "Hope Fellowship",
    ]);
    await expect(shown(page, "Sunday Morning")).toBeVisible();

    // Switch to the other church: its (empty) catalog replaces Grace Chapel's.
    await picker.selectOption(OTHER_CHURCH_ID);
    await expect(page.getByText("Sunday Morning").filter({ visible: true })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("mc.setlistViewChurchId"))).toBe(
      OTHER_CHURCH_ID,
    );
    // The switch pulls the selected church's catalog from the backend.
    await expect
      .poll(() =>
        requestLog
          .filter(
            (entry) =>
              entry.method === "GET" &&
              entry.path.startsWith("/rest/v1/") &&
              !entry.path.includes("/rpc/") &&
              decodeURIComponent(entry.search).includes(OTHER_CHURCH_ID),
          )
          .map((entry) => entry.path),
      )
      .toContain("/rest/v1/church_settings");

    // And back again.
    const back = page.getByLabel("Viewing church").filter({ visible: true }).first();
    await back.selectOption(CHURCH_ID);
    await expect(shown(page, "Sunday Morning")).toBeVisible();

    // Platform link returns to the console.
    await navLink(page, "Platform").click();
    await expect(platformHeading(page)).toBeVisible();
  });
});
