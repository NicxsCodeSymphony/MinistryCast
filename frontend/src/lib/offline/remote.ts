import { supabase } from "../supabase";
import { asError } from "../helpers";
import type { TableName, LocalRow, OutboxItem } from "./store";
import {
  dequeueOutboxItem,
  getOutbox,
  getRow,
  mergeRemote,
  markPushed,
  PUSH_ORDER,
  removeRow,
  requeueLocalOnly,
  stripLocal,
  withContentBatch,
} from "./store";

const CHURCH_TABLES: TableName[] = [
  "church_settings",
  "output_displays",
  "categories",
  "languages",
  "tags",
  "media_assets",
  "songs",
  "scripture_passages",
  "sermons",
  "setlists",
  "presentations",
];

const GLOBAL_TABLES = new Set<TableName>([
  "bible_versions",
  "categories",
  "songs",
  "setlists",
  "sermons",
]);

const CHILD_TABLES: TableName[] = [
  "song_lyric_sections",
  "sermon_slides",
  "sermon_notes",
  "setlist_items",
  "setlist_shares",
  "sermon_shares",
];

const TABLE_COLUMNS: Record<TableName, readonly string[]> = {
  church_settings: [
    "id",
    "church_id",
    "interface_language",
    "theme",
    "default_font",
    "default_transition",
    "transition_ms",
    "backup_frequency",
    "lyrics_text_size",
    "lyrics_text_style",
    "stage_background",
    "created_at",
    "updated_at",
  ],
  output_displays: [
    "id",
    "church_id",
    "name",
    "kind",
    "is_default",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  categories: [
    "id",
    "church_id",
    "name",
    "description",
    "icon",
    "color",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  languages: [
    "id",
    "church_id",
    "name",
    "code",
    "created_at",
    "updated_at",
  ],
  tags: ["id", "church_id", "name", "created_at", "updated_at"],
  media_assets: [
    "id",
    "church_id",
    "name",
    "url",
    "kind",
    "mime_type",
    "file_size_bytes",
    "duration_seconds",
    "created_at",
    "updated_at",
  ],
  songs: [
    "id",
    "church_id",
    "category_id",
    "language_id",
    "audio_asset_id",
    "title",
    "artist",
    "musical_key",
    "bpm",
    "time_signature",
    "duration_seconds",
    "youtube_url",
    "last_used_at",
    "created_at",
    "updated_at",
  ],
  song_lyric_sections: [
    "id",
    "song_id",
    "section",
    "content",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  sermons: [
    "id",
    "church_id",
    "primary_passage_id",
    "visual_asset_id",
    "title",
    "speaker_name",
    "primary_scripture",
    "series_name",
    "service_date",
    "est_duration_seconds",
    "status",
    "text_size",
    "created_at",
    "updated_at",
  ],
  sermon_slides: [
    "id",
    "sermon_id",
    "background_asset_id",
    "content",
    "scripture_reference",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  sermon_notes: [
    "id",
    "sermon_id",
    "content",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  sermon_shares: ["id", "sermon_id", "church_id", "created_at"],
  setlists: [
    "id",
    "church_id",
    "created_by",
    "name",
    "service_type",
    "service_at",
    "est_duration_seconds",
    "created_at",
    "updated_at",
  ],
  setlist_shares: [
    "id",
    "setlist_id",
    "church_id",
    "created_at",
  ],
  setlist_items: [
    "id",
    "setlist_id",
    "item_type",
    "song_id",
    "sermon_id",
    "passage_id",
    "media_asset_id",
    "payload",
    "title",
    "subtitle",
    "duration_seconds",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  scripture_passages: [
    "id",
    "church_id",
    "bible_version_id",
    "reference",
    "text",
    "created_at",
    "updated_at",
  ],
  presentations: [
    "id",
    "church_id",
    "setlist_id",
    "operator_id",
    "current_item_id",
    "current_lyric_id",
    "current_slide_id",
    "name",
    "status",
    "is_blackout",
    "show_logo",
    "transition_ms",
    "started_at",
    "ended_at",
    "verse_overlay_ref",
    "verse_overlay_translation",
    "verse_overlay_page",
    "verse_overlay_take",
    "created_at",
    "updated_at",
  ],
  bible_versions: ["id", "code", "name"],
};

const UUID_KEYS = new Set([
  "id",
  "church_id",
  "category_id",
  "language_id",
  "audio_asset_id",
  "background_asset_id",
  "primary_passage_id",
  "visual_asset_id",
  "bible_version_id",
  "song_id",
  "sermon_id",
  "passage_id",
  "media_asset_id",
  "setlist_id",
  "created_by",
  "operator_id",
  "current_item_id",
  "current_lyric_id",
  "current_slide_id",
]);

const DATE_KEYS = new Set(["service_date"]);

const ROW_REFS: Partial<
  Record<TableName, { column: string; table: TableName }[]>
> = {
  songs: [
    { column: "category_id", table: "categories" },
    { column: "language_id", table: "languages" },
    { column: "audio_asset_id", table: "media_assets" },
  ],
  sermons: [
    { column: "primary_passage_id", table: "scripture_passages" },
    { column: "visual_asset_id", table: "media_assets" },
  ],
  sermon_slides: [
    { column: "sermon_id", table: "sermons" },
    { column: "background_asset_id", table: "media_assets" },
  ],
  sermon_notes: [{ column: "sermon_id", table: "sermons" }],
  sermon_shares: [{ column: "sermon_id", table: "sermons" }],
  song_lyric_sections: [{ column: "song_id", table: "songs" }],
  scripture_passages: [{ column: "bible_version_id", table: "bible_versions" }],
  setlists: [],
  setlist_shares: [{ column: "setlist_id", table: "setlists" }],
  setlist_items: [
    { column: "setlist_id", table: "setlists" },
    { column: "song_id", table: "songs" },
    { column: "sermon_id", table: "sermons" },
    { column: "passage_id", table: "scripture_passages" },
    { column: "media_asset_id", table: "media_assets" },
  ],
  presentations: [
    { column: "setlist_id", table: "setlists" },
    { column: "current_item_id", table: "setlist_items" },
    { column: "current_lyric_id", table: "song_lyric_sections" },
    { column: "current_slide_id", table: "sermon_slides" },
  ],
};

class SkipOutboxItem extends Error {}

function requiredSetlistRef(row: LocalRow, column: string) {
  if (column === "setlist_id") return true;
  const kind = String(row.item_type ?? "");
  if (kind === "song") return column === "song_id";
  if (kind === "sermon") return column === "sermon_id";
  if (kind === "scripture") return column === "passage_id";
  if (kind === "media") return column === "media_asset_id";
  if (kind === "roster") return false;
  return false;
}

function payload(
  table: TableName,
  row: LocalRow,
  omit = new Set<string>(),
) {
  const allowed = TABLE_COLUMNS[table];
  const next: Record<string, unknown> = {};
  const source = stripLocal(row);
  for (const key of allowed) {
    if (omit.has(key) || !(key in source)) continue;
    let value = source[key];
    if (value === "" && (UUID_KEYS.has(key) || DATE_KEYS.has(key))) value = null;
    if (DATE_KEYS.has(key) && typeof value === "string") {
      const day = value.slice(0, 10);
      value = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
    }
    next[key] = value;
  }
  return next;
}

function missingColumn(message: string) {
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

function fkColumn(table: TableName, message: string) {
  const named = message.match(/foreign key constraint "([^"]+)"/i)?.[1] ?? "";
  const prefix = `fk_${table}_`;
  if (named.startsWith(prefix)) return named.slice(prefix.length);
  return message.match(/Key \(([^)]+)\)=/)?.[1] ?? null;
}

type WriteError = { message: string; details?: string; code?: string };

async function writeRows(
  table: TableName,
  rows: LocalRow[],
  mode: "upsert" | "insert",
  omit = new Set<string>(),
) {
  if (!rows.length) return;
  const body = rows.map((row) => payload(table, row, omit));
  const query =
    mode === "upsert"
      ? supabase.from(table).upsert(
          body,
          table === "church_settings" ? { onConflict: "church_id" } : undefined,
        )
      : supabase.from(table).insert(body);
  const { data, error } = await query.select("id");
  if (!error) {
    if (!data?.length) {
      throw new Error(`Could not sync ${table}.`);
    }
    return;
  }
  const column = missingColumn(error.message);
  if (column && TABLE_COLUMNS[table].includes(column) && !omit.has(column)) {
    omit.add(column);
    await writeRows(table, rows, mode, omit);
    return;
  }
  const fk = fkColumn(table, `${error.message} ${(error as WriteError).details ?? ""}`);
  const nullable = new Set([
    "primary_passage_id",
    "visual_asset_id",
    "category_id",
    "language_id",
    "audio_asset_id",
    "background_asset_id",
    "bible_version_id",
    "created_by",
    "operator_id",
    "current_item_id",
    "current_lyric_id",
    "current_slide_id",
  ]);
  if (fk && nullable.has(fk) && !omit.has(fk)) {
    for (const row of rows) row[fk] = null;
    omit.add(fk);
    await writeRows(table, rows, mode, omit);
    return;
  }
  throw asError(
    {
      message: [error.message, (error as WriteError).details]
        .filter(Boolean)
        .join(" "),
    },
    `Could not sync ${table}.`,
  );
}

async function pushLocalRow(
  churchId: string,
  table: TableName,
  id: string,
  stack: Set<string>,
) {
  const key = `${table}:${id}`;
  if (stack.has(key)) return true;
  stack.add(key);
  const row = await getRow(churchId, table, id);
  if (!row) return false;
  const prepared = await prepareRow(churchId, table, { ...row }, stack);
  await writeRows(table, [prepared], "upsert");
  await markPushed(churchId, table, id);
  return true;
}

async function prepareRow(
  churchId: string,
  table: TableName,
  row: LocalRow,
  stack: Set<string>,
) {
  const refs = ROW_REFS[table] ?? [];
  for (const ref of refs) {
    const relatedId = row[ref.column];
    if (!relatedId || typeof relatedId !== "string") continue;
    const required = table === "setlist_items" && requiredSetlistRef(row, ref.column);
    try {
      const ok = await pushLocalRow(churchId, ref.table, relatedId, stack);
      if (ok) continue;
    } catch (err) {
      if (required) throw err;
      row[ref.column] = null;
      continue;
    }
    if (required) {
      throw new SkipOutboxItem(`Missing ${ref.table} for ${table}.`);
    }
    row[ref.column] = null;
  }
  return row;
}

async function fetchTable(table: TableName, churchId: string) {
  let query = supabase.from(table).select("*");
  if (!GLOBAL_TABLES.has(table) && !CHILD_TABLES.includes(table)) {
    query = query.eq("church_id", churchId);
  }
  const { data, error } = await query;
  if (error) throw asError(error, `Could not refresh ${table}.`);
  return (data ?? []) as LocalRow[];
}

export async function pullRemote(churchId: string) {
  await withContentBatch(async () => {
    const versions = await fetchTable("bible_versions", churchId);
    await mergeRemote(churchId, "bible_versions", versions);
    for (const table of [...CHURCH_TABLES, ...CHILD_TABLES]) {
      const rows = await fetchTable(table, churchId);
      await mergeRemote(churchId, table, rows);
    }
  });
}

async function applyItem(item: OutboxItem) {
  const { op } = item;
  const stack = new Set<string>();
  if (op.type === "upsert") {
    const prepared = await prepareRow(item.churchId, op.table, { ...op.row }, stack);
    await writeRows(op.table, [prepared], "upsert");
    await markPushed(item.churchId, op.table, op.row.id);
    return;
  }
  if (op.type === "delete") {
    const { error } = await supabase.from(op.table).delete().eq("id", op.rowId);
    if (error) throw asError(error, `Could not sync ${op.table}.`);
    return;
  }
  const { error: delError } = await supabase
    .from(op.table)
    .delete()
    .eq(op.parentColumn, op.parentId);
  if (delError) throw asError(delError, `Could not sync ${op.table}.`);
  if (!op.rows.length) return;
  const prepared = [];
  for (const row of op.rows) {
    prepared.push(await prepareRow(item.churchId, op.table, { ...row }, stack));
  }
  await writeRows(op.table, prepared, "insert");
  for (const row of op.rows) {
    await markPushed(item.churchId, op.table, row.id);
  }
}

function tableRank(table: TableName) {
  const index = PUSH_ORDER.indexOf(table);
  return index < 0 ? PUSH_ORDER.length : index;
}

function sortOutbox(items: OutboxItem[]) {
  return [...items].sort((left, right) => {
    const leftTable = tableRank(left.op.table);
    const rightTable = tableRank(right.op.table);
    const leftDelete = left.op.type === "delete";
    const rightDelete = right.op.type === "delete";
    if (leftDelete !== rightDelete) return leftDelete ? 1 : -1;
    if (leftDelete) return rightTable - leftTable;
    if (leftTable !== rightTable) return leftTable - rightTable;
    const leftReplace = left.op.type === "replaceChildren" ? 1 : 0;
    const rightReplace = right.op.type === "replaceChildren" ? 1 : 0;
    return leftReplace - rightReplace;
  });
}

export async function pushOutbox(churchId: string) {
  await requeueLocalOnly(churchId);
  let lastError = "";
  while (true) {
    const items = sortOutbox(await getOutbox(churchId));
    if (!items.length) return;
    let progressed = false;
    lastError = "";
    for (const item of items) {
      try {
        await applyItem(item);
        await dequeueOutboxItem(churchId, item.id);
        progressed = true;
      } catch (err) {
        if (err instanceof SkipOutboxItem) {
          if (item.op.type === "upsert") {
            await removeRow(churchId, item.op.table, item.op.row.id, {
              enqueue: false,
            });
          }
          await dequeueOutboxItem(churchId, item.id);
          progressed = true;
          continue;
        }
        lastError = err instanceof Error ? err.message : "Could not sync.";
      }
    }
    if (!progressed) throw new Error(lastError || "Could not sync.");
  }
}
