import type { Setlist, SetlistItem } from "../../lib/types";

export type SetlistGroupId = "today" | "week" | "upcoming" | "unscheduled" | "past";

export const GROUP_LABELS: Record<SetlistGroupId, string> = {
  today: "Today",
  week: "This week",
  upcoming: "Upcoming",
  unscheduled: "Unscheduled",
  past: "Past",
};

const ORDER: SetlistGroupId[] = ["today", "week", "upcoming", "unscheduled", "past"];

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function groupOf(row: Setlist, today: number): SetlistGroupId {
  if (!row.service_at) return "unscheduled";
  const at = new Date(row.service_at);
  if (!Number.isFinite(at.getTime())) return "unscheduled";
  const day = startOfDay(at);
  if (day < today) return "past";
  if (day === today) return "today";
  if (day - today < 7 * 86_400_000) return "week";
  return "upcoming";
}

/** Bucket setlists by service date: soonest first for future, latest first for past. */
export function groupSetlists(rows: Setlist[], now = new Date()) {
  const today = startOfDay(now);
  const buckets = new Map<SetlistGroupId, Setlist[]>();
  for (const row of rows) {
    const id = groupOf(row, today);
    buckets.set(id, [...(buckets.get(id) ?? []), row]);
  }
  return ORDER.filter((id) => buckets.has(id)).map((id) => {
    const items = [...(buckets.get(id) ?? [])];
    if (id !== "unscheduled") {
      items.sort((a, b) => {
        const diff = (a.service_at ?? "").localeCompare(b.service_at ?? "");
        return id === "past" ? -diff : diff;
      });
    }
    return { id, label: GROUP_LABELS[id], items };
  });
}

export function itemsDuration(items: SetlistItem[] | undefined) {
  return (items ?? []).reduce((sum, item) => sum + (item.duration_seconds ?? 0), 0);
}

export function serviceTime(value: string | null | undefined) {
  if (!value) return "";
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return "";
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function serviceDate(value: string | null | undefined, long = false) {
  if (!value) return "";
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return "";
  return at.toLocaleDateString(
    undefined,
    long
      ? { weekday: "long", month: "short", day: "numeric" }
      : { month: "short", day: "numeric" },
  );
}
