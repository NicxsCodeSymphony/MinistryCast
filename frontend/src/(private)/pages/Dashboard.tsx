import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SetlistFormModal from "../../components/modals/SetlistFormModal";
import SongFormModal, {
  type SongFormValues,
} from "../../components/modals/SongFormModal";
import { PageSkeleton } from "../../components/Skeleton";
import {
  createSetlist,
  createSong,
  getDashboardStats,
  getSetlist,
  itemMeta,
  listChurchNames,
  listRecentPresentations,
  listSetlists,
  readSetlistViewChurchId,
  updateSetlist,
  writeSetlistViewChurchId,
  type ChurchName,
} from "../../lib/api";
import { getSessionProfile, isSuperadmin } from "../../lib/auth";
import { formatDuration, formatRelative, parseDurationSeconds, textToLyricSections } from "../../lib/helpers";
import { forceSync } from "../../lib/offline/sync";
import { syncIcon, syncLabel } from "../../lib/offline/status";
import { useSyncStatus } from "../../lib/offline/useSyncStatus";
import { usePrefs } from "../../lib/PrefsContext";
import { useToast } from "../../lib/ToastContext";
import type { Presentation, Setlist } from "../../lib/types";

const toneBox: Record<string, string> = {
  primary:
    "bg-primary/20 text-primary group-hover:bg-primary group-hover:text-on-primary",
  secondary:
    "bg-secondary/20 text-secondary group-hover:bg-secondary group-hover:text-on-secondary",
  muted: "bg-surface-variant/20 text-on-surface-variant",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { t, clockLocale } = usePrefs();
  const toast = useToast();
  const sync = useSyncStatus();
  const [clock, setClock] = useState("");
  const [greeting, setGreeting] = useState("Media Team");
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [stats, setStats] = useState({
    songCount: 0,
    presentationCount: 0,
    setlistCount: 0,
  });
  const [recent, setRecent] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setlistOpen, setSetlistOpen] = useState(false);
  const [setlistMode, setSetlistMode] = useState<"create" | "edit">("create");
  const [songOpen, setSongOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [churches, setChurches] = useState<ChurchName[]>([]);
  const [superadmin, setSuperadmin] = useState(false);

  const load = async () => {
    const profile = await getSessionProfile();
    const admin = isSuperadmin(profile);
    setSuperadmin(admin);
    if (profile.user?.name) setGreeting(profile.user.name.split(" ")[0]);
    if (admin) {
      const names = await listChurchNames();
      setChurches(names);
      if (!readSetlistViewChurchId() && names[0]) {
        writeSetlistViewChurchId(names[0].id);
      }
    }
    const [listed, nextStats, presentations] = await Promise.all([
      listSetlists({ limit: 1 }),
      getDashboardStats(),
      listRecentPresentations(3),
    ]);
    setStats(nextStats);
    setRecent(presentations);
    if (listed.items[0]) setSetlist(await getSetlist(listed.items[0].id));
    else setSetlist(null);
  };

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString(clockLocale, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: clockLocale !== "ja-JP",
        }),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [clockLocale]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("dash.loadError"));
        toast.error(err instanceof Error ? err.message : t("dash.loadError"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const items = setlist?.items ?? [];
  const startsIn = useMemo(() => {
    if (!setlist?.service_at) return null;
    const diff = new Date(setlist.service_at).getTime() - Date.now();
    if (diff <= 0) return t("dash.now");
    const mins = Math.floor(diff / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}:00`;
  }, [setlist?.service_at, t]);

  if (loading) return <PageSkeleton />;

  return (
    <section className="h-full overflow-y-auto custom-scrollbar relative px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <header className="mb-8 sm:mb-10 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface mb-1">
            {t("dash.title")}
          </h2>
          <p className="text-on-surface-variant">
            {t(
              new Date().getHours() < 12
                ? "dash.goodMorning"
                : "dash.goodAfternoon",
              { name: greeting },
            )}
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end">
          <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold">
            {t("dash.currentTime")}
          </span>
          <span className="text-2xl font-mono font-semibold text-on-surface">
            {clock || "--:--:--"}
          </span>
        </div>
      </header>

      {error ? <p className="mb-6 text-sm text-[#ffb4ab]">{error}</p> : null}

      <div className="grid grid-cols-12 gap-4 sm:gap-6">
        <div className="col-span-12 lg:col-span-8 glass-card rounded-xl p-6 sm:p-8 flex flex-col justify-between min-h-[400px]">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-primary text-[12px] font-semibold tracking-[0.05em] uppercase mb-4">
                <span className="w-2 h-2 bg-primary rounded-full live-pulse" />
                {setlist ? t("dash.activeSetlist") : t("dash.noSetlist")}
              </div>
              <h3 className="text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-[-0.02em] text-on-surface mb-2 leading-tight">
                {setlist?.name ?? t("dash.createFirst")}
              </h3>
              <p className="text-on-surface-variant text-lg">
                {setlist?.service_type ?? t("dash.buildHint")}
              </p>
            </div>
            {startsIn ? (
              <div className="bg-surface-container-high px-6 py-4 rounded-2xl text-center border border-white/5 shrink-0 self-start">
                <span className="block text-on-surface-variant text-[10px] uppercase font-bold tracking-tighter mb-1">
                  {t("dash.startsIn")}
                </span>
                <span className="text-3xl font-bold font-mono text-secondary">
                  {startsIn}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-8 space-y-4">
            {items.slice(0, 3).map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5 hover:border-primary/30 transition-all group"
              >
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold transition-all ${
                    toneBox[
                      item.item_type === "sermon"
                        ? "secondary"
                        : item.item_type === "scripture" || item.item_type === "roster"
                          ? "muted"
                          : "primary"
                    ]
                  }`}
                >
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-[18px] text-on-surface truncate">
                    {item.title}
                  </h4>
                  <p className="text-on-surface-variant text-sm truncate">
                    {itemMeta(item)}
                  </p>
                </div>
                <span className="text-xs font-mono text-on-surface-variant">
                  {formatDuration(item.duration_seconds)}
                </span>
              </div>
            ))}
            {items.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                {t("dash.emptySetlist")}
              </p>
            ) : null}
          </div>

          <div className="mt-8 flex gap-4">
            <Link
              to={setlist ? `/live?setlist=${setlist.id}` : "/setlists"}
              className="flex-1 bg-primary text-on-primary py-4 rounded-xl font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 primary-glow"
            >
              <span className="material-symbols-outlined filled">play_circle</span>
              {t("dash.goLive")}
            </Link>
            <button
              type="button"
              disabled={!setlist}
              onClick={() => {
                setSetlistMode("edit");
                setSetlistOpen(true);
              }}
              className="px-6 border border-white/10 rounded-xl hover:bg-white/5 transition-all disabled:opacity-40"
              aria-label="Edit setlist"
            >
              <span className="material-symbols-outlined">edit</span>
            </button>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-4 sm:space-y-6">
          <div className="glass-card rounded-xl p-6">
            <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant mb-4">
              {t("dash.quickActions")}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSongOpen(true)}
                className="flex flex-col items-center justify-center gap-2 bg-surface-container-high hover:bg-white/10 p-4 rounded-xl border border-white/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">add_box</span>
                </div>
                <span className="text-xs font-semibold">{t("dash.addSong")}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSetlistMode("create");
                  setSetlistOpen(true);
                }}
                className="flex flex-col items-center justify-center gap-2 bg-surface-container-high hover:bg-white/10 p-4 rounded-xl border border-white/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">queue_music</span>
                </div>
                <span className="text-xs font-semibold">{t("dash.createSetlist")}</span>
              </button>
              <Link
                to="/sermon"
                className="col-span-2 flex items-center gap-3 bg-surface-container-high hover:bg-white/10 p-4 rounded-xl border border-white/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-tertiary/10 flex items-center justify-center text-tertiary group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">edit_note</span>
                </div>
                <div className="text-left">
                  <span className="text-xs font-semibold block">{t("dash.addSermon")}</span>
                  <span className="text-[10px] text-on-surface-variant">
                    {t("dash.transcription")}
                  </span>
                </div>
              </Link>
            </div>
          </div>

          <button
            type="button"
            disabled={sync.syncing}
            onClick={() => void forceSync().catch(() => undefined)}
            className="glass-card rounded-xl p-6 flex items-center gap-4 text-left w-full hover:bg-white/5 transition-all disabled:opacity-60"
          >
            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-400 shrink-0">
              <span
                className={`material-symbols-outlined filled ${
                  sync.syncing ? "animate-spin" : ""
                }`}
              >
                {syncIcon(sync)}
              </span>
            </div>
            <div>
              <h4 className="font-bold text-sm">{syncLabel(sync)}</h4>
              <p className="text-on-surface-variant text-xs">
                {sync.error
                  ? sync.error
                  : sync.online
                    ? `Last backup ${formatRelative(sync.lastSyncAt)} · ${sync.frequency}`
                    : "Offline — new data stays here until backup"}
              </p>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card rounded-xl p-6 text-center">
              <span className="block text-primary text-3xl font-bold mb-1">
                {stats.songCount}
              </span>
              <span className="text-on-surface-variant text-[10px] uppercase font-bold tracking-widest">
                {t("dash.librarySongs")}
              </span>
            </div>
            <div className="glass-card rounded-xl p-6 text-center">
              <span className="block text-secondary text-3xl font-bold mb-1">
                {stats.presentationCount}
              </span>
              <span className="text-on-surface-variant text-[10px] uppercase font-bold tracking-widest">
                {t("dash.presentations")}
              </span>
            </div>
          </div>
        </div>

        <div className="col-span-12 glass-card rounded-xl p-6">
          <div className="flex justify-between items-center mb-6 gap-3">
            <h4 className="text-2xl font-semibold text-on-surface">
              {t("dash.recent")}
            </h4>
            <Link
              to="/live"
              className="text-primary text-sm font-semibold hover:underline shrink-0"
            >
              {t("dash.openLive")}
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recent.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/live?setlist=${item.setlist_id}`)}
                className="bg-surface-container-low p-4 rounded-xl border border-white/5 hover:border-white/20 transition-all text-left flex gap-4 items-center"
              >
                <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-on-surface-variant shrink-0">
                  <span className="material-symbols-outlined">event</span>
                </div>
                <div className="min-w-0">
                  <h5 className="font-bold text-sm truncate">
                    {item.name ?? t("dash.liveSession")}
                  </h5>
                  <p className="text-on-surface-variant text-xs">
                    {formatRelative(item.started_at || item.created_at)} • {item.status}
                  </p>
                </div>
              </button>
            ))}
            {recent.length === 0 ? (
              <p className="text-sm text-on-surface-variant col-span-3">
                {t("dash.noPresentations")}
              </p>
            ) : null}
          </div>
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
                date: setlist.service_at?.slice(0, 10) ?? "",
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
              setSetlist(next);
              setSetlistOpen(false);
              toast.success(
                setlistMode === "edit" ? "Setlist updated." : "Setlist created.",
              );
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
        <div className="fixed bottom-6 right-6 glass-card px-4 py-2 text-sm text-on-surface-variant z-50">
          {t("common.saving")}
        </div>
      ) : null}
    </section>
  );
}
