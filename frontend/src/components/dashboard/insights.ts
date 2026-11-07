import { listSetlists } from "../../lib/api";
import { categoryTone, categoryVisual } from "../../lib/categoryColor";
import { requireChurchId } from "../../lib/helpers";
import { listRows } from "../../lib/offline/store";
import type { Category, Setlist, SetlistItem, Song } from "../../lib/types";

/**
 * Dashboard chart data, computed from the device's local copy (IndexedDB).
 * No backend calls: everything here is a read of rows the app already synced.
 */

export type WeekDatum = { label: string; value: number; current?: boolean; start: number };
export type ScheduledSong = { id: string; title: string; count: number };
export type CategoryPart = { label: string; value: number; color: string };

export type Insights = {
  /** Setlists per week by service date: 8 weeks back, this week, 3 ahead. */
  servicesByWeek: WeekDatum[];
  /** Songs ranked by how many setlist items reference them. */
  scheduled: ScheduledSong[];
  /** Library size at the end of each of the last 8 weeks (cumulative). */
  songTrend: number[];
  /** Songs added in the last 7 days. */
  songsAddedThisWeek: number;
};

const DAY = 86_400_000;
const WEEKS_BACK = 8;
const WEEKS_AHEAD = 3;

/** Local midnight of the Sunday that starts the week containing `at`. */
export function weekStart(at: number) {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date.getTime();
}

function addWeeks(start: number, n: number) {
  const date = new Date(start);
  date.setDate(date.getDate() + n * 7);
  return date.getTime();
}

export async function loadInsights(activeRows: Setlist[], locale?: string): Promise<Insights> {
  const churchId = await requireChurchId();
  const [archived, songs, items] = await Promise.all([
    listSetlists({ archived: true, limit: 1000 }).catch(() => ({ items: [] as Setlist[] })),
    listRows<Song>(churchId, "songs").catch(() => [] as Song[]),
    listRows<SetlistItem>(churchId, "setlist_items").catch(() => [] as SetlistItem[]),
  ]);

  // Every setlist this workspace can see (active + archived), de-duplicated.
  const visible = new Map<string, Setlist>();
  for (const row of [...activeRows, ...archived.items]) visible.set(row.id, row);

  // ── Services per week ────────────────────────────────────────────────
  const now = Date.now();
  const thisWeek = weekStart(now);
  const servicesByWeek: WeekDatum[] = [];
  for (let offset = -WEEKS_BACK; offset <= WEEKS_AHEAD; offset += 1) {
    const start = addWeeks(thisWeek, offset);
    servicesByWeek.push({
      start,
      label: new Date(start).toLocaleDateString(locale, { month: "short", day: "numeric" }),
      value: 0,
      current: offset === 0,
    });
  }
  const first = servicesByWeek[0].start;
  const end = addWeeks(thisWeek, WEEKS_AHEAD + 1);
  for (const row of visible.values()) {
    if (!row.service_at) continue;
    const at = new Date(row.service_at).getTime();
    if (!Number.isFinite(at) || at < first || at >= end) continue;
    const bucket = servicesByWeek.find((week) => week.start === weekStart(at));
    if (bucket) bucket.value += 1;
  }

  // ── Most scheduled songs ─────────────────────────────────────────────
  const titles = new Map(songs.map((song) => [song.id, song.title]));
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.item_type !== "song" || !item.song_id || !visible.has(item.setlist_id)) continue;
    counts.set(item.song_id, (counts.get(item.song_id) ?? 0) + 1);
  }
  const scheduled = [...counts.entries()]
    .map(([id, count]) => ({ id, count, title: titles.get(id) ?? "" }))
    .filter((row) => row.title)
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 5);

  // ── Library growth ───────────────────────────────────────────────────
  const created = songs
    .map((song) => new Date(song.created_at).getTime())
    .filter((at) => Number.isFinite(at));
  const songTrend: number[] = [];
  for (let offset = -(WEEKS_BACK - 1); offset <= 0; offset += 1) {
    const cutoff = offset === 0 ? now : addWeeks(thisWeek, offset + 1);
    songTrend.push(created.filter((at) => at <= cutoff).length + (songs.length - created.length));
  }
  const songsAddedThisWeek = created.filter((at) => at > now - 7 * DAY).length;

  return { servicesByWeek, scheduled, songTrend, songsAddedThisWeek };
}

/** Song counts per category, colored by each category's own color. */
export function categoryParts(
  categories: Category[],
  totalSongs: number,
  uncategorizedLabel: string,
): CategoryPart[] {
  const parts = categories
    .map((category) => ({
      label: category.name,
      value: category.song_count ?? 0,
      color: categoryVisual[categoryTone(category.color)].hex,
    }))
    .filter((part) => part.value > 0)
    .sort((a, b) => b.value - a.value);
  const assigned = parts.reduce((sum, part) => sum + part.value, 0);
  const rest = totalSongs - assigned;
  if (rest > 0) parts.push({ label: uncategorizedLabel, value: rest, color: "var(--mc-outline)" });
  return parts;
}
