import { useEffect, useRef, useState } from "react";
import { PageSkeleton } from "../../components/Skeleton";
import StageBackgroundPicker from "../../components/StageBackgroundPicker";
import TextSizePicker from "../../components/TextSizePicker";
import {
  getChurchSettings,
  listOutputDisplays,
  patchChurchSettings,
  saveChurchSettings,
} from "../../lib/api";
import { getSessionProfile } from "../../lib/auth";
import { formatRelative } from "../../lib/helpers";
import { INTERFACE_LANGUAGES, normalizeLang, type Lang } from "../../lib/i18n";
import { estimateStorage, forceSync } from "../../lib/offline/sync";
import { syncIcon, syncLabel } from "../../lib/offline/status";
import { useSyncStatus } from "../../lib/offline/useSyncStatus";
import { usePrefs, type ThemeName } from "../../lib/PrefsContext";
import { useToast } from "../../lib/ToastContext";
import { useUnsavedDraft } from "../../lib/useUnsavedDraft";
import { asStageFont, DEFAULT_STAGE_FONT, STAGE_FONTS } from "../../lib/stageFonts";
import {
  asStageBackground,
  DEFAULT_STAGE_BACKGROUND,
  type StageBackgroundId,
} from "../../lib/stageBackgrounds";
import type { ChurchSettings, OutputDisplay } from "../../lib/types";

function formatBytes(bytes: number) {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 0.1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function settingsDraftKey(input: {
  font: string;
  lyricSize: string;
  transition: string;
  backup: string;
  stageBackground: string;
}) {
  return JSON.stringify(input);
}

export default function Settings() {
  const sync = useSyncStatus();
  const prefs = usePrefs();
  const toast = useToast();
  const { t, version } = prefs;
  const [theme, setTheme] = useState<ThemeName>(prefs.theme);
  const [language, setLanguage] = useState<Lang>(prefs.language);
  const [font, setFont] = useState(DEFAULT_STAGE_FONT);
  const [lyricSize, setLyricSize] = useState("48");
  const [stageBackground, setStageBackground] = useState<StageBackgroundId>(
    DEFAULT_STAGE_BACKGROUND,
  );
  const [transition, setTransition] = useState("dissolve");
  const [backup, setBackup] = useState("hourly");
  const [displayId, setDisplayId] = useState("");
  const [displays, setDisplays] = useState<OutputDisplay[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [baseline, setBaseline] = useState<string | null>(null);
  const persistSave = useRef<() => Promise<boolean>>(async () => false);
  const storagePct =
    storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0;
  const storageLabel =
    storageQuota > 0
      ? `${formatBytes(storageUsed)} / ${formatBytes(storageQuota)}`
      : t("settings.localCache");

  useEffect(() => {
    void (async () => {
      try {
        const [profile, settings, outputs, storage] = await Promise.all([
          getSessionProfile(),
          getChurchSettings(),
          listOutputDisplays(),
          estimateStorage(),
        ]);
        setEmail(profile.user?.email ?? "");
        applySettings(settings);
        setDisplays(outputs);
        setDisplayId(outputs.find((row) => row.is_default)?.id ?? outputs[0]?.id ?? "");
        if (storage?.quota) {
          setStorageUsed(storage.usage);
          setStorageQuota(storage.quota);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("settings.loadError"));
        toast.error(err instanceof Error ? err.message : t("settings.loadError"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (window.location.hash === "#about") {
      document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading]);

  const applySettings = (settings: ChurchSettings | null) => {
    if (!settings) return;
    const nextTheme = settings.theme === "light" ? "light" : "dark";
    const nextLang = normalizeLang(settings.interface_language);
    setTheme(nextTheme);
    setLanguage(nextLang);
    prefs.setTheme(nextTheme);
    prefs.setLanguage(nextLang);
    setFont(asStageFont(settings.default_font));
    setLyricSize(settings.lyrics_text_size || "48");
    setStageBackground(asStageBackground(settings.stage_background));
    setTransition(settings.default_transition || "dissolve");
    setBackup(settings.backup_frequency || "hourly");
    setBaseline(
      settingsDraftKey({
        font: asStageFont(settings.default_font),
        lyricSize: settings.lyrics_text_size || "48",
        transition: settings.default_transition || "dissolve",
        backup: settings.backup_frequency || "hourly",
        stageBackground: asStageBackground(settings.stage_background),
      }),
    );
  };

  const changeTheme = (next: ThemeName) => {
    setTheme(next);
    prefs.setTheme(next);
    void patchChurchSettings({ theme: next }).catch(() => undefined);
  };

  const changeLanguage = (next: Lang) => {
    setLanguage(next);
    prefs.setLanguage(next);
    void patchChurchSettings({ interface_language: next }).catch(() => undefined);
  };

  const backupNow = async () => {
    setBackingUp(true);
    setError("");
    setMessage("");
    try {
      await forceSync();
      setMessage(t("settings.backupComplete"));
      toast.success(t("settings.backupComplete"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("settings.backupError");
      setError(message);
      toast.error(message);
    } finally {
      setBackingUp(false);
    }
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveChurchSettings({
        interface_language: language,
        theme,
        default_font: font,
        lyrics_text_size: lyricSize,
        default_transition: transition,
        transition_ms: transition === "cut" ? 0 : transition === "wipe" ? 600 : 400,
        backup_frequency: backup,
        stage_background: stageBackground,
      });
      applySettings(saved);
      setMessage(t("settings.saved"));
      toast.success(t("settings.saved"));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : t("settings.saveError");
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  persistSave.current = save;
  const dirty =
    !loading &&
    baseline !== null &&
    settingsDraftKey({ font, lyricSize, transition, backup, stageBackground }) !== baseline;
  const draft = useUnsavedDraft(dirty, {
    enabled: !loading,
    title: "Unsaved settings",
    description:
      "Your settings draft is not saved. Save it before you leave, or you’ll lose these changes.",
    onSave: () => persistSave.current(),
  });

  if (loading) return <PageSkeleton />;

  return (
    <section className="h-full overflow-y-auto custom-scrollbar bg-surface-container-lowest">
      <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
        {error ? <p className="text-sm text-[#ffb4ab]">{error}</p> : null}
        {message ? <p className="text-sm text-primary">{message}</p> : null}

        <div className="grid grid-cols-12 gap-6">
          <section className="col-span-12 md:col-span-8 glass-panel rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-primary">tune</span>
              <h2 className="text-2xl font-semibold text-on-surface">
                {t("settings.general")}
              </h2>
            </div>
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-4 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-on-surface">{t("settings.language")}</p>
                  <p className="text-xs text-on-surface-variant">
                    {t("settings.languageHint")}
                  </p>
                </div>
                <select
                  value={language}
                  onChange={(event) =>
                    changeLanguage(normalizeLang(event.target.value))
                  }
                  className="bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  {INTERFACE_LANGUAGES.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-4 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-on-surface">{t("settings.appearance")}</p>
                  <p className="text-xs text-on-surface-variant">
                    {t("settings.appearanceHint")}
                  </p>
                </div>
                <div className="flex p-1 bg-surface-container-high rounded-full border border-white/5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => changeTheme("dark")}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                      theme === "dark"
                        ? "bg-primary text-on-primary shadow-lg"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {t("settings.dark")}
                  </button>
                  <button
                    type="button"
                    onClick={() => changeTheme("light")}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                      theme === "light"
                        ? "bg-primary text-on-primary shadow-lg"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {t("settings.light")}
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-white/5 border border-white/5">
                <div className="flex justify-between items-center gap-4 mb-3">
                  <div>
                    <p className="text-on-surface">{t("settings.offline")}</p>
                    <p className="text-xs text-on-surface-variant">
                      {t("settings.offlineHint")}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-primary shrink-0">
                    {storageLabel}
                  </span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full glow-active"
                    style={{ width: `${storagePct}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="col-span-12 md:col-span-4 glass-panel rounded-xl p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-secondary">
                cloud_sync
              </span>
              <h2 className="text-2xl font-semibold text-on-surface">
                {t("settings.account")}
              </h2>
            </div>
            <div className="flex-1 space-y-6">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/5 border border-secondary/20">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0">
                  <span
                    className={`material-symbols-outlined filled text-secondary text-[22px] ${
                      sync.syncing ? "animate-spin" : ""
                    }`}
                  >
                    {syncIcon(sync)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-secondary">{syncLabel(sync)}</p>
                  <p className="text-sm text-on-surface truncate">{email || "—"}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                    {t("settings.backupFreq")}
                  </label>
                  <select
                    value={backup}
                    onChange={(event) => setBackup(event.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="15m">{t("settings.every15")}</option>
                    <option value="hourly">{t("settings.hourly")}</option>
                    <option value="daily">{t("settings.daily")}</option>
                  </select>
                  <p className="mt-2 text-xs text-on-surface-variant">
                    {t("settings.backupHint", {
                      when: formatRelative(sync.lastSyncAt),
                      pending: sync.pending
                        ? t("settings.pending", { n: sync.pending })
                        : "",
                    })}
                  </p>
                  {sync.error ? (
                    <p className="mt-2 text-xs text-[#ffb4ab]">{sync.error}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={backingUp || sync.syncing}
                  onClick={() => void backupNow()}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-on-surface text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
                >
                  {backingUp || sync.syncing
                    ? t("settings.backingUp")
                    : t("settings.backupNow")}
                </button>
              </div>
            </div>
          </section>

          <section className="col-span-12 glass-panel rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-tertiary">
                desktop_windows
              </span>
              <h2 className="text-2xl font-semibold text-on-surface">
                {t("settings.presentation")}
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-on-surface-variant block uppercase tracking-widest">
                  {t("settings.lyricsFont")}
                </label>
                <select
                  value={font}
                  onChange={(event) => setFont(event.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  {STAGE_FONTS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.id === DEFAULT_STAGE_FONT
                        ? ` ${t("settings.fontDefault")}`
                        : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-on-surface-variant">
                  {t("settings.lyricsFontHint")}
                </p>
                <TextSizePicker value={lyricSize} onChange={setLyricSize} />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-on-surface-variant block uppercase tracking-widest">
                  {t("settings.transition")}
                </label>
                <select
                  value={transition}
                  onChange={(event) => setTransition(event.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  <option value="dissolve">{t("settings.dissolve")}</option>
                  <option value="wipe">{t("settings.wipe")}</option>
                  <option value="cut">{t("settings.cut")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-on-surface-variant block uppercase tracking-widest">
                  {t("settings.outputDisplay")}
                </label>
                <select
                  value={displayId}
                  onChange={(event) => setDisplayId(event.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  {displays.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                  {displays.length === 0 ? (
                    <option value="">{t("settings.noDisplays")}</option>
                  ) : null}
                </select>
              </div>
            </div>
            <div className="mt-6 space-y-2">
              <label className="text-[11px] font-medium text-on-surface-variant block uppercase tracking-widest">
                {t("settings.stageBackground")}
              </label>
              <p className="text-[11px] text-on-surface-variant">
                {t("settings.stageBackgroundHint")}
              </p>
              <StageBackgroundPicker
                value={stageBackground}
                onChange={setStageBackground}
              />
            </div>
          </section>

          <section
            id="about"
            className="col-span-12 glass-panel rounded-xl p-6 sm:p-8 flex flex-col md:flex-row items-center gap-8 md:gap-10 scroll-mt-8"
          >
            <div className="w-32 h-32 flex-shrink-0 bg-surface-container rounded-2xl overflow-hidden border border-white/10 shadow-xl group relative flex items-center justify-center">
              <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                <span className="material-symbols-outlined filled text-on-primary text-5xl">
                  church
                </span>
              </div>
              <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-3xl">
                  info
                </span>
              </div>
            </div>
            <div className="text-center md:text-left space-y-2">
              <h3 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-primary">
                {t("settings.aboutName")}
              </h3>
              <p className="text-on-surface-variant max-w-2xl">
                Version {version}
                <br />
                {t("settings.copyright", { year: new Date().getFullYear() })}
                <br />
                {t("settings.aboutBlurb")}
              </p>
              <div className="flex gap-4 pt-4 justify-center md:justify-start">
                <a className="text-xs text-primary hover:underline" href="#about">
                  {t("settings.releaseNotes")}
                </a>
                <span className="text-white/10">|</span>
                <a className="text-xs text-primary hover:underline" href="#about">
                  {t("settings.privacy")}
                </a>
                <span className="text-white/10">|</span>
                <a className="text-xs text-primary hover:underline" href="#about">
                  {t("settings.supportPortal")}
                </a>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 pb-12">
          <button
            type="button"
            onClick={() => {
              changeTheme("dark");
              changeLanguage("en");
              setFont(DEFAULT_STAGE_FONT);
              setLyricSize("48");
              setStageBackground(DEFAULT_STAGE_BACKGROUND);
              setTransition("dissolve");
              setBackup("hourly");
            }}
            className="px-8 py-3 rounded-lg border border-white/10 text-on-surface hover:bg-white/5 transition-all"
          >
            {t("settings.reset")}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="px-10 py-3 rounded-lg bg-primary text-on-primary font-bold shadow-lg hover:shadow-primary/20 transition-all active:scale-95 disabled:opacity-60"
          >
            {saving ? t("settings.saving") : t("settings.save")}
            {dirty && !saving ? (
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-on-primary/80">
                Unsaved
              </span>
            ) : null}
          </button>
        </div>
      </div>
      {draft.dialog}
    </section>
  );
}
