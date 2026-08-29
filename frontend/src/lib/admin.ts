import { asError } from "./helpers";
import { supabase } from "./supabase";

export type AdminOverview = {
  churches_total: number;
  churches_active: number;
  churches_suspended: number;
  accounts_total: number;
  accounts_active: number;
  devices_total: number;
  actions_total: number;
  actions_today: number;
};

export type AdminChurch = {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  onboarded_at: string | null;
  approved_at: string | null;
  account_count: number;
  action_count: number;
  device_count: number;
};

export type AdminAccount = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  church_id: string;
  church_name: string;
  created_at: string;
  action_count: number;
  device_count: number;
  last_seen_at: string | null;
};

export type AdminDevice = {
  id: string;
  church_id: string | null;
  church_name: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  platform: string;
  os_label: string | null;
  app_version: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export type AdminEvent = {
  id: string;
  church_id: string | null;
  church_name: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  device_id: string | null;
  created_at: string;
};

export type AdminEventPage = {
  items: AdminEvent[];
  total: number;
  limit: number;
  offset: number;
};

function asRpcError(error: { message: string } | null, fallback: string) {
  return asError(error, fallback);
}

function asCount(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function adminOverview() {
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw asRpcError(error, "Could not load admin overview.");
  const row = (data ?? {}) as AdminOverview;
  return {
    churches_total: asCount(row.churches_total),
    churches_active: asCount(row.churches_active),
    churches_suspended: asCount(row.churches_suspended),
    accounts_total: asCount(row.accounts_total),
    accounts_active: asCount(row.accounts_active),
    devices_total: asCount(row.devices_total),
    actions_total: asCount(row.actions_total),
    actions_today: asCount(row.actions_today),
  };
}

export async function adminListChurches() {
  const { data, error } = await supabase.rpc("admin_list_churches");
  if (error) throw asRpcError(error, "Could not load churches.");
  return ((data ?? []) as AdminChurch[]).map((row) => ({
    ...row,
    account_count: asCount(row.account_count),
    action_count: asCount(row.action_count),
    device_count: asCount(row.device_count),
  }));
}

export async function adminListAccounts(churchId?: string | null) {
  const { data, error } = await supabase.rpc("admin_list_accounts", {
    p_church_id: churchId || null,
  });
  if (error) throw asRpcError(error, "Could not load accounts.");
  return ((data ?? []) as AdminAccount[]).map((row) => ({
    ...row,
    action_count: asCount(row.action_count),
    device_count: asCount(row.device_count),
  }));
}

export async function adminListDevices() {
  const { data, error } = await supabase.rpc("admin_list_devices");
  if (error) throw asRpcError(error, "Could not load devices.");
  return (data ?? []) as AdminDevice[];
}

export async function adminListEvents(input: {
  churchId?: string | null;
  actorId?: string | null;
  query?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { data, error } = await supabase.rpc("admin_list_events", {
    p_church_id: input.churchId || null,
    p_actor_id: input.actorId || null,
    p_query: input.query?.trim() || null,
    p_limit: input.limit ?? 80,
    p_offset: input.offset ?? 0,
  });
  if (error) throw asRpcError(error, "Could not load audit logs.");
  const page = (data ?? { items: [], total: 0, limit: 80, offset: 0 }) as AdminEventPage;
  return {
    ...page,
    items: page.items ?? [],
    total: Number(page.total ?? 0),
  };
}

export async function adminUpdateChurch(
  churchId: string,
  patch: { name?: string; email?: string; status?: string },
) {
  const { error } = await supabase.rpc("admin_update_church", {
    p_church_id: churchId,
    p_name: patch.name ?? null,
    p_email: patch.email ?? null,
    p_status: patch.status ?? null,
  });
  if (error) throw asRpcError(error, "Could not update church.");
}

export async function adminDeleteChurch(churchId: string) {
  const { error } = await supabase.rpc("admin_delete_church", {
    p_church_id: churchId,
  });
  if (error) throw asRpcError(error, "Could not delete church.");
}

export async function adminUpdateAccount(
  userId: string,
  patch: { name?: string; role?: string; status?: string },
) {
  const { error } = await supabase.rpc("admin_update_account", {
    p_user_id: userId,
    p_name: patch.name ?? null,
    p_role: patch.role ?? null,
    p_status: patch.status ?? null,
  });
  if (error) throw asRpcError(error, "Could not update account.");
}

export async function adminDeleteAccount(userId: string) {
  const { error } = await supabase.rpc("admin_delete_account", {
    p_user_id: userId,
  });
  if (error) throw asRpcError(error, "Could not delete account.");
}

const DEVICE_KEY = "mc.deviceId";

export function readDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function detectDevice() {
  const ua = navigator.userAgent;
  const tauri = Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
  let os = "web";
  if (/Mac/i.test(ua)) os = "macos";
  else if (/Win/i.test(ua)) os = "windows";
  else if (/Linux/i.test(ua)) os = "linux";
  return {
    platform: tauri ? os : "web",
    osLabel: tauri ? `${os} app` : `${os} browser`,
    userAgent: ua.slice(0, 400),
  };
}

export async function heartbeatDevice(appVersion: string) {
  const info = detectDevice();
  const { error } = await supabase.rpc("heartbeat_device", {
    p_device_id: readDeviceId(),
    p_platform: info.platform,
    p_os_label: info.osLabel,
    p_app_version: appVersion,
    p_user_agent: info.userAgent,
  });
  if (error) throw asRpcError(error, "Could not register this device.");
}

export async function recordAuditEvent(input: {
  action: string;
  summary: string;
  churchId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.rpc("record_audit_event", {
      p_action: input.action,
      p_summary: input.summary,
      p_church_id: input.churchId || null,
      p_entity_type: input.entityType || null,
      p_entity_id: input.entityId || null,
      p_metadata: input.metadata ?? {},
      p_device_id: readDeviceId(),
    });
  } catch {
    /* audit must never block the operator */
  }
}

const TABLE_LABEL: Record<string, string> = {
  songs: "song",
  song_lyric_sections: "lyrics",
  sermons: "sermon",
  sermon_slides: "sermon point",
  sermon_notes: "sermon note",
  setlists: "setlist",
  setlist_items: "setlist item",
  setlist_shares: "setlist share",
  scripture_passages: "scripture",
  media_assets: "media",
  church_settings: "settings",
  output_displays: "display",
  presentations: "live session",
  categories: "category",
  languages: "language",
  tags: "tag",
};

const TRACKED_FIELDS: Record<string, string[]> = {
  songs: [
    "title",
    "artist",
    "musical_key",
    "bpm",
    "time_signature",
    "youtube_url",
    "duration_seconds",
  ],
  categories: ["name", "description", "icon", "color"],
  setlists: ["name", "service_type", "service_at", "est_duration_seconds"],
  setlist_items: ["title", "subtitle", "item_type", "duration_seconds"],
  sermons: ["title", "speaker_name", "primary_scripture", "series_name", "status"],
  sermon_slides: ["content", "scripture_reference"],
  church_settings: [
    "theme",
    "default_font",
    "lyrics_text_size",
    "lyrics_text_style",
    "stage_background",
    "default_transition",
  ],
  presentations: ["name", "status", "is_blackout", "show_logo"],
  scripture_passages: ["reference", "text"],
  media_assets: ["name", "kind"],
  tags: ["name"],
  languages: ["name", "code"],
};

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  artist: "artist",
  musical_key: "key",
  bpm: "BPM",
  time_signature: "time signature",
  youtube_url: "YouTube link",
  duration_seconds: "duration",
  name: "name",
  description: "description",
  icon: "icon",
  color: "color",
  service_type: "service type",
  service_at: "date",
  est_duration_seconds: "duration",
  subtitle: "subtitle",
  item_type: "item type",
  speaker_name: "speaker",
  primary_scripture: "scripture",
  series_name: "series",
  status: "status",
  content: "text",
  scripture_reference: "verse",
  theme: "theme",
  default_font: "font",
  lyrics_text_size: "lyrics size",
  lyrics_text_style: "lyrics style",
  stage_background: "background",
  default_transition: "transition",
  is_blackout: "blackout",
  show_logo: "logo",
  reference: "reference",
  text: "text",
  kind: "type",
  code: "code",
};

export type AuditChange = { field: string; from: string; to: string };

function clip(value: string, max = 80) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") return String(value);
  return clip(String(value));
}

function rowTitle(row?: Record<string, unknown> | null) {
  if (!row) return "";
  return String(row.title ?? row.name ?? row.section ?? row.reference ?? "").trim();
}

function diffRow(table: string, previous: Record<string, unknown>, next: Record<string, unknown>) {
  const keys = TRACKED_FIELDS[table] ?? [];
  const changes: AuditChange[] = [];
  for (const key of keys) {
    const from = displayValue(previous[key]);
    const to = displayValue(next[key]);
    if (from === to) continue;
    changes.push({ field: FIELD_LABEL[key] ?? key.replace(/_/g, " "), from, to });
  }
  return changes;
}

function formatChanges(changes: AuditChange[], limit = 4) {
  const parts = changes.slice(0, limit).map((change) => {
    if (change.from === "(empty)") return `set ${change.field} to “${change.to}”`;
    if (change.to === "(empty)") return `cleared ${change.field} (was “${change.from}”)`;
    return `${change.field} “${change.from}” → “${change.to}”`;
  });
  if (changes.length > limit) parts.push(`+${changes.length - limit} more`);
  return parts.join("; ");
}

function lyricKey(row: Record<string, unknown>) {
  return `${String(row.section ?? "").trim().toLowerCase()}::${String(row.content ?? "").trim()}`;
}

function describeChildren(
  table: string,
  previousRows: Record<string, unknown>[],
  nextRows: Record<string, unknown>[],
  parentTitle: string,
) {
  const label = TABLE_LABEL[table] ?? table.replace(/_/g, " ");
  const named = parentTitle ? ` on “${parentTitle}”` : "";
  if (table === "song_lyric_sections") {
    const prevMap = new Map(
      previousRows.map((row) => [String(row.section ?? "").trim().toLowerCase(), row]),
    );
    const nextMap = new Map(
      nextRows.map((row) => [String(row.section ?? "").trim().toLowerCase(), row]),
    );
    const parts: string[] = [];
    for (const [section, row] of nextMap) {
      const before = prevMap.get(section);
      const heading = String(row.section ?? "section").trim() || "section";
      if (!before) {
        parts.push(`added ${heading} (“${clip(String(row.content ?? ""), 48)}”)`);
        continue;
      }
      if (String(before.content ?? "") !== String(row.content ?? "")) {
        parts.push(
          `replaced ${heading} (“${clip(String(before.content ?? ""), 36)}” → “${clip(String(row.content ?? ""), 36)}”)`,
        );
      }
    }
    for (const [section, row] of prevMap) {
      if (nextMap.has(section)) continue;
      parts.push(`removed ${String(row.section ?? "section").trim()}`);
    }
    if (!parts.length) {
      const same =
        previousRows.length === nextRows.length &&
        previousRows.every((row, index) => lyricKey(row) === lyricKey(nextRows[index] ?? {}));
      if (same) return `Saved lyrics${named}`;
      const names = nextRows
        .map((row) => String(row.section ?? "").trim())
        .filter(Boolean)
        .join(", ");
      return names
        ? `Updated lyrics${named}: ${names}`
        : `Updated lyrics${named} (${nextRows.length} sections)`;
    }
    return `Updated lyrics${named}: ${parts.slice(0, 4).join("; ")}${
      parts.length > 4 ? `; +${parts.length - 4} more` : ""
    }`;
  }
  const prevText = previousRows.map((row) => clip(String(row.content ?? row.title ?? ""), 40));
  const nextText = nextRows.map((row) => clip(String(row.content ?? row.title ?? ""), 40));
  const added = nextText.filter((text) => text && !prevText.includes(text));
  const removed = prevText.filter((text) => text && !nextText.includes(text));
  const bits: string[] = [];
  if (added.length) bits.push(`added “${added.slice(0, 2).join("”, “")}”`);
  if (removed.length) bits.push(`removed “${removed.slice(0, 2).join("”, “")}”`);
  if (!bits.length) {
    return `Updated ${label}${named}${nextRows.length ? ` (${nextRows.length})` : ""}`;
  }
  return `Updated ${label}${named}: ${bits.join("; ")}`;
}

export function auditLocalMutation(
  churchId: string,
  op: {
    type: string;
    table: string;
    row?: Record<string, unknown>;
    rowId?: string;
    parentId?: string;
    rows?: Record<string, unknown>[];
    parentTitle?: string;
  },
  previous?: Record<string, unknown> | Record<string, unknown>[] | null,
) {
  if (op.table === "bible_versions" || op.table === "setlist_shares" || op.table === "sermon_shares") return;
  const label = TABLE_LABEL[op.table] ?? op.table.replace(/_/g, " ");
  if (op.type === "upsert" && op.row) {
    const title = rowTitle(op.row);
    const prev = previous && !Array.isArray(previous) ? previous : null;
    const changes = prev ? diffRow(op.table, prev, op.row) : [];
    const summary = !prev
      ? title
        ? `Added ${label} “${title}”`
        : `Added ${label}`
      : changes.length
        ? `Updated ${label}${title ? ` “${title}”` : ""}: ${formatChanges(changes)}`
        : title
          ? `Saved ${label} “${title}”`
          : `Saved ${label}`;
    void recordAuditEvent({
      action: `${op.table}.${prev ? "update" : "create"}`,
      summary,
      churchId,
      entityType: op.table,
      entityId: typeof op.row.id === "string" ? op.row.id : null,
      metadata: { changes },
    });
    return;
  }
  if (op.type === "delete") {
    const prev = previous && !Array.isArray(previous) ? previous : null;
    const title = rowTitle(prev);
    void recordAuditEvent({
      action: `${op.table}.delete`,
      summary: title ? `Deleted ${label} “${title}”` : `Deleted ${label}`,
      churchId,
      entityType: op.table,
      entityId: op.rowId ?? null,
    });
    return;
  }
  const previousRows = Array.isArray(previous) ? previous : [];
  const nextRows = op.rows ?? [];
  const summary = describeChildren(op.table, previousRows, nextRows, op.parentTitle ?? "");
  void recordAuditEvent({
    action: `${op.table}.replace`,
    summary,
    churchId,
    entityType: op.table,
    entityId: op.parentId ?? null,
    metadata: {
      sections: nextRows.map((row) => ({
        section: row.section ?? row.title ?? null,
        preview: clip(String(row.content ?? ""), 120),
      })),
    },
  });
}
