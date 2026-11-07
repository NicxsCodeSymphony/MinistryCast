import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import SetlistFormModal from "../../components/modals/SetlistFormModal";
import SongFormModal, {
  type SongFormValues,
} from "../../components/modals/SongFormModal";
import { RowsSkeleton, Skeleton } from "../../components/Skeleton";
import {
  createSetlist,
  createSong,
  getActivePresentation,
  getDashboardStats,
  getSetlist,
  itemMeta,
  listCategories,
  listChurchNames,
  listOutputDisplays,
  listRecentPresentations,
  listSermons,
  listSetlists,
  listSongs,
  readSetlistViewChurchId,
  updateSetlist,
  writeSetlistViewChurchId,
  type ChurchName,
} from "../../lib/api";
import { getSessionProfile, isSuperadmin, canManageSetlists, isLibraryEditor } from "../../lib/auth";
import { formatDuration, localDateInput, formatRelative, parseDurationSeconds, textToLyricSections } from "../../lib/helpers";
import { forceSync } from "../../lib/offline/sync";
import { syncIcon, syncLabel } from "../../lib/offline/status";
import { useSyncStatus } from "../../lib/offline/useSyncStatus";
import { usePrefs } from "../../lib/PrefsContext";
import { useToast } from "../../lib/ToastContext";
import type { Category, OutputDisplay, Presentation, Setlist } from "../../lib/types";
import {
  readPreferredSetlistId,
  writePreferredSetlistId,
} from "../../lib/preferredSetlist";
import Icon from "../../components/Icon";
import { Badge, EmptyState, IconButton, PageHeader } from "../../components/ui";
import { BarList, BentoCard, BentoGrid, CardLink, ColumnChart, Meter, SegmentedBar, Stat } from "../../components/bento";
import DateBlock from "../../components/setlists/DateBlock";
import { itemsDuration, serviceDate, serviceTime } from "../../components/setlists/grouping";
import { ChartEmpty, CreateMenu, DashboardBentoSkeleton, LinkRow, ReadinessList, type CreateItem } from "../../components/dashboard/parts";
import { categoryParts, loadInsights, type Insights } from "../../components/dashboard/insights";
import { countdown, readinessChecks } from "../../components/dashboard/readiness";

type WeekRow = { setlist: Setlist; count: number | null; seconds: number };
type EditRow = { id: string; kind: "song" | "sermon" | "setlist"; title: string; at: string; to: string };
type Library = { songs: number; sermons: number; categories: number };

const PREVIEW_ITEMS = 5;
const WEEK_DAYS = 14;

function startOfToday() {
  const at = new Date();
  at.setHours(0, 0, 0, 0);
  return at.getTime();
}

/** Preferred setlist first, else the soonest upcoming service, else the newest. */
function pickNext(rows: Setlist[]) {
  const preferred = readPreferredSetlistId();
  const fromPref = preferred ? rows.find((row) => row.id === preferred) : null;
  if (fromPref) return fromPref;
  const today = startOfToday();
  const upcoming = rows
    .filter((row) => row.service_at && new Date(row.service_at).getTime() >= today)
    .sort((a, b) => (a.service_at ?? "").localeCompare(b.service_at ?? ""));
  return upcoming[0] ?? rows[0] ?? null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, clockLocale } = usePrefs();
  const toast = useToast();
  const sync = useSyncStatus();
  const [now, setNow] = useState(() => Date.now());
  const [greeting, setGreeting] = useState("Media Team");
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [setlistTotal, setSetlistTotal] = useState(0);
  const [stats, setStats] = useState({
    songCount: 0,
    presentationCount: 0,
    setlistCount: 0,
  });
  const [recent, setRecent] = useState<Presentation[]>([]);
  const [week, setWeek] = useState<WeekRow[]>([]);
  const [edits, setEdits] = useState<EditRow[]>([]);
  const [library, setLibrary] = useState<Library | null>(null);
  const [categoryRows, setCategoryRows] = useState<Category[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [displays, setDisplays] = useState<OutputDisplay[]>([]);
  const [livePresentation, setLivePresentation] = useState<Presentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [extrasLoading, setExtrasLoading] = useState(true);
  const [error, setError] = useState("");
  const [setlistOpen, setSetlistOpen] = useState(false);
  const [setlistMode, setSetlistMode] = useState<"create" | "edit">("create");
  const [songOpen, setSongOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [churches, setChurches] = useState<ChurchName[]>([]);
  const [superadmin, setSuperadmin] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canEditLibrary, setCanEditLibrary] = useState(false);
  const loaded = useRef(false);

  /** Secondary panels: upcoming week, library counts, recent edits, output. */
  const loadExtras = async (rows: Setlist[], libraryAccess: boolean) => {
    const today = startOfToday();
    const horizon = today + WEEK_DAYS * 86_400_000;
    const upcoming = rows
      .filter((row) => {
        if (!row.service_at) return false;
        const at = new Date(row.service_at).getTime();
        return at >= today && at < horizon;
      })
      .sort((a, b) => (a.service_at ?? "").localeCompare(b.service_at ?? ""))
      .slice(0, 6);

    const safe = <T,>(promise: Promise<T>, fallback: T) => promise.catch(() => fallback);
    const emptyPage = { items: [], total: 0, offset: 0, limit: 0, hasMore: false };
    const [weekRows, songs, sermons, categories, outputs, live, charts] = await Promise.all([
      Promise.all(
        upcoming.map(async (row): Promise<WeekRow> => {
          const full = await safe(getSetlist(row.id), null);
          return {
            setlist: row,
            count: full?.items?.length ?? null,
            seconds: itemsDuration(full?.items),
          };
        }),
      ),
      libraryAccess ? safe(listSongs({ limit: 50 }), emptyPage) : Promise.resolve(emptyPage),
      libraryAccess ? safe(listSermons({ limit: 5 }), emptyPage) : Promise.resolve(emptyPage),
      libraryAccess ? safe(listCategories(), []) : Promise.resolve([]),
      safe(listOutputDisplays(), []),
      safe(getActivePresentation(), null),
      safe(loadInsights(rows, clockLocale), null),
    ]);

    setWeek(weekRows);
    setLibrary({
      songs: songs.total,
      sermons: sermons.total,
      categories: categories.length,
    });
    setCategoryRows(categories);
    if (charts) setInsights(charts);
    setDisplays(outputs);
    setLivePresentation(live);
    const edited: EditRow[] = [
      ...songs.items.map((row) => ({
        id: `song-${row.id}`,
        kind: "song" as const,
        title: row.title,
        at: row.updated_at,
        to: `/songs?song=${row.id}`,
      })),
      ...sermons.items.map((row) => ({
        id: `sermon-${row.id}`,
        kind: "sermon" as const,
        title: row.title,
        at: row.updated_at,
        to: `/sermon?sermon=${row.id}`,
      })),
      ...rows.map((row) => ({
        id: `setlist-${row.id}`,
        kind: "setlist" as const,
        title: row.name,
        at: row.updated_at,
        to: `/setlists?setlist=${row.id}`,
      })),
    ];
    setEdits(edited.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 5));
  };

  const load = async () => {
    const profile = await getSessionProfile();
    const admin = isSuperadmin(profile);
    const libraryAccess = isLibraryEditor(profile);
    setSuperadmin(admin);
    setCanManage(canManageSetlists(profile));
    setCanEditLibrary(libraryAccess);
    if (profile.user?.name) setGreeting(profile.user.name.split(" ")[0]);
    if (admin) {
      const names = await listChurchNames();
      setChurches(names);
      if (!readSetlistViewChurchId() && names[0]) {
        writeSetlistViewChurchId(names[0].id);
      }
    }
    const [listed, nextStats, presentations] = await Promise.all([
      listSetlists({ limit: 50 }),
      getDashboardStats(),
      listRecentPresentations(4),
    ]);
    setStats(nextStats);
    setRecent(presentations);
    setSetlistTotal(listed.total);
    const pick = pickNext(listed.items);
    if (pick) setSetlist(await getSetlist(pick.id));
    else setSetlist(null);
    return { rows: listed.items, libraryAccess };
  };

  const refresh = async () => {
    const { rows, libraryAccess } = await load();
    setExtrasLoading(true);
    try {
      await loadExtras(rows, libraryAccess);
    } finally {
      setExtrasLoading(false);
    }
  };

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void (async () => {
      let next: Awaited<ReturnType<typeof load>> | null = null;
      try {
        next = await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("dash.loadError"));
        toast.error(err instanceof Error ? err.message : t("dash.loadError"));
      } finally {
        setLoading(false);
        loaded.current = true;
      }
      try {
        if (next) await loadExtras(next.rows, next.libraryAccess);
      } finally {
        setExtrasLoading(false);
      }
    })();
  }, []);

  // The page stays mounted (KeepAlive): refresh quietly when the user comes back.
  useEffect(() => {
    if (location.pathname !== "/dashboard" || !loaded.current) return;
    void refresh().catch(() => undefined);
  }, [location.pathname]);

  const clock = useMemo(
    () =>
      new Date(now).toLocaleTimeString(clockLocale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: clockLocale !== "ja-JP",
      }),
    [now, clockLocale],
  );
  const today = useMemo(
    () =>
      new Date(now).toLocaleDateString(clockLocale, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    // Only the day matters; recompute when the minute rolls.
    [Math.floor(now / 60_000), clockLocale],
  );

  const items = setlist?.items ?? [];
  const totalSeconds = itemsDuration(items);
  const starts = countdown(setlist?.service_at, now);
  const checks = useMemo(
    () =>
      setlist
        ? readinessChecks(setlist, { t, pending: sync.pending, canEditLibrary, canManage })
        : [],
    [setlist, t, sync.pending, canEditLibrary, canManage],
  );
  const readyCount = checks.filter((check) => check.ok).length;

  const runBackup = () => void forceSync().catch(() => undefined);

  const openCreateSetlist = () => {
    setSetlistMode("create");
    setSetlistOpen(true);
  };

  const createItems: CreateItem[] = [
    ...(canEditLibrary
      ? [{ label: t("dash.newSong"), icon: "music_note", onSelect: () => setSongOpen(true) }]
      : []),
    ...(canManage
      ? [{ label: t("dash.newSetlist"), icon: "queue_music", onSelect: openCreateSetlist }]
      : []),
    ...(canEditLibrary
      ? [{ label: t("dash.newSermon"), icon: "edit_note", onSelect: () => navigate("/sermon") }]
      : []),
  ];

  if (loading) return <DashboardBentoSkeleton />;

  const hour = new Date(now).getHours();
  const greetingKey =
    hour < 12 ? "dash.greetMorning" : hour < 18 ? "dash.greetAfternoon" : "dash.greetEvening";
  const kindLabel = { song: t("dash.typeSong"), sermon: t("dash.typeSermon"), setlist: t("dash.typeSetlist") };
  const kindIcon = { song: "music_note", sermon: "menu_book", setlist: "queue_music" };
  const defaultDisplay = displays.find((row) => row.is_default) ?? displays[0] ?? null;
  const allReady = checks.length > 0 && readyCount === checks.length;
  const goLiveTo = setlist ? `/live?setlist=${setlist.id}` : "/setlists";
  const songTotal = library?.songs ?? stats.songCount;
  const services = insights?.servicesByWeek ?? [];
  const hasServices = services.some((week) => week.value > 0);
  const parts = categoryParts(categoryRows, songTotal, t("dash.uncategorized"));
  const chartsLoading = extrasLoading && !insights;
  const uncategorized =
    songTotal - categoryRows.reduce((sum, row) => sum + (row.song_count ?? 0), 0);

  const statSkeleton = (
    <div className="space-y-2.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-12" />
    </div>
  );

  const statTile = (key: string, body: ReactNode, label: string) => (
    <BentoCard key={key} span={3} aria-label={label} className="[&>div]:pt-5">
      {body}
    </BentoCard>
  );

  return (
    <section className="h-full flex flex-col min-h-0">
      <PageHeader
        title={t("dash.title")}
        meta={today}
        actions={
          <>
            <span
              className="hidden sm:inline text-[12px] text-on-surface-variant tabular-nums mr-1"
              aria-label={t("dash.currentTime")}
            >
              {clock}
            </span>
            <CreateMenu label={t("dash.create")} items={createItems} />
            {setlist ? null : (
              <Link to={goLiveTo} className="ui-btn ui-btn-primary">
                <Icon name="play_arrow" className="text-[16px]" />
                {t("dash.goLive")}
              </Link>
            )}
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div className="px-4 sm:px-6 py-6 max-w-[1440px]">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <div className="min-w-0">
              <p className="text-[20px] font-semibold text-on-surface tracking-[-0.015em]">
                {t(greetingKey, { name: greeting })}
              </p>
              {setlist ? (
                <p className="mt-0.5 text-[13px] text-on-surface-variant">
                  {checks.length
                    ? t("dash.readyCount", { done: readyCount, total: checks.length })
                    : null}
                  {" · "}
                  {setlist.name}
                </p>
              ) : null}
            </div>
          </div>

          {error ? <p className="mt-4 text-[13px] text-error">{error}</p> : null}

          <BentoGrid className="mt-6">
            {/* ── Hero: next service ─────────────────────────────────── */}
            <BentoCard
              span={8}
              rows={2}
              accent
              title={t("dash.nextService")}
              action={
                setlist ? (
                  <>
                    <Link
                      to={`/setlists?setlist=${setlist.id}`}
                      className="ui-icon-btn"
                      aria-label="Choose setlist"
                      title={t("setlists.choosePresentation")}
                    >
                      <Icon name="playlist_play" className="text-[16px]" />
                    </Link>
                    {canManage ? (
                      <IconButton
                        icon="edit"
                        label="Edit setlist"
                        onClick={() => {
                          setSetlistMode("edit");
                          setSetlistOpen(true);
                        }}
                      />
                    ) : null}
                  </>
                ) : null
              }
            >
              {setlist ? (
                <div className="@container flex flex-col flex-1 min-h-0 gap-6">
                  <div className="flex flex-col @lg:flex-row @lg:items-end justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-[28px] font-semibold tracking-[-0.02em] text-on-surface leading-9 truncate">
                        {setlist.name}
                      </h3>
                      <p className="mt-1 text-[13px] text-on-surface-variant truncate">
                        {[
                          setlist.service_type,
                          setlist.service_at
                            ? `${serviceDate(setlist.service_at, true)} · ${serviceTime(setlist.service_at)}`
                            : t("dash.unscheduled"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-2 flex items-center gap-4 text-[12px] text-on-surface-variant tabular-nums">
                        <span className="flex items-center gap-1.5">
                          <Icon name="list_alt" className="text-[13px]" />
                          {items.length === 1
                            ? t("dash.itemCount")
                            : t("dash.itemsCount", { n: items.length })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Icon name="schedule" className="text-[13px]" />
                          {formatDuration(totalSeconds || setlist.est_duration_seconds)}
                        </span>
                      </p>
                    </div>
                    {starts ? (
                      <div className="shrink-0 @lg:text-right">
                        <span className="block text-[12px] text-on-surface-variant">
                          {starts.started ? t("dash.now") : t("dash.startsInShort")}
                        </span>
                        <span
                          className="block mt-1 text-[44px] font-semibold tracking-[-0.03em] tabular-nums text-on-surface leading-none"
                          role="timer"
                        >
                          {starts.started ? t("dash.started") : starts.text}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 @xl:grid-cols-[minmax(0,1fr)_280px] gap-6 flex-1">
                    <div className="min-w-0">
                      {items.length === 0 ? (
                        <p className="text-[13px] text-on-surface-variant">{t("dash.emptySetlist")}</p>
                      ) : (
                        <ol aria-label={t("dash.nextService")} className="-mx-2">
                          {items.slice(0, PREVIEW_ITEMS).map((item, index) => (
                            <li key={item.id} className="flex items-center gap-3 h-9 px-2 min-w-0 rounded-md">
                              <span className="w-5 text-[12px] text-outline tabular-nums shrink-0">
                                {index + 1}
                              </span>
                              <span className="text-[13px] text-on-surface truncate">{item.title}</span>
                              <span className="text-[12px] text-on-surface-variant truncate flex-1 min-w-0">
                                {itemMeta(item)}
                              </span>
                              <span className="text-[12px] text-on-surface-variant tabular-nums shrink-0">
                                {formatDuration(item.duration_seconds)}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                      {items.length > PREVIEW_ITEMS ? (
                        <Link
                          to={`/setlists?setlist=${setlist.id}`}
                          className="inline-block mt-1 pl-8 text-[12px] text-on-surface-variant hover:text-on-surface"
                        >
                          {t("dash.moreItems", { n: items.length - PREVIEW_ITEMS })}
                        </Link>
                      ) : null}
                    </div>
                    <div className="min-w-0 @xl:border-l @xl:pl-6 border-white/5">
                      <p className="flex items-center justify-between text-[12px] font-medium text-on-surface-variant">
                        <span>{t("dash.readiness")}</span>
                        <span className="tabular-nums">
                          {readyCount}/{checks.length}
                        </span>
                      </p>
                      <div className="mt-2.5 mb-3">
                        <Meter
                          value={readyCount}
                          max={checks.length}
                          label={t("dash.readyCount", { done: readyCount, total: checks.length })}
                          tone={allReady ? "good" : "warning"}
                        />
                      </div>
                      <ReadinessList checks={checks} onSync={runBackup} syncing={sync.syncing} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={goLiveTo}
                      onClick={() => writePreferredSetlistId(setlist.id)}
                      className="ui-btn ui-btn-primary"
                    >
                      <Icon name="play_arrow" className="text-[16px]" />
                      {t("dash.goLive")}
                    </Link>
                    <Link to={`/setlists?setlist=${setlist.id}`} className="ui-btn ui-btn-ghost">
                      {t("dash.openSetlist")}
                    </Link>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon="queue_music"
                  title={t("dash.createFirst")}
                  body={t("dash.buildHint")}
                  action={
                    canManage ? (
                      <button type="button" className="ui-btn ui-btn-secondary" onClick={openCreateSetlist}>
                        <Icon name="add" className="text-[16px]" />
                        {t("dash.newSetlist")}
                      </button>
                    ) : null
                  }
                />
              )}
            </BentoCard>

            {/* ── Coming up ─────────────────────────────────────────── */}
            <BentoCard
              span={4}
              rows={2}
              flush
              title={t("dash.thisWeek")}
              action={<CardLink to="/setlists">{t("dash.setlists")}</CardLink>}
            >
              {extrasLoading && week.length === 0 ? (
                <RowsSkeleton rows={4} className="px-5 py-2" />
              ) : week.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-on-surface-variant">{t("dash.thisWeekEmpty")}</p>
              ) : (
                <ul role="list" className="pb-2">
                  {week.map((row) => (
                    <LinkRow
                      key={row.setlist.id}
                      to={`/setlists?setlist=${row.setlist.id}`}
                      leading={<DateBlock value={row.setlist.service_at} highlight={row.setlist.id === setlist?.id} />}
                      title={
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{row.setlist.name}</span>
                          {row.setlist.id === setlist?.id ? <Badge tone="accent">{t("dash.next")}</Badge> : null}
                        </span>
                      }
                      subtitle={[
                        serviceTime(row.setlist.service_at),
                        row.count == null
                          ? null
                          : row.count === 1
                            ? t("dash.itemCount")
                            : t("dash.itemsCount", { n: row.count }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      meta={<span>{row.seconds ? formatDuration(row.seconds) : "—"}</span>}
                    />
                  ))}
                </ul>
              )}
            </BentoCard>

            {/* ── Stat tiles ───────────────────────────────────────── */}
            {canEditLibrary ? (
              <>
                {statTile(
                  "songs",
                  <Stat
                    label={t("dash.librarySongs")}
                    value={songTotal}
                    to="/songs"
                    trend={insights?.songTrend}
                    delta={
                      insights
                        ? { value: insights.songsAddedThisWeek, period: t("dash.lastWeek") }
                        : undefined
                    }
                  />,
                  t("dash.librarySongs"),
                )}
                {statTile(
                  "sermons",
                  library ? <Stat label={t("dash.sermons")} value={library.sermons} to="/sermon" /> : statSkeleton,
                  t("dash.sermons"),
                )}
              </>
            ) : (
              statTile("songs", <Stat label={t("dash.librarySongs")} value={stats.songCount} />, t("dash.librarySongs"))
            )}
            {statTile(
              "setlists",
              <Stat
                label={t("dash.setlists")}
                value={setlistTotal}
                to="/setlists"
                hint={week.length ? `${week.length} ${t("dash.thisWeek").toLowerCase()}` : undefined}
              />,
              t("dash.setlists"),
            )}
            {canEditLibrary ? (
              statTile(
                "categories",
                library ? (
                  <Stat
                    label={t("dash.categories")}
                    value={library.categories}
                    to="/categories"
                    hint={uncategorized > 0 ? `${uncategorized} ${t("dash.uncategorized").toLowerCase()}` : undefined}
                  />
                ) : (
                  statSkeleton
                ),
                t("dash.categories"),
              )
            ) : (
              <>
                {statTile(
                  "week",
                  extrasLoading && week.length === 0 ? statSkeleton : <Stat label={t("dash.thisWeek")} value={week.length} />,
                  t("dash.thisWeek"),
                )}
                {statTile(
                  "presentations",
                  <Stat label={t("dash.presentations")} value={stats.presentationCount} to="/live" />,
                  t("dash.presentations"),
                )}
              </>
            )}

            {/* ── Charts ───────────────────────────────────────────── */}
            <BentoCard span={6} title={t("dash.servicesPerWeek")} subtitle={t("dash.servicesRange")}>
              {chartsLoading ? (
                <Skeleton className="h-[180px] w-full rounded-lg" />
              ) : hasServices ? (
                <ColumnChart
                  data={services}
                  height={180}
                  label={t("dash.servicesPerWeek")}
                  format={(value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))}
                />
              ) : (
                <ChartEmpty icon="event" text={t("dash.servicesEmpty")} />
              )}
            </BentoCard>

            <BentoCard span={6} title={t("dash.mostScheduled")} subtitle={t("dash.timesScheduled")}>
              {chartsLoading ? (
                <RowsSkeleton rows={4} />
              ) : insights?.scheduled.length ? (
                <BarList
                  label={t("dash.mostScheduled")}
                  data={insights.scheduled.map((row) => ({
                    label: row.title,
                    value: row.count,
                    to: canEditLibrary ? `/songs?song=${row.id}` : undefined,
                  }))}
                  format={(value) => `${value}×`}
                />
              ) : (
                <ChartEmpty icon="music_note" text={t("dash.mostScheduledEmpty")} />
              )}
            </BentoCard>

            {/* ── Activity ─────────────────────────────────────────── */}
            <BentoCard
              span={8}
              rows={canEditLibrary ? 2 : 1}
              flush
              title={t("dash.activity")}
              action={
                <Link to="/live" className="text-[12px] font-medium text-primary hover:underline">
                  {t("dash.openLive")}
                </Link>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 flex-1 border-t border-white/5">
                <section className="min-w-0 pb-2">
                  <h3 className="flex items-center gap-2 px-5 h-9 text-[12px] font-medium text-on-surface-variant">
                    <span>{t("dash.recent")}</span>
                    <span className="tabular-nums text-outline">{stats.presentationCount}</span>
                  </h3>
                  <ul role="list">
                    {recent.map((item) => (
                      <LinkRow
                        key={item.id}
                        to={`/live?setlist=${item.setlist_id}`}
                        leading={<Icon name="live_tv" className="text-[15px] text-on-surface-variant" />}
                        title={item.name ?? t("dash.liveSession")}
                        subtitle={formatRelative(item.started_at || item.created_at)}
                        meta={<Badge tone={item.status === "live" ? "accent" : "neutral"}>{item.status}</Badge>}
                      />
                    ))}
                    {recent.length === 0 ? (
                      <li className="px-5 py-2 text-[13px] text-on-surface-variant">{t("dash.noPresentations")}</li>
                    ) : null}
                  </ul>
                </section>
                <section className="min-w-0 pb-2 border-t md:border-t-0 md:border-l border-white/5">
                  <h3 className="flex items-center px-5 h-9 text-[12px] font-medium text-on-surface-variant">
                    {t("dash.recentEdits")}
                  </h3>
                  <ul role="list">
                    {extrasLoading && edits.length === 0 ? (
                      <li>
                        <RowsSkeleton rows={3} className="px-5 py-2" />
                      </li>
                    ) : null}
                    {edits.map((row) => (
                      <LinkRow
                        key={row.id}
                        to={row.to}
                        leading={<Icon name={kindIcon[row.kind]} className="text-[15px] text-on-surface-variant" />}
                        title={row.title}
                        subtitle={`${kindLabel[row.kind]} · ${formatRelative(row.at)}`}
                      />
                    ))}
                    {!extrasLoading && edits.length === 0 ? (
                      <li className="px-5 py-2 text-[13px] text-on-surface-variant">{t("dash.noEdits")}</li>
                    ) : null}
                  </ul>
                </section>
              </div>
            </BentoCard>

            {/* ── Library by category ──────────────────────────────── */}
            {canEditLibrary ? (
              <BentoCard
                span={4}
                title={t("dash.byCategory")}
                subtitle={t("dash.byCategoryHint", { n: songTotal })}
                action={<CardLink to="/categories">{t("dash.categories")}</CardLink>}
              >
                {extrasLoading && !library ? (
                  <Skeleton className="h-2 w-full rounded-full" />
                ) : parts.length ? (
                  <SegmentedBar parts={parts} label={t("dash.byCategory")} />
                ) : (
                  <ChartEmpty icon="category" text={t("dash.byCategoryEmpty")} />
                )}
              </BentoCard>
            ) : null}

            {/* ── System ───────────────────────────────────────────── */}
            <BentoCard span={4} title={t("dash.system")}>
              <dl className="-my-1 text-[13px]">
                <div className="flex items-center gap-3 py-2">
                  <Icon
                    name={syncIcon(sync)}
                    className={`text-[15px] shrink-0 ${sync.error ? "text-error" : "text-on-surface-variant"} ${
                      sync.syncing ? "animate-spin" : ""
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <dt className="sr-only">{t("dash.backup")}</dt>
                    <dd className="text-on-surface truncate">{syncLabel(sync)}</dd>
                    <dd className="text-[12px] text-on-surface-variant truncate" title={sync.error ?? undefined}>
                      {sync.error
                        ? sync.error
                        : sync.online
                          ? t("sync.lastBackup", {
                              when: formatRelative(sync.lastSyncAt),
                              frequency: sync.frequency,
                            })
                          : t("sync.offlineStay")}
                    </dd>
                  </div>
                  <IconButton
                    icon="refresh"
                    label={t("dash.backupNow")}
                    disabled={sync.syncing}
                    onClick={runBackup}
                    className="shrink-0"
                  />
                </div>
                <div className="flex items-center gap-3 py-2 border-t border-white/5">
                  <Icon name="cloud_upload" className="text-[15px] shrink-0 text-on-surface-variant" />
                  <dt className="flex-1 text-on-surface-variant">{t("dash.pending")}</dt>
                  <dd className={`tabular-nums ${sync.pending ? "text-tertiary" : "text-on-surface"}`}>
                    {sync.pending}
                  </dd>
                </div>
                <div className="flex items-center gap-3 py-2 border-t border-white/5">
                  <Icon name="desktop_windows" className="text-[15px] shrink-0 text-on-surface-variant" />
                  <dt className="flex-1 min-w-0 text-on-surface-variant truncate">
                    {defaultDisplay?.name ?? t("dash.output")}
                  </dt>
                  <dd className="shrink-0">
                    {extrasLoading && !defaultDisplay ? null : livePresentation ? (
                      <Link to={`/live?setlist=${livePresentation.setlist_id}`}>
                        <Badge tone="accent">{t("dash.outputLive")}</Badge>
                      </Link>
                    ) : defaultDisplay ? (
                      <Badge>{t("live.standby")}</Badge>
                    ) : (
                      <span className="text-[12px] text-on-surface-variant">{t("dash.noDisplays")}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </BentoCard>
          </BentoGrid>
        </div>
      </div>

      <SetlistFormModal
        open={setlistOpen}
        mode={setlistMode}
        churches={superadmin ? churches : undefined}
        initialValues={
          setlistMode === "edit" && setlist
            ? {
                name: setlist.name,
                date: localDateInput(setlist.service_at),
                duration: setlist.est_duration_seconds
                  ? formatDuration(setlist.est_duration_seconds)
                  : "",
                serviceType: setlist.service_type ?? "Sunday Morning Service",
                churchIds: setlist.share_church_ids?.length
                  ? setlist.share_church_ids
                  : [setlist.church_id],
              }
            : undefined
        }
        onClose={() => setSetlistOpen(false)}
        onSubmit={(values) => {
          void (async () => {
            setSaving(true);
            setError("");
            try {
              const payload = {
                name: values.name.trim(),
                service_type: values.serviceType,
                service_at: values.date ? `${values.date}T09:00:00` : null,
                est_duration_seconds: parseDurationSeconds(values.duration),
                share_church_ids: values.churchIds,
              };
              const next =
                setlistMode === "edit" && setlist
                  ? await updateSetlist(setlist.id, payload)
                  : await createSetlist(payload);
              setSetlist(await getSetlist(next.id).catch(() => next));
              setSetlistOpen(false);
              toast.success(
                setlistMode === "edit" ? "Setlist updated." : "Setlist created.",
              );
              void (async () => {
                const listed = await listSetlists({ limit: 50 });
                setSetlistTotal(listed.total);
                await loadExtras(listed.items, canEditLibrary);
              })().catch(() => undefined);
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Could not save setlist.";
              setError(message);
              toast.error(message);
            } finally {
              setSaving(false);
            }
          })();
        }}
      />

      <SongFormModal
        open={songOpen}
        onClose={() => setSongOpen(false)}
        onSubmit={(values: SongFormValues) => {
          void (async () => {
            setSaving(true);
            setError("");
            try {
              await createSong({
                title: values.title,
                artist: values.artist,
                musical_key: values.key,
                bpm: Number(values.bpm) || null,
                time_signature: values.signature,
                category_id: values.categoryId || null,
                youtube_url: values.youtubeUrl,
                duration_seconds: parseDurationSeconds(values.duration),
                lyrics: textToLyricSections(values.lyrics),
              });
              setSongOpen(false);
              setStats((prev) => ({ ...prev, songCount: prev.songCount + 1 }));
              setLibrary((prev) => (prev ? { ...prev, songs: prev.songs + 1 } : prev));
              toast.success("Song added.");
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Could not save song.";
              setError(message);
              toast.error(message);
            } finally {
              setSaving(false);
            }
          })();
        }}
      />
      {saving ? (
        <div className="fixed bottom-6 right-6 modal-surface rounded-lg px-4 py-2 text-[13px] text-on-surface-variant z-50">
          {t("common.saving")}
        </div>
      ) : null}
    </section>
  );
}
