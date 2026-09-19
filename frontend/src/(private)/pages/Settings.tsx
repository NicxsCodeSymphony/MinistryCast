import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageSkeleton } from "../../components/Skeleton";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import StageBackgroundPicker from "../../components/StageBackgroundPicker";
import TextSizePicker from "../../components/TextSizePicker";
import TextStylePicker from "../../components/TextStylePicker";
import {
  getChurchSettings,
  listOutputDisplays,
  patchChurchSettings,
  saveChurchSettings,
} from "../../lib/api";
import TeamAccountsPanel from "../components/TeamAccountsPanel";
import ApprovalsPanel from "../components/ApprovalsPanel";
import {
  deleteMyAccount,
  getSessionProfile,
  isChurchAdmin,
  isLibraryEditor,
  isSuperadmin,
  updateMyChurch,
  updateMyProfile,
  updatePassword,
  uploadAvatar,
  uploadChurchPhoto,
  type SessionProfile,
} from "../../lib/auth";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "../../lib/notifications";
import { formatRelative } from "../../lib/helpers";
import { INTERFACE_LANGUAGES, normalizeLang, type Lang } from "../../lib/i18n";
import { estimateStorage, forceSync } from "../../lib/offline/sync";
import { syncIcon, syncLabel } from "../../lib/offline/status";
import { useSyncStatus } from "../../lib/offline/useSyncStatus";
import { usePrefs, type ThemeName } from "../../lib/PrefsContext";
import { useProfile } from "../../lib/ProfileContext";
import { useToast } from "../../lib/ToastContext";
import { useUnsavedDraft } from "../../lib/useUnsavedDraft";
import {
  asStageFont,
  DEFAULT_STAGE_FONT,
  STAGE_FONTS,
} from "../../lib/stageFonts";
import {
  asStageBackground,
  DEFAULT_STAGE_BACKGROUND,
  type StageBackgroundId,
} from "../../lib/stageBackgrounds";
import {
  parseLyricTextStyle,
  serializeLyricTextStyle,
  type LyricTextStyle,
} from "../../lib/lyricTextStyle";
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
  lyricStyle: string;
  transition: string;
  backup: string;
  stageBackground: string;
}) {
  return JSON.stringify(input);
}

function roleLabel(role: string | undefined) {
  switch (role) {
    case "superadmin":
      return "Platform superadmin";
    case "admin":
      return "Church admin";
    case "producer":
      return "Producer";
    case "operator":
      return "Church member / operator";
    default:
      return role || "Member";
  }
}

type SettingsTab =
  | "account"
  | "team"
  | "approvals"
  | "church"
  | "general"
  | "presentation";

const SETTINGS_TABS = new Set<SettingsTab>([
  "account",
  "team",
  "approvals",
  "church",
  "general",
  "presentation",
]);

function parseSettingsTab(
  raw: string | null,
): SettingsTab | "notifications" | null {
  if (!raw) return null;
  if (raw === "notifications") return "notifications";
  if (SETTINGS_TABS.has(raw as SettingsTab)) return raw as SettingsTab;
  return null;
}

/** Approvals is superadmin-only; church admins manage joins under Team Accounts. */
function resolveSettingsTabForRole(
  requested: SettingsTab,
  opts: { superadmin: boolean; canEditChurch: boolean },
): SettingsTab {
  if (requested === "approvals" && !opts.superadmin && opts.canEditChurch) {
    return "team";
  }
  if (requested === "team" && opts.superadmin) {
    return "approvals";
  }
  return requested;
}

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sync = useSyncStatus();
  const prefs = usePrefs();
  const toast = useToast();
  const { setProfile: setSharedProfile } = useProfile();
  const { t, version } = prefs;
  const [theme, setTheme] = useState<ThemeName>(prefs.theme);
  const [language, setLanguage] = useState<Lang>(prefs.language);
  const [font, setFont] = useState(DEFAULT_STAGE_FONT);
  const [lyricSize, setLyricSize] = useState("48");
  const [lyricStyle, setLyricStyle] = useState<LyricTextStyle>({
    bold: false,
    italic: false,
    underline: false,
  });
  const [stageBackground, setStageBackground] = useState<StageBackgroundId>(
    DEFAULT_STAGE_BACKGROUND,
  );
  const [transition, setTransition] = useState("dissolve");
  const [backup, setBackup] = useState("hourly");
  const [displayId, setDisplayId] = useState("");
  const [displays, setDisplays] = useState<OutputDisplay[]>([]);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [churchName, setChurchName] = useState("");
  const [churchAddress, setChurchAddress] = useState("");
  const [churchPhone, setChurchPhone] = useState("");
  const [churchPhotoUrl, setChurchPhotoUrl] = useState<string | null>(null);
  const [savingChurch, setSavingChurch] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences | null>(
    null,
  );
  const [savingNotifs, setSavingNotifs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const [message, setMessage] = useState("");
  const [churchInterfaceLanguage, setChurchInterfaceLanguage] = useState("en");
  const [error, setError] = useState("");
  const [baseline, setBaseline] = useState<string | null>(null);
  const tabParam = searchParams.get("tab");
  const initialTab = (() => {
    const parsed = parseSettingsTab(tabParam);
    if (parsed === "notifications") return "general" as SettingsTab;
    return parsed ?? ("account" as SettingsTab);
  })();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [panelKey, setPanelKey] = useState(0);
  const persistSave = useRef<() => Promise<boolean>>(async () => false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const churchPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const storagePct =
    storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0;
  const storageLabel =
    storageQuota > 0
      ? `${formatBytes(storageUsed)} / ${formatBytes(storageQuota)}`
      : t("settings.localCache");
  const canEditChurch = profile ? isChurchAdmin(profile) : false;
  const canEditPresentation = profile
    ? isLibraryEditor(profile) || isChurchAdmin(profile)
    : false;
  const superadmin = profile ? isSuperadmin(profile) : false;

  useEffect(() => {
    void (async () => {
      try {
        const [nextProfile, settings, outputs, storage, prefs] =
          await Promise.all([
            getSessionProfile(),
            getChurchSettings(),
            listOutputDisplays(),
            estimateStorage(),
            getNotificationPreferences().catch(() => null),
          ]);
        setProfile(nextProfile);
        setSharedProfile(nextProfile);
        setDisplayName(nextProfile.user?.name ?? "");
        setAvatarUrl(nextProfile.user?.avatar_url ?? null);
        setChurchName(nextProfile.church?.name ?? "");
        setChurchAddress(nextProfile.church?.address ?? "");
        setChurchPhone(nextProfile.church?.phone ?? "");
        setChurchPhotoUrl(nextProfile.church?.photo_url ?? null);
        if (prefs) setNotifPrefs(prefs);
        applySettings(settings);
        setDisplays(outputs);
        setDisplayId(
          outputs.find((row) => row.is_default)?.id ?? outputs[0]?.id ?? "",
        );
        if (storage?.quota) {
          setStorageUsed(storage.usage);
          setStorageQuota(storage.quota);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("settings.loadError"));
        toast.error(
          err instanceof Error ? err.message : t("settings.loadError"),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    const parsed = parseSettingsTab(searchParams.get("tab"));
    if (!parsed) return;
    const canEditChurchNow = profile ? isChurchAdmin(profile) : false;
    const superadminNow = profile ? isSuperadmin(profile) : false;
    const nextTab: SettingsTab =
      parsed === "notifications"
        ? "general"
        : resolveSettingsTabForRole(parsed, {
            superadmin: superadminNow,
            canEditChurch: canEditChurchNow,
          });
    if (nextTab !== tab) {
      setTab(nextTab);
      setPanelKey((n) => n + 1);
    }
    if (parsed === "notifications") {
      window.setTimeout(() => {
        document
          .getElementById("notifications")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [loading, searchParams, tab, profile]);

  const selectTab = (next: SettingsTab, focus?: "notifications") => {
    const param =
      focus === "notifications" && next === "general" ? "notifications" : next;
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        nextParams.set("tab", param);
        return nextParams;
      },
      { replace: true },
    );
  };

  const applySettings = (settings: ChurchSettings | null) => {
    if (!settings) return;
    const nextTheme =
      settings.theme === "light" || settings.theme === "system"
        ? settings.theme
        : "dark";
    setTheme(nextTheme);
    prefs.setTheme(nextTheme);
    // Language is per-user (prefs / localStorage), not church settings.
    setLanguage(prefs.language);
    setChurchInterfaceLanguage(settings.interface_language || "en");
    setFont(asStageFont(settings.default_font));
    setLyricSize(settings.lyrics_text_size || "48");
    setLyricStyle(parseLyricTextStyle(settings.lyrics_text_style));
    setStageBackground(asStageBackground(settings.stage_background));
    setTransition(settings.default_transition || "dissolve");
    setBackup(settings.backup_frequency || "hourly");
    setBaseline(
      settingsDraftKey({
        font: asStageFont(settings.default_font),
        lyricSize: settings.lyrics_text_size || "48",
        lyricStyle: settings.lyrics_text_style || "",
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

  const saveProfile = async () => {
    if (!profile?.user) return;
    setSavingProfile(true);
    setError("");
    setMessage("");
    try {
      if (password || password2) {
        if (password.length < 8) throw new Error(t("settings.passwordShort"));
        if (password !== password2)
          throw new Error(t("settings.passwordMismatch"));
        await updatePassword(password);
        setPassword("");
        setPassword2("");
      }
      const next = await updateMyProfile({
        name: displayName,
        avatar_url: avatarUrl,
      });
      setProfile(next);
      setSharedProfile(next);
      setDisplayName(next.user?.name ?? displayName);
      setAvatarUrl(next.user?.avatar_url ?? null);
      setMessage(t("settings.profileSaved"));
      toast.success(t("settings.profileSaved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("settings.saveError");
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const onAvatarFile = async (file: File | null) => {
    if (!file || !profile?.user) return;
    try {
      const url = await uploadAvatar(file, profile.user.id, avatarUrl);
      setAvatarUrl(url);
      const next = await updateMyProfile({ avatar_url: url });
      setProfile(next);
      setSharedProfile(next);
      toast.success(t("settings.profileSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  const saveChurch = async () => {
    setSavingChurch(true);
    setError("");
    setMessage("");
    try {
      const next = await updateMyChurch({
        name: churchName,
        address: churchAddress,
        phone: churchPhone,
        photo_url: churchPhotoUrl,
      });
      setProfile(next);
      setChurchName(next.church?.name ?? churchName);
      setChurchAddress(next.church?.address ?? "");
      setChurchPhone(next.church?.phone ?? "");
      setChurchPhotoUrl(next.church?.photo_url ?? null);
      setMessage(t("settings.churchSaved"));
      toast.success(t("settings.churchSaved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("settings.saveError");
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingChurch(false);
    }
  };

  const onChurchPhotoFile = async (file: File | null) => {
    if (!file || !profile?.church?.id) return;
    try {
      const url = await uploadChurchPhoto(
        file,
        profile.church.id,
        churchPhotoUrl,
      );
      setChurchPhotoUrl(url);
      const next = await updateMyChurch({ photo_url: url });
      setProfile(next);
      toast.success(t("settings.churchSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  const patchNotifPrefs = async (
    patch: Partial<
      Pick<
        NotificationPreferences,
        "enabled" | "chat" | "presentation" | "team" | "system"
      >
    >,
  ) => {
    if (!notifPrefs || savingNotifs) return;
    const previous = notifPrefs;
    setNotifPrefs({ ...notifPrefs, ...patch });
    setSavingNotifs(true);
    try {
      const next = await updateNotificationPreferences(patch);
      setNotifPrefs(next);
      toast.success(t("settings.notificationsSaved"));
    } catch (err) {
      setNotifPrefs(previous);
      toast.error(
        err instanceof Error ? err.message : t("settings.notificationsError"),
      );
    } finally {
      setSavingNotifs(false);
    }
  };

  const confirmDeleteAccount = async () => {
    if (deletingAccount) return;
    if (deletePassword.length < 6) {
      toast.error(t("settings.deleteAccountPasswordHint"));
      return;
    }
    setDeletingAccount(true);
    setError("");
    try {
      await deleteMyAccount(deletePassword);
      setDeleteOpen(false);
      toast.success(t("settings.deleteAccount"));
      navigate("/", { replace: true });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("settings.deleteAccountError");
      setError(msg);
      toast.error(msg);
    } finally {
      setDeletingAccount(false);
    }
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveChurchSettings({
        // Keep church default language untouched; UI language is per account.
        interface_language: churchInterfaceLanguage || "en",
        theme,
        default_font: font,
        lyrics_text_size: lyricSize,
        lyrics_text_style: serializeLyricTextStyle(lyricStyle),
        default_transition: transition,
        transition_ms:
          transition === "cut" ? 0 : transition === "wipe" ? 600 : 400,
        backup_frequency: backup,
        stage_background: stageBackground,
      });
      applySettings(saved);
      setMessage(t("settings.saved"));
      toast.success(t("settings.saved"));
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("settings.saveError");
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
    settingsDraftKey({
      font,
      lyricSize,
      lyricStyle: serializeLyricTextStyle(lyricStyle),
      transition,
      backup,
      stageBackground,
    }) !== baseline;
  const draft = useUnsavedDraft(dirty, {
    enabled: !loading && canEditPresentation,
    title: "Unsaved settings",
    description:
      "Your settings draft is not saved. Save it before you leave, or you’ll lose these changes.",
    onSave: () => persistSave.current(),
  });

  if (loading) return <PageSkeleton />;

  const tabs: {
    id:
      | "account"
      | "team"
      | "approvals"
      | "church"
      | "general"
      | "presentation";
    label: string;
    icon: string;
    show: boolean;
  }[] = [
    {
      id: "account",
      label: t("settings.profile"),
      icon: "manage_accounts",
      show: true,
    },
    {
      id: "team",
      label: t("settings.team"),
      icon: "group",
      show: Boolean(canEditChurch && profile?.church && !superadmin),
    },
    {
      id: "approvals",
      label: t("nav.approvals"),
      icon: "verified_user",
      show: superadmin,
    },
    {
      id: "church",
      label: t("settings.churchProfile"),
      icon: "church",
      show: Boolean(canEditChurch && profile?.church && !superadmin),
    },
    { id: "general", label: t("settings.general"), icon: "tune", show: true },
    {
      id: "presentation",
      label: t("settings.presentation"),
      icon: "desktop_windows",
      show: canEditPresentation && !superadmin,
    },
  ];
  const visibleTabs = tabs.filter((item) => item.show);
  const activeTab = visibleTabs.some((item) => item.id === tab)
    ? tab
    : (visibleTabs[0]?.id ?? "account");

  return (
    <section className="h-full overflow-y-auto custom-scrollbar bg-surface-container-lowest">
      <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-[clamp(1.5rem,3vw,1.85rem)] font-semibold tracking-tight text-on-surface">
            {t("nav.settings")}
          </h1>
          <p className="text-sm text-on-surface-variant">
            {t("settings.roleHint", { role: roleLabel(profile?.user?.role) })}
          </p>
        </header>

        {error ? <p className="text-sm text-[#ffb4ab]">{error}</p> : null}
        {message ? <p className="text-sm text-primary">{message}</p> : null}

        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto custom-scrollbar p-1 rounded-2xl bg-surface-container-low border border-white/5"
        >
          {visibleTabs.map((item) => {
            const active = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(item.id)}
                className={`relative shrink-0 flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                  active
                    ? "bg-primary text-on-primary shadow-lg shadow-primary/20"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[18px] transition-transform duration-300 ${
                    active ? "scale-110" : ""
                  }`}
                >
                  {item.icon}
                </span>
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div
          key={`${activeTab}-${panelKey}`}
          role="tabpanel"
          className="settings-tab-panel glass-panel rounded-xl p-6 sm:p-8"
        >
          {activeTab === "account" ? (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold text-on-surface mb-1">
                  {t("settings.profile")}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t("settings.profileHint")}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-3 flex flex-col items-center gap-3">
                  <div className="w-28 h-28 rounded-full overflow-hidden bg-surface-container-highest border border-white/10 flex items-center justify-center">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl font-semibold text-on-surface-variant">
                        {(displayName || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      void onAvatarFile(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {t("settings.changePhoto")}
                  </button>
                </div>
                <div className="md:col-span-9 space-y-4">
                  <div>
                    <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                      {t("settings.displayName")}
                    </label>
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                        {t("settings.newPassword")}
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                        className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                        placeholder="••••••••"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                        {t("settings.confirmPassword")}
                      </label>
                      <input
                        type="password"
                        value={password2}
                        onChange={(event) => setPassword2(event.target.value)}
                        autoComplete="new-password"
                        className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    Signed in as {profile?.user?.email || "—"}
                  </p>
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={() => void saveProfile()}
                    className="px-6 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-60"
                  >
                    {savingProfile
                      ? t("settings.saving")
                      : t("settings.saveProfile")}
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-[#ffb4ab]">
                    {t("settings.deleteAccount")}
                  </h3>
                  <p className="text-sm text-on-surface-variant mt-1">
                    {t("settings.deleteAccountHint")}
                  </p>
                </div>
                <div className="max-w-sm">
                  <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                    {t("settings.deleteAccountPassword")}
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    autoComplete="current-password"
                    className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-error/40 focus:outline-none"
                    placeholder="••••••••"
                  />
                  <p className="mt-3 text-xs text-on-surface-variant">
                    {t("settings.deleteAccountPasswordHint")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={deletingAccount || deletePassword.length < 6}
                  onClick={() => setDeleteOpen(true)}
                  className="px-6 py-2.5 rounded-lg bg-error text-on-error text-sm font-semibold disabled:opacity-50"
                >
                  {deletingAccount
                    ? t("settings.deletingAccount")
                    : t("settings.deleteAccount")}
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === "church" && canEditChurch && profile?.church ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-on-surface mb-1">
                  {t("settings.churchProfile")}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t("settings.churchProfileHint")}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-3 flex flex-col items-center gap-3">
                  <div className="w-28 h-28 rounded-2xl overflow-hidden bg-surface-container-highest border border-white/10 flex items-center justify-center">
                    {churchPhotoUrl ? (
                      <img
                        src={churchPhotoUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant">
                        church
                      </span>
                    )}
                  </div>
                  <input
                    ref={churchPhotoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      void onChurchPhotoFile(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => churchPhotoInputRef.current?.click()}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {t("settings.changePhoto")}
                  </button>
                </div>
                <div className="md:col-span-9 space-y-4">
                  <div>
                    <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                      {t("settings.churchName")}
                    </label>
                    <input
                      value={churchName}
                      onChange={(event) => setChurchName(event.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                      {t("settings.churchAddress")}
                    </label>
                    <input
                      value={churchAddress}
                      onChange={(event) => setChurchAddress(event.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                      {t("settings.churchPhone")}
                    </label>
                    <input
                      value={churchPhone}
                      onChange={(event) => setChurchPhone(event.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={savingChurch}
                    onClick={() => void saveChurch()}
                    className="px-6 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-60"
                  >
                    {savingChurch
                      ? t("settings.saving")
                      : t("settings.saveChurch")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "general" ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-on-surface mb-1">
                  {t("settings.general")}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t("settings.syncBackup")}
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-4 rounded-lg bg-white/5 border border-white/5">
                    <div>
                      <p className="text-on-surface">
                        {t("settings.language")}
                      </p>
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
                      <p className="text-on-surface">
                        {t("settings.appearance")}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {t("settings.appearanceHint")}
                      </p>
                    </div>
                    <div className="flex p-1 bg-surface-container-high rounded-full border border-white/5 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => changeTheme("dark")}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
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
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                          theme === "light"
                            ? "bg-primary text-on-primary shadow-lg"
                            : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {t("settings.light")}
                      </button>
                      <button
                        type="button"
                        onClick={() => changeTheme("system")}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                          theme === "system"
                            ? "bg-primary text-on-primary shadow-lg"
                            : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {t("settings.system")}
                      </button>
                    </div>
                  </div>

                  {notifPrefs ? (
                    <div
                      id="notifications"
                      className="p-4 rounded-lg bg-white/5 border border-white/5 space-y-3 scroll-mt-4"
                    >
                      <div className="space-y-1.5">
                        <p className="text-on-surface">
                          {t("settings.notifications")}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {t("settings.notificationsHint")}
                        </p>
                      </div>
                      {(
                        [
                          {
                            key: "enabled" as const,
                            label: "settings.notificationsMaster",
                            hint: "settings.notificationsMasterHint",
                          },
                          {
                            key: "chat" as const,
                            label: "settings.notificationsChat",
                            hint: "settings.notificationsChatHint",
                          },
                          {
                            key: "presentation" as const,
                            label: "settings.notificationsPresentation",
                            hint: "settings.notificationsPresentationHint",
                          },
                          {
                            key: "team" as const,
                            label: "settings.notificationsTeam",
                            hint: "settings.notificationsTeamHint",
                          },
                          {
                            key: "system" as const,
                            label: "settings.notificationsSystem",
                            hint: "settings.notificationsSystemHint",
                          },
                        ] as const
                      ).map((row) => {
                        const on =
                          row.key === "enabled"
                            ? notifPrefs.enabled
                            : notifPrefs.enabled && notifPrefs[row.key];
                        const disabled =
                          savingNotifs ||
                          (row.key !== "enabled" && !notifPrefs.enabled);
                        return (
                          <div
                            key={row.key}
                            className="flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-on-surface">
                                {t(row.label)}
                              </p>
                              <p className="text-xs text-on-surface-variant">
                                {t(row.hint)}
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              disabled={disabled}
                              onClick={() =>
                                void patchNotifPrefs({
                                  [row.key]: !notifPrefs[row.key],
                                })
                              }
                              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                                on ? "bg-primary" : "bg-surface-container-high"
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                  on ? "translate-x-5" : "translate-x-0"
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="p-4 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex justify-between items-center gap-4 mb-3">
                      <div>
                        <p className="text-on-surface">
                          {t("settings.offline")}
                        </p>
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
                        className="bg-primary h-full transition-[width] duration-500 ease-out"
                        style={{ width: `${storagePct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-4 rounded-lg bg-secondary/5 border border-secondary/20">
                  <div className="flex items-center gap-4">
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
                      <p className="text-xs font-medium text-secondary">
                        {syncLabel(sync)}
                      </p>
                      <p className="text-sm text-on-surface truncate">
                        {profile?.user?.email || "—"}
                      </p>
                    </div>
                  </div>
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
                      <p className="mt-2 text-xs text-[#ffb4ab]">
                        {sync.error}
                      </p>
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
                  {canEditPresentation ? (
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
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
                        className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-on-surface text-sm hover:bg-white/5 transition-all"
                      >
                        {t("settings.reset")}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void save()}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-60"
                      >
                        {saving ? t("settings.saving") : t("settings.save")}
                        {dirty && !saving ? " · Unsaved" : ""}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "team" && canEditChurch && !superadmin ? (
            <TeamAccountsPanel myUserId={profile?.user?.id ?? ""} />
          ) : null}

          {activeTab === "approvals" && superadmin ? (
            <ApprovalsPanel embedded />
          ) : null}

          {activeTab === "presentation" && canEditPresentation ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-on-surface mb-1">
                    {t("settings.presentation")}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {t("settings.lyricsFontHint")}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFont(DEFAULT_STAGE_FONT);
                      setLyricSize("48");
                      setStageBackground(DEFAULT_STAGE_BACKGROUND);
                      setTransition("dissolve");
                    }}
                    className="px-4 py-2 rounded-lg border border-white/10 text-sm text-on-surface hover:bg-white/5"
                  >
                    {t("settings.reset")}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="px-5 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-60"
                  >
                    {saving ? t("settings.saving") : t("settings.save")}
                    {dirty && !saving ? (
                      <span className="ml-2 text-[10px] uppercase opacity-80">
                        Unsaved
                      </span>
                    ) : null}
                  </button>
                </div>
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
                  <TextSizePicker value={lyricSize} onChange={setLyricSize} />
                  <TextStylePicker
                    value={lyricStyle}
                    onChange={setLyricStyle}
                  />
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
              <div className="space-y-2">
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
            </div>
          ) : null}
        </div>

        <section
          id="about"
          className="glass-panel rounded-xl p-6 sm:p-8 flex flex-col md:flex-row items-center gap-8 md:gap-10 scroll-mt-8"
        >
          <div className="w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0 bg-surface-container rounded-2xl overflow-hidden border border-white/10 shadow-xl group relative flex items-center justify-center">
            <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
              <span className="material-symbols-outlined filled text-on-primary text-5xl">
                church
              </span>
            </div>
          </div>
          <div className="text-center md:text-left space-y-2">
            <h3 className="text-[28px] sm:text-[32px] leading-10 font-semibold tracking-[-0.01em] text-primary">
              {t("settings.aboutName")}
            </h3>
            <p className="text-on-surface-variant max-w-2xl text-sm sm:text-base">
              Version {version}
              <br />
              {t("settings.copyright", { year: new Date().getFullYear() })}
              <br />
              {t("settings.aboutBlurb")}
            </p>
            <div className="flex gap-4 pt-3 justify-center md:justify-start">
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
      {draft.dialog}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => {
          if (!deletingAccount) setDeleteOpen(false);
        }}
        onConfirm={() => confirmDeleteAccount()}
        title={t("settings.deleteAccountConfirmTitle")}
        description={t("settings.deleteAccountConfirm", {
          email: profile?.user?.email || "this account",
        })}
        highlight={profile?.user?.email || undefined}
        confirmLabel={t("settings.deleteAccount")}
      />
    </section>
  );
}
