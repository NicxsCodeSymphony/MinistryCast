import type { Page, Route } from "@playwright/test";

/**
 * In-memory PostgREST + Auth stand-in.
 * The browser still runs the real MinistryCast client. Requests never reach
 * the hosted Supabase project, so a test run cannot change live church data.
 */

export const CHURCH_ID = "11111111-1111-4111-8111-111111111111";
export const USER_ID = "22222222-2222-4222-8222-222222222222";
export const SONG_ID = "33333333-3333-4333-8333-333333333333";
export const SETLIST_ID = "44444444-4444-4444-8444-444444444444";
export const CHAT_ID = "55555555-5555-4555-8555-555555555555";
export const CATEGORY_ID = "66666666-6666-4666-8666-666666666666";
export const SERMON_ID = "77777777-7777-4777-8777-777777777777";

type Row = Record<string, unknown>;

export const PENDING_USER_ID = "88888888-8888-4888-8888-888888888888";
export const OTHER_CHURCH_ID = "12121212-1212-4121-8121-121212121212";

export type MockOptions = {
  role?: "admin" | "producer" | "operator" | "superadmin";
  onboarded?: boolean;
  /** Extra rows appended to the default seed, per table (e.g. more setlist items). */
  extraRows?: Record<string, Row[]>;
};

type MockRequest = { method: string; path: string; search: string; body: string };

const tables = new Map<string, Row[]>();
let sessionEmail = "operator@gracechapel.test";
let profileName = "Avery Lane";
let role: NonNullable<MockOptions["role"]> = "admin";
let onboardedAt: string | null = "2024-01-01T00:00:00.000Z";

let networkDown = false;

/** Simulate the backend being unreachable (requests fail like a real dropped connection). */
export function setNetworkDown(down: boolean) {
  networkDown = down;
}

/** Every request that reached the mock backend, in order. */
export const requestLog: MockRequest[] = [];

export function writesTo(table: string) {
  return requestLog.filter(
    (entry) =>
      entry.path === `/rest/v1/${table}` &&
      ["POST", "PATCH", "DELETE"].includes(entry.method),
  );
}

export function tableRows(table: string) {
  return clone(rowsOf(table));
}

const RESERVED = new Set([
  "select",
  "order",
  "offset",
  "limit",
  "on_conflict",
  "columns",
  "and",
]);

function now() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function profile() {
  return {
    authenticated: true,
    user: {
      id: USER_ID,
      name: profileName,
      email: sessionEmail,
      role,
      status: "active",
      avatar_url: null,
    },
    church: {
      id: CHURCH_ID,
      name: "Grace Chapel",
      status: "active",
      onboarded_at: onboardedAt,
      address: "12 Chapel Road",
      phone: "555-0100",
      photo_url: null,
      email: "office@gracechapel.test",
    },
  };
}

function seed(options: MockOptions = {}) {
  tables.clear();
  requestLog.length = 0;
  networkDown = false;
  sessionEmail = "operator@gracechapel.test";
  profileName = "Avery Lane";
  role = options.role ?? "admin";
  onboardedAt = options.onboarded === false ? null : "2024-01-01T00:00:00.000Z";
  const stamp = now();
  const put = (table: string, rows: Row[]) => tables.set(table, rows);

  put("bible_versions", [
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", code: "kjv", name: "King James Version" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", code: "niv", name: "New International Version" },
  ]);
  put("languages", [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      church_id: CHURCH_ID,
      name: "English",
      code: "en",
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("categories", [
    {
      id: CATEGORY_ID,
      church_id: CHURCH_ID,
      name: "Worship",
      description: "Congregational songs",
      icon: "music_note",
      color: "sky",
      sort_order: 0,
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("tags", []);
  put("media_assets", []);
  put("songs", [
    {
      id: SONG_ID,
      church_id: CHURCH_ID,
      category_id: CATEGORY_ID,
      language_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      audio_asset_id: null,
      title: "Amazing Grace",
      artist: "John Newton",
      musical_key: "G",
      bpm: 72,
      time_signature: "3/4",
      duration_seconds: 240,
      youtube_url: null,
      last_used_at: null,
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("song_lyric_sections", [
    {
      id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      song_id: SONG_ID,
      section: "Verse 1",
      content: "Amazing grace how sweet the sound",
      sort_order: 0,
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("sermons", [
    {
      id: SERMON_ID,
      church_id: CHURCH_ID,
      primary_passage_id: null,
      visual_asset_id: null,
      title: "Grace Upon Grace",
      speaker_name: "Pastor Kim",
      primary_scripture: "John 1:16",
      series_name: null,
      service_date: "2026-11-08",
      est_duration_seconds: 1800,
      status: "ready",
      text_size: "md",
      archived_at: null,
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("sermon_slides", [
    {
      id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      sermon_id: SERMON_ID,
      background_asset_id: null,
      content: "Grace upon grace",
      scripture_reference: "John 1:16",
      sort_order: 0,
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("sermon_notes", []);
  put("sermon_shares", []);
  put("setlists", [
    {
      id: SETLIST_ID,
      church_id: CHURCH_ID,
      created_by: USER_ID,
      name: "Sunday Morning",
      service_type: "Sunday Worship",
      service_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      est_duration_seconds: 3600,
      archived_at: null,
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("setlist_items", [
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
      setlist_id: SETLIST_ID,
      item_type: "song",
      song_id: SONG_ID,
      sermon_id: null,
      passage_id: null,
      media_asset_id: null,
      payload: null,
      title: "Amazing Grace",
      subtitle: "John Newton",
      duration_seconds: 240,
      sort_order: 0,
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("setlist_shares", []);
  put("scripture_passages", []);
  put("presentations", []);
  put("church_settings", [
    {
      id: "ffffffff-ffff-4fff-8fff-fffffffffff1",
      church_id: CHURCH_ID,
      interface_language: "en",
      theme: "dark",
      default_font: "inter",
      default_transition: "dissolve",
      transition_ms: 400,
      backup_frequency: "hourly",
      lyrics_text_size: "md",
      lyrics_text_style: "",
      stage_background: "sanctuary",
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("output_displays", [
    {
      id: "99999999-9999-4999-8999-999999999999",
      church_id: CHURCH_ID,
      name: "Main Projector",
      kind: "projector",
      is_default: true,
      sort_order: 0,
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("users", [
    {
      id: USER_ID,
      name: profileName,
      email: sessionEmail,
      role: "admin",
      avatar_url: null,
      church_id: CHURCH_ID,
    },
  ]);
  put("chat_channels", [
    {
      id: CHAT_ID,
      kind: "church",
      church_id: CHURCH_ID,
      name: "Grace Chapel",
      created_at: stamp,
      updated_at: stamp,
    },
  ]);
  put("chat_messages", []);
  put("chat_reactions", []);

  put("admin_churches", [
    {
      id: CHURCH_ID,
      name: "Grace Chapel",
      email: "office@gracechapel.test",
      status: "active",
      created_at: "2024-01-01T00:00:00.000Z",
      onboarded_at: "2024-01-01T00:00:00.000Z",
      approved_at: "2024-01-01T00:00:00.000Z",
      account_count: 2,
      action_count: 14,
      device_count: 1,
    },
    {
      id: OTHER_CHURCH_ID,
      name: "Hope Fellowship",
      email: "hello@hope.test",
      status: "pending",
      created_at: stamp,
      onboarded_at: null,
      approved_at: null,
      account_count: 1,
      action_count: 0,
      device_count: 0,
    },
  ]);
  put("admin_accounts", [
    {
      id: USER_ID,
      name: profileName,
      email: sessionEmail,
      role: "admin",
      status: "active",
      church_id: CHURCH_ID,
      church_name: "Grace Chapel",
      created_at: "2024-01-01T00:00:00.000Z",
      action_count: 14,
      device_count: 1,
      last_seen_at: stamp,
    },
    {
      id: PENDING_USER_ID,
      name: "Jordan Pending",
      email: "jordan@gracechapel.test",
      role: "operator",
      status: "pending",
      church_id: CHURCH_ID,
      church_name: "Grace Chapel",
      created_at: stamp,
      action_count: 0,
      device_count: 0,
      last_seen_at: null,
    },
  ]);
  put("admin_events", [
    {
      id: "a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a1",
      church_id: CHURCH_ID,
      church_name: "Grace Chapel",
      actor_id: USER_ID,
      actor_email: sessionEmail,
      actor_name: profileName,
      action: "song.create",
      entity_type: "songs",
      entity_id: SONG_ID,
      summary: "Avery Lane added Amazing Grace",
      metadata: {},
      device_id: null,
      created_at: stamp,
    },
  ]);
  put("approval_requests", [
    {
      kind: "church",
      id: OTHER_CHURCH_ID,
      church_id: OTHER_CHURCH_ID,
      church_name: "Hope Fellowship",
      church_email: "hello@hope.test",
      status: "pending",
      phase: "platform",
      created_at: stamp,
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
      phase: "church",
      created_at: stamp,
      applicant_id: PENDING_USER_ID,
      applicant_name: "Jordan Pending",
      applicant_email: "jordan@gracechapel.test",
      applicant_role: "operator",
    },
  ]);
  for (const [table, rows] of Object.entries(options.extraRows ?? {})) {
    put(table, [...(tables.get(table) ?? []), ...rows.map((row) => ({ created_at: stamp, updated_at: stamp, ...row }))]);
  }
}

function teamAccounts() {
  return rowsOf("admin_accounts")
    .filter((row) => row.church_id === CHURCH_ID)
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: null,
      avatar_url: null,
      role: row.role,
      status: row.status,
      approval_phase: row.status === "pending" ? "church" : null,
      church_id: row.church_id,
      church_name: row.church_name,
      created_at: row.created_at,
      updated_at: row.created_at,
    }));
}

function visibleApprovals() {
  return rowsOf("approval_requests").filter((row) =>
    role === "superadmin" ? true : row.kind === "member",
  );
}

function rowsOf(table: string) {
  let rows = tables.get(table);
  if (!rows) {
    rows = [];
    tables.set(table, rows);
  }
  return rows;
}

function authUser() {
  const stamp = now();
  return {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: sessionEmail,
    email_confirmed_at: stamp,
    phone: "",
    confirmed_at: stamp,
    last_sign_in_at: stamp,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { name: profileName },
    identities: [],
    created_at: stamp,
    updated_at: stamp,
  };
}

function sessionBody() {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return {
    access_token: "playwright-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "playwright-refresh-token",
    user: authUser(),
  };
}

function corsHeaders(route: Route) {
  const origin = route.request().headers()["origin"] || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      route.request().headers()["access-control-request-headers"] || "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
    "access-control-expose-headers":
      "content-range, content-length, x-total-count, location",
    "content-type": "application/json; charset=utf-8",
  };
}

async function fulfill(
  route: Route,
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
) {
  await route.fulfill({
    status,
    headers: { ...corsHeaders(route), ...extra },
    body: body == null ? "" : JSON.stringify(body),
  });
}

function splitTop(input: string, separator: string) {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote = false;
  for (const ch of input) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === "(") depth += 1;
    if (!quote && ch === ")") depth -= 1;
    if (!quote && depth === 0 && ch === separator) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

function parseList(raw: string) {
  const body =
    raw.startsWith("(") && raw.endsWith(")") ? raw.slice(1, -1) : raw;
  return splitTop(body, ",").map((part) => part.trim().replace(/^"|"$/g, ""));
}

function compare(left: unknown, right: string) {
  if (typeof left === "number" && right !== "" && !Number.isNaN(Number(right))) {
    return left - Number(right);
  }
  return String(left ?? "").localeCompare(right);
}

function matchOp(row: Row, column: string, op: string, raw: string): boolean {
  const value = row[column];
  if (op === "eq") return String(value ?? "") === raw || (value == null && raw === "null");
  if (op === "neq") return String(value ?? "") !== raw;
  if (op === "gt") return value != null && compare(value, raw) > 0;
  if (op === "gte") return value != null && compare(value, raw) >= 0;
  if (op === "lt") return value != null && compare(value, raw) < 0;
  if (op === "lte") return value != null && compare(value, raw) <= 0;
  if (op === "is") {
    if (raw === "null") return value == null;
    if (raw === "true") return value === true;
    if (raw === "false") return value === false;
    return false;
  }
  if (op === "in") return parseList(raw).includes(String(value ?? ""));
  if (op === "like" || op === "ilike") {
    const source = op === "ilike" ? String(value ?? "").toLowerCase() : String(value ?? "");
    const pattern = (op === "ilike" ? raw.toLowerCase() : raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\*", ".*");
    return new RegExp(`^${pattern}$`).test(source);
  }
  if (op.startsWith("not.")) return !matchOp(row, column, op.slice(4), raw);
  throw new Error(`Unhandled filter ${column}.${op}.${raw}`);
}

function matchClause(row: Row, clause: string) {
  const match = clause.match(
    /^([A-Za-z0-9_]+)\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|not\.(?:eq|is|in|like|ilike))\.(.*)$/,
  );
  if (!match) throw new Error(`Unhandled clause ${clause}`);
  return matchOp(row, match[1], match[2], match[3]);
}

function matches(row: Row, params: URLSearchParams) {
  for (const [key, raw] of params.entries()) {
    if (RESERVED.has(key)) continue;
    if (key === "or") {
      const body = raw.replace(/^\(/, "").replace(/\)$/, "");
      const ok = splitTop(body, ",").some((clause) => matchClause(row, clause.trim()));
      if (!ok) return false;
      continue;
    }
    const opMatch = raw.match(
      /^(eq|neq|gt|gte|lt|lte|like|ilike|is|in|not\.(?:eq|is|in|like|ilike))\.(.*)$/,
    );
    if (!opMatch) throw new Error(`Unhandled filter ${key}=${raw}`);
    if (!matchOp(row, key, opMatch[1], opMatch[2])) return false;
  }
  return true;
}

function project(row: Row, select: string | null) {
  if (!select || select === "*" || select.includes("*") || select.includes("(")) {
    return clone(row);
  }
  const next: Row = {};
  for (const column of select.split(",").map((part) => part.trim()).filter(Boolean)) {
    next[column] = row[column] ?? null;
  }
  return next;
}

function sortRows(rows: Row[], order: string | null) {
  if (!order) return rows;
  const specs = order.split(",").map((part) => {
    const [column, direction] = part.trim().split(".");
    return { column, asc: direction !== "desc" };
  });
  return [...rows].sort((left, right) => {
    for (const spec of specs) {
      const a = left[spec.column];
      const b = right[spec.column];
      if (a == null && b == null) continue;
      if (a == null) return 1;
      if (b == null) return -1;
      if (a < b) return spec.asc ? -1 : 1;
      if (a > b) return spec.asc ? 1 : -1;
    }
    return 0;
  });
}

async function handleRest(route: Route, url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  // /rest/v1/rpc/<name> or /rest/v1/<table>
  if (parts[2] === "rpc") {
    return handleRpc(route, decodeURIComponent(parts[3] || ""), url);
  }
  const table = decodeURIComponent(parts[2] || "");
  const method = route.request().method();
  const params = url.searchParams;
  const prefer = route.request().headers()["prefer"] || "";
  const accept = route.request().headers()["accept"] || "";
  const single = accept.includes("application/vnd.pgrst.object+json");
  const rows = rowsOf(table);

  if (method === "GET" || method === "HEAD") {
    let found = rows.filter((row) => matches(row, params));
    found = sortRows(found, params.get("order"));
    const total = found.length;
    const range = route.request().headers()["range"];
    let start = Number(params.get("offset") || 0);
    let end = start + Number(params.get("limit") || total || 0) - 1;
    if (range) {
      const [from, to] = range.split("-").map((part) => Number(part));
      if (Number.isFinite(from)) start = from;
      if (Number.isFinite(to)) end = to;
    }
    if (!Number.isFinite(end) || end < start) end = Math.max(start, total - 1);
    const page = found.slice(start, end + 1).map((row) => project(row, params.get("select")));
    const contentRange =
      total === 0 ? "*/0" : `${start}-${start + page.length - 1}/${total}`;
    if (single) {
      if (page.length !== 1) {
        return fulfill(route, 406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: `Results contain ${page.length} rows`,
        });
      }
      return fulfill(route, 200, page[0], { "content-range": contentRange });
    }
    return fulfill(route, 200, page, { "content-range": contentRange });
  }

  const text = route.request().postData() || "";
  const payload = text ? (JSON.parse(text) as Row | Row[]) : {};
  const incoming = Array.isArray(payload) ? payload : [payload];

  if (method === "POST") {
    const conflict = (params.get("on_conflict") || "id").split(",")[0];
    const saved = incoming.map((row) => {
      const next = { ...row };
      if (!next.id) next.id = crypto.randomUUID();
      if (!next.created_at) next.created_at = now();
      next.updated_at = next.updated_at || now();
      const index = rows.findIndex((existing) => existing[conflict] === next[conflict]);
      if (prefer.includes("resolution=merge-duplicates") && index >= 0) {
        rows[index] = { ...rows[index], ...next };
        return rows[index];
      }
      if (index >= 0 && conflict === "id") {
        rows[index] = { ...rows[index], ...next };
        return rows[index];
      }
      rows.push(next);
      return next;
    });
    const projected = saved.map((row) => project(row, params.get("select")));
    if (single) {
      if (projected.length !== 1) {
        return fulfill(route, 406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
        });
      }
      return fulfill(route, 201, projected[0]);
    }
    return fulfill(route, 201, projected);
  }

  if (method === "PATCH") {
    const patch = incoming[0] || {};
    const saved = rows
      .filter((row) => matches(row, params))
      .map((row) => {
        Object.assign(row, patch, { updated_at: now() });
        return row;
      });
    const projected = saved.map((row) => project(row, params.get("select")));
    if (single) return fulfill(route, 200, projected[0] ?? null);
    return fulfill(route, 200, projected);
  }

  if (method === "DELETE") {
    const kept = rows.filter((row) => !matches(row, params));
    tables.set(table, kept);
    return fulfill(route, 200, []);
  }

  return fulfill(route, 400, { message: `Unhandled ${method} ${url.pathname}` });
}

async function handleRpc(route: Route, name: string, url: URL) {
  const text = route.request().postData() || "{}";
  const body = JSON.parse(text) as Record<string, unknown>;
  if (name === "get_session_profile") return fulfill(route, 200, profile());
  if (name === "list_church_names") {
    return fulfill(route, 200, [{ id: CHURCH_ID, name: "Grace Chapel" }]);
  }
  if (name === "heartbeat_device" || name === "record_audit_event") {
    return fulfill(route, 200, null);
  }
  if (name === "get_notification_preferences") {
    return fulfill(route, 200, {
      user_id: USER_ID,
      enabled: true,
      chat: true,
      presentation: true,
      team: true,
      system: true,
    });
  }
  if (name === "update_notification_preferences") {
    return fulfill(route, 200, {
      user_id: USER_ID,
      enabled: body.p_enabled ?? true,
      chat: body.p_chat ?? true,
      presentation: body.p_presentation ?? true,
      team: body.p_team ?? true,
      system: body.p_system ?? true,
    });
  }
  if (name === "list_my_notifications") return fulfill(route, 200, []);
  if (name === "mark_notification_read" || name === "mark_all_notifications_read") {
    return fulfill(route, 200, null);
  }
  if (name === "list_chat_contacts") return fulfill(route, 200, []);
  if (name === "church_list_accounts") return fulfill(route, 200, teamAccounts());
  if (name === "church_update_account") {
    const account = rowsOf("admin_accounts").find((row) => row.id === body.p_user_id);
    if (account) {
      if (body.p_name) account.name = body.p_name;
      if (body.p_role) account.role = body.p_role;
      if (body.p_status) account.status = body.p_status;
    }
    return fulfill(route, 200, teamAccounts());
  }
  if (name === "list_approval_requests") return fulfill(route, 200, visibleApprovals());
  if (name === "review_signup" || name === "review_member_join") {
    const id = (body.p_church_id ?? body.p_user_id) as string;
    tables.set(
      "approval_requests",
      rowsOf("approval_requests").filter((row) => row.id !== id),
    );
    const approve = body.p_action === "approve";
    const church = rowsOf("admin_churches").find((row) => row.id === id);
    if (church) church.status = approve ? "active" : "rejected";
    const account = rowsOf("admin_accounts").find((row) => row.id === id);
    if (account) account.status = approve ? "active" : "rejected";
    return fulfill(route, 200, visibleApprovals());
  }
  if (name === "complete_onboarding") {
    onboardedAt = now();
    return fulfill(route, 200, profile());
  }
  if (name === "complete_signup") return fulfill(route, 200, profile());
  if (name === "suggest_churches") {
    return fulfill(route, 200, [{ id: CHURCH_ID, name: "Grace Chapel", status: "active" }]);
  }
  if (name === "admin_overview") {
    const churches = rowsOf("admin_churches");
    const accounts = rowsOf("admin_accounts");
    return fulfill(route, 200, {
      churches_total: churches.length,
      churches_active: churches.filter((row) => row.status === "active").length,
      churches_suspended: churches.filter((row) => row.status === "suspended").length,
      accounts_total: accounts.length,
      accounts_active: accounts.filter((row) => row.status === "active").length,
      devices_total: 1,
      actions_total: rowsOf("admin_events").length,
      actions_today: rowsOf("admin_events").length,
    });
  }
  if (name === "admin_list_churches") return fulfill(route, 200, rowsOf("admin_churches"));
  if (name === "admin_list_accounts") {
    const churchId = body.p_church_id as string | null;
    return fulfill(
      route,
      200,
      rowsOf("admin_accounts").filter((row) => !churchId || row.church_id === churchId),
    );
  }
  if (name === "admin_list_devices") {
    return fulfill(route, 200, [
      {
        id: "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d1",
        church_id: CHURCH_ID,
        church_name: "Grace Chapel",
        user_id: USER_ID,
        user_name: profileName,
        user_email: sessionEmail,
        platform: "web",
        os_label: "macos browser",
        app_version: "1.0.20",
        first_seen_at: now(),
        last_seen_at: now(),
      },
    ]);
  }
  if (name === "admin_list_events") {
    const items = rowsOf("admin_events");
    return fulfill(route, 200, { items, total: items.length, limit: 80, offset: 0 });
  }
  if (name === "admin_update_church") {
    const church = rowsOf("admin_churches").find((row) => row.id === body.p_church_id);
    if (church) {
      if (body.p_name) church.name = body.p_name;
      if (body.p_email) church.email = body.p_email;
      if (body.p_status) church.status = body.p_status;
      // null = unchanged, "" = cleared (matches the SQL function).
      for (const field of ["address", "phone", "photo_url"] as const) {
        const value = body[`p_${field}`];
        if (value !== null && value !== undefined) church[field] = value === "" ? null : value;
      }
    }
    return fulfill(route, 200, null);
  }
  if (name === "admin_delete_church") {
    tables.set(
      "admin_churches",
      rowsOf("admin_churches").filter((row) => row.id !== body.p_church_id),
    );
    return fulfill(route, 200, null);
  }
  if (name === "admin_update_account") {
    const account = rowsOf("admin_accounts").find((row) => row.id === body.p_user_id);
    if (account) {
      if (body.p_name) account.name = body.p_name;
      if (body.p_role) account.role = body.p_role;
      if (body.p_status) account.status = body.p_status;
    }
    return fulfill(route, 200, null);
  }
  if (name === "admin_delete_account") {
    tables.set(
      "admin_accounts",
      rowsOf("admin_accounts").filter((row) => row.id !== body.p_user_id),
    );
    return fulfill(route, 200, null);
  }
  if (
    name === "open_dm_channel" ||
    name === "toggle_chat_reaction" ||
    name === "edit_chat_message" ||
    name === "delete_chat_message" ||
    name === "delete_chat_for_me" ||
    name === "clear_chat_messages" ||
    name === "block_chat_user" ||
    name === "unblock_chat_user"
  ) {
    return fulfill(route, 200, null);
  }
  if (name === "ensure_church_chat") return fulfill(route, 200, CHAT_ID);
  if (name === "list_chat_inbox") return fulfill(route, 200, rowsOf("chat_channels"));
  if (name === "update_my_profile") {
    if (typeof body.p_name === "string" && body.p_name.trim()) {
      profileName = body.p_name.trim();
    }
    const user = rowsOf("users").find((row) => row.id === USER_ID);
    if (user) user.name = profileName;
    return fulfill(route, 200, profile());
  }
  if (name === "update_my_church") return fulfill(route, 200, profile());
  return fulfill(route, 404, {
    code: "PGRST202",
    message: `Could not find the function public.${name}`,
    hint: url.pathname,
  });
}

async function handleAuth(route: Route, url: URL) {
  if (url.pathname.endsWith("/token")) {
    const body = JSON.parse(route.request().postData() || "{}") as {
      email?: string;
      password?: string;
    };
    if (!body.password) {
      return fulfill(route, 400, {
        error: "invalid_grant",
        error_description: "Invalid login credentials",
        msg: "Invalid login credentials",
      });
    }
    if (body.email) sessionEmail = body.email;
    return fulfill(route, 200, sessionBody());
  }
  if (url.pathname.endsWith("/user")) return fulfill(route, 200, authUser());
  if (url.pathname.endsWith("/logout")) return fulfill(route, 204, null);
  if (url.pathname.endsWith("/settings")) {
    return fulfill(route, 200, { external: { email: true }, disable_signup: false });
  }
  return fulfill(route, 200, {});
}

async function handleFunction(route: Route, url: URL) {
  const name = url.pathname.split("/").pop() || "";
  if (name === "register-account" || name === "send-password-reset" || name === "delete-account") {
    return fulfill(route, 200, { ok: true });
  }
  if (name === "chord-assist" || name === "catalog-proxy") {
    return fulfill(route, 200, { ok: true, data: [] });
  }
  return fulfill(route, 200, { ok: true });
}

async function handleSupabase(route: Route) {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders(route), body: "" });
    return;
  }
  const url = new URL(request.url());
  if (networkDown) {
    await route.abort("internetdisconnected");
    return;
  }
  requestLog.push({
    method: request.method(),
    path: url.pathname,
    search: url.search,
    body: request.postData() || "",
  });
  try {
    if (url.pathname.startsWith("/auth/v1")) return await handleAuth(route, url);
    if (url.pathname.startsWith("/rest/v1")) return await handleRest(route, url);
    if (url.pathname.startsWith("/functions/v1")) return await handleFunction(route, url);
    if (url.pathname.startsWith("/storage/v1")) {
      if (url.pathname.includes("/list/")) return fulfill(route, 200, []);
      return fulfill(route, 200, { Key: url.pathname });
    }
    if (url.pathname.startsWith("/realtime/")) return fulfill(route, 200, {});
    return fulfill(route, 404, { message: `No mock for ${url.pathname}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mock failed";
    console.error(`supabase mock ${request.method()} ${url.pathname}${url.search}: ${message}`);
    return fulfill(route, 400, { message, code: "MOCK" });
  }
}

export async function installSupabaseMock(page: Page, options: MockOptions = {}) {
  seed(options);
  await page.route(/https?:\/\/(?!localhost|127\.0\.0\.1).*/i, async (route) => {
    const url = route.request().url();
    if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) {
      await route.continue();
      return;
    }
    if (url.includes(".supabase.co")) {
      await handleSupabase(route);
      return;
    }
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route), body: "" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(route),
      body: JSON.stringify({ data: [], lyrics: "" }),
    });
  });
}
