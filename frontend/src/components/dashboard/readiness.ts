import type { Setlist, SetlistItem } from "../../lib/types";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export type ReadinessCheck = {
  id: "items" | "lyrics" | "sermons" | "durations" | "sync";
  ok: boolean;
  label: string;
  /** Where to go to fix it (route), when there is one the viewer may open. */
  fixTo?: string;
  fixLabel?: string;
  /** In-place fix (e.g. run a backup) instead of a route. */
  fixAction?: "sync";
};

function count(t: Translate, n: number, one: string, many: string) {
  return n === 1 ? t(one) : t(many, { n });
}

/** Pre-service checklist computed from the hydrated setlist and the sync outbox. */
export function readinessChecks(
  setlist: Setlist,
  options: { t: Translate; pending: number; canEditLibrary: boolean; canManage: boolean },
): ReadinessCheck[] {
  const { t, pending, canEditLibrary, canManage } = options;
  const items: SetlistItem[] = setlist.items ?? [];
  const setlistHref = `/setlists?setlist=${setlist.id}`;

  const songsMissingLyrics = items.filter(
    (item) => item.item_type === "song" && !item.song?.lyric_sections?.some((s) => s.content.trim()),
  );
  const draftSermons = items.filter(
    (item) => item.item_type === "sermon" && (item.sermon?.status ?? "draft") !== "ready",
  );
  const noDuration = items.filter((item) => !item.duration_seconds);

  const firstSong = songsMissingLyrics.find((item) => item.song_id);
  const firstSermon = draftSermons.find((item) => item.sermon_id);

  return [
    {
      id: "items",
      ok: items.length > 0,
      label: items.length > 0 ? t("dash.checkItems") : t("dash.checkItemsEmpty"),
      fixTo: canManage ? setlistHref : undefined,
      fixLabel: t("dash.addItems"),
    },
    {
      id: "lyrics",
      ok: songsMissingLyrics.length === 0,
      label: songsMissingLyrics.length
        ? count(t, songsMissingLyrics.length, "dash.checkLyricsMissingOne", "dash.checkLyricsMissing")
        : t("dash.checkLyrics"),
      fixTo: canEditLibrary && firstSong ? `/songs?song=${firstSong.song_id}` : undefined,
      fixLabel: t("dash.fix"),
    },
    {
      id: "sermons",
      ok: draftSermons.length === 0,
      label: draftSermons.length
        ? count(t, draftSermons.length, "dash.checkSermonsDraftOne", "dash.checkSermonsDraft")
        : t("dash.checkSermons"),
      fixTo: canEditLibrary && firstSermon ? `/sermon?sermon=${firstSermon.sermon_id}` : undefined,
      fixLabel: t("dash.fix"),
    },
    {
      id: "durations",
      ok: noDuration.length === 0,
      label: noDuration.length
        ? count(t, noDuration.length, "dash.checkDurationsMissingOne", "dash.checkDurationsMissing")
        : t("dash.checkDurations"),
      fixTo: canManage ? setlistHref : undefined,
      fixLabel: t("dash.fix"),
    },
    {
      id: "sync",
      ok: pending === 0,
      label: pending
        ? count(t, pending, "dash.checkSyncPendingOne", "dash.checkSyncPending")
        : t("dash.checkSync"),
      fixAction: "sync",
      fixLabel: t("dash.backupNow"),
    },
  ];
}

/** "1:05:12" / "12:04" until the service, "3d 4h" when more than a day away. */
export function countdown(serviceAt: string | null | undefined, now: number) {
  if (!serviceAt) return null;
  const at = new Date(serviceAt).getTime();
  if (!Number.isFinite(at)) return null;
  const diff = at - now;
  if (diff <= 0) return { started: true, text: "" };
  const secs = Math.floor(diff / 1000);
  const days = Math.floor(secs / 86_400);
  const h = Math.floor((secs % 86_400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (days > 0) return { started: false, text: `${days}d ${h}h` };
  const pad = (n: number) => String(n).padStart(2, "0");
  return { started: false, text: h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}` };
}
