/**
 * Library insights, computed from data already on this device (IndexedDB).
 * Read-only: no new backend calls. The app doesn't track plays, so
 * "times scheduled" (setlist_items rows) is the usage proxy.
 */
import { listSermons, listSetlists } from "../../lib/api";
import { requireChurchId } from "../../lib/helpers";
import { listRows, type LocalRow } from "../../lib/offline/store";
import { categoryTone, categoryVisual } from "../../lib/categoryColor";
import type {
  Category,
  Sermon,
  Setlist,
  SetlistItem,
  Song,
  SongLyricSection,
} from "../../lib/types";

const DAY = 86_400_000;
const ALL = 100_000;

type Rows<T> = Array<T & LocalRow>;

function rowsOf<T>(churchId: string, table: Parameters<typeof listRows>[1]) {
  return listRows<T & LocalRow>(churchId, table) as Promise<Rows<T>>;
}

function parse(value: string | null | undefined) {
  if (!value) return null;
  const at = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isFinite(at.getTime()) ? at : null;
}

/** Monday 00:00 of the week containing `date`. */
export function weekStart(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
  return next;
}

const shortDate = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Count dates into the last `weeks` calendar weeks (oldest first, current last). */
export function weeklyBuckets(dates: Array<Date | null>, weeks = 8, now = new Date()) {
  const current = weekStart(now).getTime();
  const starts = Array.from({ length: weeks }, (_, i) => current - (weeks - 1 - i) * 7 * DAY);
  const counts = starts.map(() => 0);
  for (const date of dates) {
    if (!date) continue;
    const at = weekStart(date).getTime();
    const index = starts.indexOf(at);
    if (index >= 0) counts[index] += 1;
  }
  return starts.map((start, i) => ({
    label: shortDate(new Date(start)),
    value: counts[i],
    current: i === weeks - 1,
  }));
}

/** Count dates into the last `months` calendar months (oldest first). */
export function monthlyBuckets(dates: Array<Date | null>, months = 6, now = new Date()) {
  const keys = Array.from({ length: months }, (_, i) => {
    const at = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return { key: `${at.getFullYear()}-${at.getMonth()}`, at };
  });
  const counts = new Map(keys.map(({ key }) => [key, 0]));
  for (const date of dates) {
    if (!date) continue;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map(({ key, at }, i) => ({
    label: at.toLocaleDateString(undefined, { month: "short" }),
    value: counts.get(key) ?? 0,
    current: i === months - 1,
  }));
}

export function hasLyrics(sections: SongLyricSection[]) {
  return sections.some((section) => section.content?.trim());
}

/* ── Songs + categories ──────────────────────────────────────────────── */

export type CategoryStat = {
  id: string;
  songs: number;
  scheduled: number;
  /** Times its songs were scheduled per week, last 8 weeks. */
  weekly: number[];
};

export type SongInsights = {
  total: number;
  addedWeekly: number[];
  addedThisWeek: number;
  byCategory: Array<{ label: string; value: number; color: string }>;
  topScheduled: Array<{ label: string; value: number; to: string }>;
  missingLyrics: number;
  categories: Record<string, CategoryStat>;
};

export async function loadSongInsights(): Promise<SongInsights> {
  const churchId = await requireChurchId();
  const [songs, lyrics, items, setlists, categories] = await Promise.all([
    rowsOf<Song>(churchId, "songs"),
    rowsOf<SongLyricSection>(churchId, "song_lyric_sections"),
    rowsOf<SetlistItem>(churchId, "setlist_items"),
    rowsOf<Setlist>(churchId, "setlists"),
    rowsOf<Category>(churchId, "categories"),
  ]);

  const songIds = new Set(songs.map((song) => song.id));
  const withLyrics = new Set<string>();
  for (const section of lyrics) {
    if (section.content?.trim()) withLyrics.add(section.song_id);
  }

  const added = weeklyBuckets(songs.map((song) => parse(song.created_at)));

  const sorted = [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const perCategory = new Map<string, number>();
  let uncategorized = 0;
  const categoryIds = new Set(sorted.map((row) => row.id));
  for (const song of songs) {
    if (song.category_id && categoryIds.has(song.category_id)) {
      perCategory.set(song.category_id, (perCategory.get(song.category_id) ?? 0) + 1);
    } else uncategorized += 1;
  }
  const byCategory = sorted.map((row) => ({
    label: row.name,
    value: perCategory.get(row.id) ?? 0,
    color: categoryVisual[categoryTone(row.color)].hex,
  }));
  if (uncategorized) {
    byCategory.push({ label: "Uncategorized", value: uncategorized, color: "var(--mc-outline)" });
  }

  const setlistAt = new Map(setlists.map((row) => [row.id, parse(row.service_at)]));
  const songById = new Map(songs.map((song) => [song.id, song]));
  const scheduled = new Map<string, number>();
  const categoryDates = new Map<string, Array<Date | null>>();
  for (const item of items) {
    if (item.item_type !== "song" || !item.song_id || !songIds.has(item.song_id)) continue;
    scheduled.set(item.song_id, (scheduled.get(item.song_id) ?? 0) + 1);
    const categoryId = songById.get(item.song_id)?.category_id;
    if (categoryId) {
      const list = categoryDates.get(categoryId) ?? [];
      list.push(setlistAt.get(item.setlist_id) ?? null);
      categoryDates.set(categoryId, list);
    }
  }
  const topScheduled = [...scheduled.entries()]
    .sort((a, b) => b[1] - a[1] || (songById.get(a[0])?.title ?? "").localeCompare(songById.get(b[0])?.title ?? ""))
    .slice(0, 3)
    .map(([id, value]) => ({
      label: songById.get(id)?.title ?? "Untitled",
      value,
      to: `/songs?song=${id}`,
    }));

  const categoryStats: Record<string, CategoryStat> = {};
  for (const row of sorted) {
    const dates = categoryDates.get(row.id) ?? [];
    categoryStats[row.id] = {
      id: row.id,
      songs: perCategory.get(row.id) ?? 0,
      scheduled: dates.length,
      weekly: weeklyBuckets(dates).map((bucket) => bucket.value),
    };
  }

  return {
    total: songs.length,
    addedWeekly: added.map((bucket) => bucket.value),
    addedThisWeek: added[added.length - 1]?.value ?? 0,
    byCategory,
    topScheduled,
    missingLyrics: songs.filter((song) => !withLyrics.has(song.id)).length,
    categories: categoryStats,
  };
}

/* ── Setlists ────────────────────────────────────────────────────────── */

export type SetlistInsights = {
  thisMonth: number;
  lastMonth: number;
  weekly: Array<{ label: string; value: number; current?: boolean }>;
  /** Average running time in seconds over setlists that have one. */
  averageSeconds: number;
  averageOf: number;
  next: { id: string; name: string; at: Date } | null;
};

export async function loadSetlistInsights(viewChurchId: string | null): Promise<SetlistInsights> {
  const churchId = await requireChurchId();
  const [active, archived, items] = await Promise.all([
    listSetlists({ limit: ALL, viewChurchId, archived: false }),
    listSetlists({ limit: ALL, viewChurchId, archived: true }),
    rowsOf<SetlistItem>(churchId, "setlist_items"),
  ]);
  const all = [...active.items, ...archived.items];
  const now = new Date();
  const dates = all.map((row) => parse(row.service_at));

  const monthKey = (date: Date) => date.getFullYear() * 12 + date.getMonth();
  const thisKey = monthKey(now);
  const thisMonth = dates.filter((date) => date && monthKey(date) === thisKey).length;
  const lastMonth = dates.filter((date) => date && monthKey(date) === thisKey - 1).length;

  const itemSeconds = new Map<string, number>();
  for (const item of items) {
    itemSeconds.set(item.setlist_id, (itemSeconds.get(item.setlist_id) ?? 0) + (item.duration_seconds ?? 0));
  }
  const lengths = all
    .map((row) => row.est_duration_seconds || itemSeconds.get(row.id) || 0)
    .filter((seconds) => seconds > 0);
  const averageSeconds = lengths.length
    ? Math.round(lengths.reduce((sum, seconds) => sum + seconds, 0) / lengths.length)
    : 0;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const upcoming = active.items
    .map((row) => ({ row, at: parse(row.service_at) }))
    .filter((entry): entry is { row: Setlist; at: Date } => Boolean(entry.at && entry.at >= todayStart))
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];

  return {
    thisMonth,
    lastMonth,
    weekly: weeklyBuckets(dates, 8, now),
    averageSeconds,
    averageOf: lengths.length,
    next: upcoming ? { id: upcoming.row.id, name: upcoming.row.name, at: upcoming.at } : null,
  };
}

/** "Today", "Tomorrow", "In 5 days". */
export function countdown(at: Date, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  const days = Math.round((day.getTime() - start.getTime()) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/* ── Sermons ─────────────────────────────────────────────────────────── */

export type SermonInsights = {
  ready: number;
  draft: number;
  monthly: Array<{ label: string; value: number; current?: boolean }>;
  speakers: Array<{ label: string; value: number }>;
};

export async function loadSermonInsights(viewChurchId: string | null): Promise<SermonInsights> {
  const [active, archived] = await Promise.all([
    listSermons({ limit: ALL, viewChurchId, archived: false }),
    listSermons({ limit: ALL, viewChurchId, archived: true }),
  ]);
  const all: Sermon[] = [...active.items, ...archived.items];
  const ready = active.items.filter((row) => row.status === "ready").length;
  const speakers = new Map<string, number>();
  for (const row of all) {
    const name = row.speaker_name?.trim();
    if (name) speakers.set(name, (speakers.get(name) ?? 0) + 1);
  }
  return {
    ready,
    draft: active.items.length - ready,
    monthly: monthlyBuckets(all.map((row) => parse(row.service_date) ?? parse(row.created_at))),
    speakers: [...speakers.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([label, value]) => ({ label, value })),
  };
}
