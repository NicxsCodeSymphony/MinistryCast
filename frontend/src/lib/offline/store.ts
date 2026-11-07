import { auditLocalMutation } from "../admin";
import { idbGet, idbSet } from "./idb";
import { publishContent } from "./live";
import { invalidateQueries } from "./queryCache";
import { newId, nowIso, setSyncSnapshot } from "./status";

export type TableName =
  | "categories"
  | "languages"
  | "tags"
  | "songs"
  | "song_lyric_sections"
  | "sermons"
  | "sermon_slides"
  | "sermon_notes"
  | "setlists"
  | "setlist_items"
  | "setlist_shares"
  | "sermon_shares"
  | "scripture_passages"
  | "media_assets"
  | "church_settings"
  | "output_displays"
  | "presentations"
  | "bible_versions";

const CONTENT_TABLES = new Set<TableName>([
  "songs",
  "song_lyric_sections",
  "sermons",
  "sermon_slides",
  "sermon_notes",
  "setlists",
  "setlist_items",
  "scripture_passages",
  "church_settings",
  "categories",
  "languages",
]);

let contentQuiet = 0;
let contentDirty = false;
let contentTimer = 0;

function flushContent() {
  if (contentQuiet > 0 || !contentDirty) return;
  contentDirty = false;
  publishContent();
}

function notifyContent(table: TableName) {
  invalidateQueries();
  if (!CONTENT_TABLES.has(table)) return;
  contentDirty = true;
  window.clearTimeout(contentTimer);
  contentTimer = window.setTimeout(flushContent, 80);
}

export async function withContentBatch<T>(fn: () => Promise<T>) {
  contentQuiet += 1;
  try {
    return await fn();
  } finally {
    contentQuiet -= 1;
    flushContent();
  }
}

export type LocalRow = Record<string, unknown> & {
  id: string;
  __localOnly?: boolean;
  /** Outbox-only: row has never reached the server, so a delete can just drop the upsert. */
  __new?: boolean;
};

export type OutboxOp =
  | { type: "upsert"; table: TableName; row: LocalRow }
  | { type: "delete"; table: TableName; rowId: string }
  | {
      type: "replaceChildren";
      table: TableName;
      parentColumn: string;
      parentId: string;
      rows: LocalRow[];
    };

export type OutboxItem = {
  id: string;
  churchId: string;
  createdAt: string;
  op: OutboxOp;
};

export type ChurchMeta = {
  churchId: string;
  hydratedAt: string | null;
  lastSyncAt: string | null;
  backupFrequency: string;
};

type Collection = Record<string, LocalRow>;

// IndexedDB has no cross-key transactions here, so every read-modify-write of a
// church's collections/outbox must be serialized or concurrent writers clobber each other.
const writeLocks = new Map<string, Promise<unknown>>();

function withWriteLock<T>(churchId: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(churchId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  writeLocks.set(churchId, tail);
  void tail.then(() => {
    if (writeLocks.get(churchId) === tail) writeLocks.delete(churchId);
  });
  return run;
}

function colKey(churchId: string, table: TableName) {
  return `col:${churchId}:${table}`;
}

function outboxKey(churchId: string) {
  return `outbox:${churchId}`;
}

function metaKey(churchId: string) {
  return `meta:${churchId}`;
}

export async function getMeta(churchId: string): Promise<ChurchMeta> {
  return (
    (await idbGet<ChurchMeta>(metaKey(churchId))) ?? {
      churchId,
      hydratedAt: null,
      lastSyncAt: null,
      backupFrequency: "hourly",
    }
  );
}

export async function setMeta(churchId: string, patch: Partial<ChurchMeta>) {
  const current = await getMeta(churchId);
  const next = { ...current, ...patch, churchId };
  await idbSet(metaKey(churchId), next);
  setSyncSnapshot({
    lastSyncAt: next.lastSyncAt,
    frequency: next.backupFrequency,
  });
  return next;
}

/*
 * In-memory read cache over IndexedDB collections.
 *
 * Pages hydrate rows one by one (each song reads categories, languages and
 * every lyric section), so without this a 50-song page decoded the whole
 * lyrics table ~50 times. Reads now share one in-flight read and then hit
 * memory; writes go through to IndexedDB and update the cache.
 *
 * Cross-window safety: every write bumps a revision in localStorage (shared by
 * all app windows, e.g. the projector). A window whose cached revision differs
 * drops its cache before the next read, so it never serves stale rows. If
 * localStorage is unavailable the cache is bypassed entirely.
 */
const STORE_REV_KEY = "mc.store.rev";
const memo = new Map<string, Collection>();
const memoReads = new Map<string, Promise<Collection>>();
let memoRev: string | null = null;

function readStoreRev(): string | null {
  try {
    return localStorage.getItem(STORE_REV_KEY) ?? "0";
  } catch {
    return null;
  }
}

/** True when the cache may be used; clears it if another window wrote. */
function memoUsable() {
  const current = readStoreRev();
  if (current === null) {
    memo.clear();
    memoReads.clear();
    return false;
  }
  if (current !== memoRev) {
    memo.clear();
    memoReads.clear();
    memoRev = current;
  }
  return true;
}

function bumpStoreRev() {
  const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    localStorage.setItem(STORE_REV_KEY, next);
    memoRev = next;
  } catch {
    memoRev = null;
    memo.clear();
  }
}

export async function getCollection(churchId: string, table: TableName) {
  const key = colKey(churchId, table);
  if (!memoUsable()) return (await idbGet<Collection>(key)) ?? {};
  const hit = memo.get(key);
  // Shallow copy: callers add/delete keys before writing back.
  if (hit) return { ...hit };
  let read = memoReads.get(key);
  if (!read) {
    const rev = memoRev;
    read = idbGet<Collection>(key).then((value) => {
      const collection = value ?? {};
      if (memoRev === rev && memoReads.get(key) === read) memo.set(key, collection);
      if (memoReads.get(key) === read) memoReads.delete(key);
      return collection;
    });
    memoReads.set(key, read);
  }
  return { ...(await read) };
}

export async function setCollection(
  churchId: string,
  table: TableName,
  collection: Collection,
) {
  const key = colKey(churchId, table);
  await idbSet(key, collection);
  // Drop any read that started before this write, then publish the new state.
  memoReads.delete(key);
  memoUsable();
  bumpStoreRev();
  if (memoRev !== null) memo.set(key, { ...collection });
}

export async function listRows<T extends LocalRow>(
  churchId: string,
  table: TableName,
) {
  const collection = await getCollection(churchId, table);
  return Object.values(collection) as T[];
}

export async function getRow<T extends LocalRow>(
  churchId: string,
  table: TableName,
  id: string,
) {
  const collection = await getCollection(churchId, table);
  return (collection[id] as T | undefined) ?? null;
}

export async function getOutbox(churchId: string) {
  return (await idbGet<OutboxItem[]>(outboxKey(churchId))) ?? [];
}

async function saveOutbox(churchId: string, items: OutboxItem[]) {
  await idbSet(outboxKey(churchId), items);
  setSyncSnapshot({ pending: items.length });
}

export async function refreshPending(churchId: string) {
  const items = await getOutbox(churchId);
  const meta = await getMeta(churchId);
  setSyncSnapshot({
    pending: items.length,
    lastSyncAt: meta.lastSyncAt,
    frequency: meta.backupFrequency,
  });
  return items.length;
}

const CHILD_TABLES: { table: TableName; parent: TableName; column: string }[] = [
  { table: "song_lyric_sections", parent: "songs", column: "song_id" },
  { table: "sermon_slides", parent: "sermons", column: "sermon_id" },
  { table: "sermon_notes", parent: "sermons", column: "sermon_id" },
  { table: "setlist_items", parent: "setlists", column: "setlist_id" },
  { table: "setlist_shares", parent: "setlists", column: "setlist_id" },
  { table: "sermon_shares", parent: "sermons", column: "sermon_id" },
  // Match DB ON DELETE CASCADE so live sessions don't point at a missing setlist.
  { table: "presentations", parent: "setlists", column: "setlist_id" },
];

const REF_LINKS: { table: TableName; parent: TableName; column: string }[] = [
  { table: "setlist_items", parent: "sermons", column: "sermon_id" },
  { table: "setlist_items", parent: "songs", column: "song_id" },
  { table: "setlist_items", parent: "scripture_passages", column: "passage_id" },
  { table: "setlist_items", parent: "media_assets", column: "media_asset_id" },
];

function dropChildOps(next: OutboxItem[], parentTable: TableName, parentId: string) {
  const children = [...CHILD_TABLES, ...REF_LINKS].filter(
    (row) => row.parent === parentTable,
  );
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const op = next[index].op;
    if (op.type === "replaceChildren" && op.parentId === parentId) {
      next.splice(index, 1);
      continue;
    }
    for (const child of children) {
      if (op.type === "upsert" && op.table === child.table && op.row[child.column] === parentId) {
        next.splice(index, 1);
        break;
      }
      if (op.type === "replaceChildren" && op.table === child.table && op.parentId === parentId) {
        next.splice(index, 1);
        break;
      }
    }
  }
}

export function compactOutbox(items: OutboxItem[]) {
  const next: OutboxItem[] = [];
  for (let item of items) {
    const { op } = item;
    if (op.type === "replaceChildren") {
      const idx = next.findIndex(
        (row) =>
          row.op.type === "replaceChildren" &&
          row.op.table === op.table &&
          row.op.parentId === op.parentId,
      );
      if (idx >= 0) next.splice(idx, 1);
      next.push(item);
      continue;
    }
    if (op.type === "upsert") {
      const upsertIdx = next.findIndex(
        (row) =>
          row.op.type === "upsert" &&
          row.op.table === op.table &&
          row.op.row.id === op.row.id,
      );
      if (upsertIdx >= 0) {
        const earlier = next[upsertIdx].op;
        if (earlier.type === "upsert" && earlier.row.__new) {
          item = { ...item, op: { ...op, row: { ...op.row, __new: true } } };
        }
        next.splice(upsertIdx, 1);
      }
      const deleteIdx = next.findIndex(
        (row) =>
          row.op.type === "delete" &&
          row.op.table === op.table &&
          row.op.rowId === op.row.id,
      );
      if (deleteIdx >= 0) next.splice(deleteIdx, 1);
      next.push(item);
      continue;
    }
    const upsertIdx = next.findIndex(
      (row) =>
        row.op.type === "upsert" &&
        row.op.table === op.table &&
        row.op.row.id === op.rowId,
    );
    const wasLocal = Boolean(
      upsertIdx >= 0 &&
        next[upsertIdx].op.type === "upsert" &&
        next[upsertIdx].op.row.__new,
    );
    if (upsertIdx >= 0) next.splice(upsertIdx, 1);
    dropChildOps(next, op.table, op.rowId);
    if (wasLocal) continue;
    const deleteIdx = next.findIndex(
      (row) =>
        row.op.type === "delete" &&
        row.op.table === op.table &&
        row.op.rowId === op.rowId,
    );
    if (deleteIdx >= 0) next.splice(deleteIdx, 1);
    next.push(item);
  }
  return next;
}

async function cascadeLocalChildren(
  churchId: string,
  table: TableName,
  id: string,
) {
  const children = [...CHILD_TABLES, ...REF_LINKS].filter((row) => row.parent === table);
  for (const child of children) {
    const collection = await getCollection(churchId, child.table);
    let changed = false;
    for (const [rowId, row] of Object.entries(collection)) {
      if (row[child.column] === id) {
        delete collection[rowId];
        changed = true;
      }
    }
    if (changed) await setCollection(churchId, child.table, collection);
  }
}

async function enqueueUnlocked(
  churchId: string,
  op: OutboxOp,
  previous?: LocalRow | LocalRow[] | null,
  extra?: { parentTitle?: string },
) {
  const cleaned: OutboxOp =
    op.type === "upsert"
      ? { ...op, row: { ...op.row } }
      : op;
  const items = compactOutbox([
    ...(await getOutbox(churchId)),
    { id: newId(), churchId, createdAt: nowIso(), op: cleaned },
  ]);
  await saveOutbox(churchId, items);
  auditLocalMutation(
    churchId,
    {
      ...cleaned,
      parentTitle: extra?.parentTitle,
    },
    previous,
  );
}

export function enqueue(
  churchId: string,
  op: OutboxOp,
  previous?: LocalRow | LocalRow[] | null,
  extra?: { parentTitle?: string },
) {
  return withWriteLock(churchId, () =>
    enqueueUnlocked(churchId, op, previous, extra),
  );
}

export function replaceOutbox(churchId: string, items: OutboxItem[]) {
  return withWriteLock(churchId, () => saveOutbox(churchId, items));
}

export function dequeueOutboxItem(churchId: string, itemId: string) {
  return withWriteLock(churchId, async () => {
    const items = await getOutbox(churchId);
    await saveOutbox(
      churchId,
      items.filter((item) => item.id !== itemId),
    );
  });
}

export const PUSH_ORDER: TableName[] = [
  "church_settings",
  "output_displays",
  "categories",
  "languages",
  "tags",
  "media_assets",
  "songs",
  "scripture_passages",
  "sermons",
  "sermon_shares",
  "setlists",
  "setlist_shares",
  "presentations",
  "song_lyric_sections",
  "sermon_slides",
  "sermon_notes",
  "setlist_items",
];

/** Re-queue rows that never made it to the cloud if the outbox was overwritten. */
export async function requeueLocalOnly(churchId: string) {
  const pending = await getOutbox(churchId);
  const covered = new Set<string>();
  for (const item of pending) {
    if (item.op.type === "upsert") {
      covered.add(`${item.op.table}:${item.op.row.id}`);
    } else if (item.op.type === "delete") {
      covered.add(`${item.op.table}:${item.op.rowId}`);
    } else {
      covered.add(`${item.op.table}:${item.op.parentId}`);
      for (const row of item.op.rows) covered.add(`${item.op.table}:${row.id}`);
    }
  }
  for (const table of PUSH_ORDER) {
    const rows = await listRows(churchId, table);
    for (const row of rows) {
      if (!row.__localOnly) continue;
      if (covered.has(`${table}:${row.id}`)) continue;
      await enqueue(churchId, { type: "upsert", table, row });
    }
  }
}

export function putRow(
  churchId: string,
  table: TableName,
  row: LocalRow,
  options?: { localOnly?: boolean; enqueue?: boolean },
) {
  return withWriteLock(churchId, async () => {
    const collection = await getCollection(churchId, table);
    const queued = options?.enqueue !== false;
    const previous = collection[row.id] ?? null;
    const next: LocalRow = {
      ...row,
      __localOnly: queued ? true : (options?.localOnly ?? row.__localOnly ?? false),
    };
    delete next.__new;
    collection[row.id] = next;
    await setCollection(churchId, table, collection);
    notifyContent(table);
    if (queued) {
      await enqueueUnlocked(
        churchId,
        { type: "upsert", table, row: previous ? next : { ...next, __new: true } },
        previous,
      );
    }
    return next;
  });
}

export function removeRow(
  churchId: string,
  table: TableName,
  id: string,
  options?: { enqueue?: boolean },
) {
  return withWriteLock(churchId, async () => {
    const collection = await getCollection(churchId, table);
    const existing = collection[id];
    delete collection[id];
    await setCollection(churchId, table, collection);
    await cascadeLocalChildren(churchId, table, id);
    notifyContent(table);
    if (options?.enqueue !== false) {
      await enqueueUnlocked(
        churchId,
        { type: "delete", table, rowId: id },
        existing ?? null,
      );
    }
    return existing ?? null;
  });
}

export function replaceChildren(
  churchId: string,
  table: TableName,
  parentColumn: string,
  parentId: string,
  rows: LocalRow[],
) {
  return withWriteLock(churchId, async () => {
    const collection = await getCollection(churchId, table);
    const previousRows = Object.values(collection).filter(
      (row) => row[parentColumn] === parentId,
    );
    for (const [id, row] of Object.entries(collection)) {
      if (row[parentColumn] === parentId) delete collection[id];
    }
    for (const row of rows) collection[row.id] = { ...row, __localOnly: true };
    await setCollection(churchId, table, collection);
    notifyContent(table);
    const parentLink = CHILD_TABLES.find((row) => row.table === table);
    const parent = parentLink
      ? await getRow(churchId, parentLink.parent, parentId)
      : null;
    const parentTitle = parent
      ? String(parent.title ?? parent.name ?? "").trim()
      : "";
    await enqueueUnlocked(
      churchId,
      {
        type: "replaceChildren",
        table,
        parentColumn,
        parentId,
        rows,
      },
      previousRows,
      { parentTitle },
    );
  });
}

export function mergeRemote(
  churchId: string,
  table: TableName,
  rows: LocalRow[],
) {
  return withWriteLock(churchId, () => mergeRemoteUnlocked(churchId, table, rows));
}

async function mergeRemoteUnlocked(
  churchId: string,
  table: TableName,
  rows: LocalRow[],
) {
  const collection = await getCollection(churchId, table);
  const pending = await getOutbox(churchId);
  const blocked = new Set<string>();
  for (const item of pending) {
    if (item.op.type === "upsert" && item.op.table === table) {
      blocked.add(item.op.row.id);
    }
    if (item.op.type === "delete" && item.op.table === table) {
      blocked.add(item.op.rowId);
    }
    if (item.op.type === "replaceChildren" && item.op.table === table) {
      for (const row of item.op.rows) blocked.add(row.id);
      for (const [id, row] of Object.entries(collection)) {
        if (row[item.op.parentColumn] === item.op.parentId) blocked.add(id);
      }
    }
  }
  const keptLocal = { ...collection };
  if (table !== "bible_versions") {
    for (const [id, row] of Object.entries(keptLocal)) {
      if (!row.__localOnly && !blocked.has(id)) delete keptLocal[id];
    }
  }
  for (const row of rows) {
    if (blocked.has(row.id)) continue;
    keptLocal[row.id] = { ...row, __localOnly: false };
  }
  await setCollection(churchId, table, keptLocal);
  notifyContent(table);
}

export function markPushed(churchId: string, table: TableName, id: string) {
  return withWriteLock(churchId, async () => {
    const items = await getOutbox(churchId);
    let outboxChanged = false;
    const nextItems = items.map((item) => {
      const { op } = item;
      if (op.type !== "upsert" || op.table !== table || op.row.id !== id || !op.row.__new) {
        return item;
      }
      outboxChanged = true;
      const row = { ...op.row };
      delete row.__new;
      return { ...item, op: { ...op, row } };
    });
    if (outboxChanged) await saveOutbox(churchId, nextItems);

    const collection = await getCollection(churchId, table);
    if (!collection[id]) return;
    collection[id] = { ...collection[id], __localOnly: false };
    await setCollection(churchId, table, collection);
  });
}

export function stripLocal<T extends LocalRow>(row: T) {
  const copy = { ...row };
  delete copy.__localOnly;
  delete copy.__new;
  return copy as T;
}
