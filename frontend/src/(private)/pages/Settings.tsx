import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SettingsSkeleton } from "../../components/Skeleton";
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
  DEFAULT_LYRIC_TEXT_STYLE,
  DEFAULT_STAGE_TEXT_SIZE,
  parseLyricTextStyle,
  serializeLyricTextStyle,
  type LyricTextStyle,
} from "../../lib/lyricTextStyle";
import type { ChurchSettings, OutputDisplay } from "../../lib/types";
import Icon from "../../components/Icon";
import { Badge, EmptyState } from "../../components/ui";
import {
  fieldClass,
  SaveBar,
  Segmented,
  SettingRow,
  SettingsNav,
  SettingsPage,
  SettingsSection,
  Switch,
  type SettingsNavGroup,
} from "../../components/settings/SettingsUi";
import { PaletteGallery, ProfileOverview } from "../../components/settings/SettingsOverview";

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
  | "notifications"
  | "team"
  | "approvals"
  | "church"
  | "general"
  | "backup"
  | "presentation";

const SETTINGS_TABS = new Set<SettingsTab>([
  "account",
  "notifications",
  "team",
  "approvals",
  "church",
  "general",
  "backup",
  "presentation",
]);

function parseSettingsTab(raw: string | null): SettingsTab | null {
  if (!raw) return null;
  if (SETTINGS_TABS.has(raw as SettingsTab)) return raw as SettingsTab;
  return null;
}

const NOTIFICATION_ROWS = [
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
];

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
  const [lyricSize, setLyricSize] = useState(DEFAULT_STAGE_TEXT_SIZE);
  const [lyricStyle, setLyricStyle] = useState<LyricTextStyle>(DEFAULT_LYRIC_TEXT_STYLE);
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
  const initialTab: SettingsTab = parseSettingsTab(tabParam) ?? "account";
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
    const nextTab = resolveSettingsTabForRole(parsed, {
      superadmin: superadminNow,
      canEditChurch: canEditChurchNow,
    });
    if (nextTab !== tab) {
      setTab(nextTab);
      setPanelKey((n) => n + 1);
    }
  }, [loading, searchParams, tab, profile]);

  const selectTab = (next: SettingsTab) => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        nextParams.set("tab", next);
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
    setLyricSize(settings.lyrics_text_size || DEFAULT_STAGE_TEXT_SIZE);
    setLyricStyle(parseLyricTextStyle(settings.lyrics_text_style));
    setStageBackground(asStageBackground(settings.stage_background));
    setTransition(settings.default_transition || "dissolve");
    setBackup(settings.backup_frequency || "hourly");
    setBaseline(
      settingsDraftKey({
        font: asStageFont(settings.default_font),
        lyricSize: settings.lyrics_text_size || DEFAULT_STAGE_TEXT_SIZE,
        lyricStyle: serializeLyricTextStyle(parseLyricTextStyle(settings.lyrics_text_style)),
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
      setSharedProfile(next);
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

  const discardSettings = () => {
    if (!baseline) return;
    const saved = JSON.parse(baseline) as {
      font: string;
      lyricSize: string;
      lyricStyle: string;
      transition: string;
      backup: string;
      stageBackground: string;
    };
    setFont(saved.font);
    setLyricSize(saved.lyricSize);
    setLyricStyle(parseLyricTextStyle(saved.lyricStyle));
    setTransition(saved.transition);
    setBackup(saved.backup);
    setStageBackground(asStageBackground(saved.stageBackground));
  };

  const profileDirty =
    displayName !== (profile?.user?.name ?? "") ||
    password.length > 0 ||
    password2.length > 0;
  const discardProfile = () => {
    setDisplayName(profile?.user?.name ?? "");
    setPassword("");
    setPassword2("");
  };

  const churchDirty =
    churchName !== (profile?.church?.name ?? "") ||
    churchAddress !== (profile?.church?.address ?? "") ||
    churchPhone !== (profile?.church?.phone ?? "");
  const discardChurch = () => {
    setChurchName(profile?.church?.name ?? "");
    setChurchAddress(profile?.church?.address ?? "");
    setChurchPhone(profile?.church?.phone ?? "");
  };

  if (loading) return <SettingsSkeleton />;

  const showChurchTabs = Boolean(canEditChurch && profile?.church && !superadmin);
  const groups: SettingsNavGroup<SettingsTab>[] = [
    {
      label: t("settings.account"),
      items: [
        { id: "account", label: t("settings.profile"), icon: "person" },
        { id: "notifications", label: t("settings.notifications"), icon: "notifications" },
      ],
    },
    {
      label: "Church",
      items: [
        ...(showChurchTabs
          ? [
              { id: "church" as const, label: t("settings.churchProfile"), icon: "church" },
              { id: "team" as const, label: t("settings.team"), icon: "group" },
            ]
          : []),
        ...(superadmin
          ? [{ id: "approvals" as const, label: t("nav.approvals"), icon: "verified_user" }]
          : []),
      ],
    },
    {
      label: "Workspace",
      items: [
        { id: "general", label: t("settings.appearance"), icon: "palette" },
        { id: "backup", label: t("settings.syncBackup"), icon: "cloud_sync" },
        ...(canEditPresentation && !superadmin
          ? [{ id: "presentation" as const, label: t("settings.presentation"), icon: "desktop_windows" }]
          : []),
      ],
    },
  ];
  const visibleIds = groups.flatMap((group) => group.items.map((item) => item.id));
  const activeTab: SettingsTab = visibleIds.includes(tab) ? tab : "account";
  const settingsBar =
    canEditPresentation &&
    (activeTab === "general" || activeTab === "backup" || activeTab === "presentation");

  const resetAll = () => {
    changeTheme("dark");
    changeLanguage("en");
    setFont(DEFAULT_STAGE_FONT);
    setLyricSize(DEFAULT_STAGE_TEXT_SIZE);
    setLyricStyle(DEFAULT_LYRIC_TEXT_STYLE);
    setStageBackground(DEFAULT_STAGE_BACKGROUND);
    setTransition("dissolve");
    setBackup("hourly");
  };
  const resetPresentation = () => {
    setFont(DEFAULT_STAGE_FONT);
    setLyricSize(DEFAULT_STAGE_TEXT_SIZE);
    setLyricStyle(DEFAULT_LYRIC_TEXT_STYLE);
    setStageBackground(DEFAULT_STAGE_BACKGROUND);
    setTransition("dissolve");
  };

  const navHeader = (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest shrink-0 flex items-center justify-center text-[12px] font-semibold text-on-surface-variant">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          (profile?.user?.name || "?").slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-on-surface truncate">
          {profile?.user?.name || profile?.user?.email || "—"}
        </span>
        <span className="block text-[11px] text-on-surface-variant truncate">
          {profile?.church?.name || roleLabel(profile?.user?.role)}
        </span>
      </span>
    </div>
  );

  const navFooter = (
    <div id="about" className="space-y-1.5 text-[11px] leading-4 text-on-surface-variant">
      <p
        title={`${t("settings.copyright", { year: new Date().getFullYear() })} ${t("settings.aboutBlurb")}`}
      >
        <span className="text-on-surface font-medium">{t("settings.aboutName")}</span>{" "}
        <span className="tabular-nums">v{version}</span>
      </p>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-outline">
        <a className="hover:text-on-surface" href="#about">
          {t("settings.releaseNotes")}
        </a>
        <a className="hover:text-on-surface" href="#about">
          {t("settings.privacy")}
        </a>
        <a className="hover:text-on-surface" href="#about">
          {t("settings.supportPortal")}
        </a>
      </p>
    </div>
  );

  return (
    <section className="h-full flex flex-col md:flex-row min-h-0 bg-surface-container-lowest">
      <h1 className="sr-only">{t("nav.settings")}</h1>
      <SettingsNav
        groups={groups}
        value={activeTab}
        onChange={selectTab}
        header={navHeader}
        footer={navFooter}
      />

      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto custom-scrollbar">
        <div
          key={`${activeTab}-${panelKey}`}
          id="settings-panel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          className="settings-tab-panel max-w-[880px] mx-auto px-4 sm:px-10 pt-8 sm:pt-10"
        >
          {error ? (
            <p role="alert" className="mb-6 text-[13px] text-error">
              {error}
            </p>
          ) : null}
          {message && !error ? (
            <p role="status" className="sr-only">
              {message}
            </p>
          ) : null}

          {activeTab === "account" ? (
            <SettingsPage title={t("settings.profile")} description={t("settings.profileHint")}>
              <ProfileOverview
                name={profile?.user?.name || ""}
                email={profile?.user?.email || "—"}
                avatarUrl={avatarUrl}
                role={roleLabel(profile?.user?.role)}
                roleAccent={superadmin || canEditChurch}
                churchName={profile?.church?.name ?? null}
                churchPhotoUrl={churchPhotoUrl}
                themeLabel={
                  theme === "light"
                    ? t("settings.light")
                    : theme === "system"
                      ? t("settings.system")
                      : t("settings.dark")
                }
                palette={prefs.palette}
                languageLabel={
                  INTERFACE_LANGUAGES.find((lang) => lang.id === language)?.label ?? language
                }
                sync={sync}
                storageUsed={storageUsed}
                storageQuota={storageQuota}
                storageLabel={storageLabel}
                onOpen={selectTab}
              />
              <SettingsSection title="Details">
                <SettingRow
                  label={t("settings.photo")}
                  hint="JPG, PNG, WebP or GIF."
                >
                  <span className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest border border-white/10 flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[15px] font-semibold text-on-surface-variant">
                        {(displayName || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
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
                    className="ui-btn ui-btn-secondary"
                  >
                    {t("settings.changePhoto")}
                  </button>
                </SettingRow>
                <SettingRow label={t("settings.displayName")} htmlFor="settings-display-name">
                  <input
                    id="settings-display-name"
                    value={displayName}
                    autoComplete="name"
                    onChange={(event) => setDisplayName(event.target.value)}
                    className={fieldClass}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.teamEmail")}
                  hint={`Signed in as ${profile?.user?.email || "—"}`}
                >
                  <Badge tone={superadmin || canEditChurch ? "accent" : "neutral"}>
                    {roleLabel(profile?.user?.role)}
                  </Badge>
                </SettingRow>
              </SettingsSection>

              <SettingsSection title="Password" description="Leave blank to keep your current password.">
                <SettingRow
                  label={t("settings.newPassword")}
                  hint={t("settings.passwordShort")}
                  htmlFor="settings-new-password"
                >
                  <input
                    id="settings-new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    className={fieldClass}
                    placeholder="••••••••"
                  />
                </SettingRow>
                <SettingRow label={t("settings.confirmPassword")} htmlFor="settings-confirm-password">
                  <input
                    id="settings-confirm-password"
                    type="password"
                    value={password2}
                    onChange={(event) => setPassword2(event.target.value)}
                    autoComplete="new-password"
                    className={fieldClass}
                    placeholder="••••••••"
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection title="Danger zone" tone="danger">
                <SettingRow
                  label={t("settings.deleteAccount")}
                  hint={t("settings.deleteAccountHint")}
                  stacked
                >
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="min-w-0 sm:w-[280px]">
                      <label
                        htmlFor="settings-delete-password"
                        className="block text-[12px] text-on-surface-variant mb-1.5"
                      >
                        {t("settings.deleteAccountPassword")}
                      </label>
                      <input
                        id="settings-delete-password"
                        type="password"
                        value={deletePassword}
                        onChange={(event) => setDeletePassword(event.target.value)}
                        autoComplete="current-password"
                        className="ui-input"
                        placeholder="••••••••"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={deletingAccount || deletePassword.length < 6}
                      onClick={() => setDeleteOpen(true)}
                      className="ui-btn ui-btn-danger h-[34px]"
                    >
                      {deletingAccount ? t("settings.deletingAccount") : t("settings.deleteAccount")}
                    </button>
                  </div>
                  <p className="text-[12px] text-on-surface-variant">
                    {t("settings.deleteAccountPasswordHint")}
                  </p>
                </SettingRow>
              </SettingsSection>

              <SaveBar
                show={profileDirty}
                saving={savingProfile}
                saveLabel={t("settings.saveProfile")}
                savingLabel={t("settings.saving")}
                onSave={() => void saveProfile()}
                onDiscard={discardProfile}
              />
            </SettingsPage>
          ) : null}

          {activeTab === "notifications" ? (
            <SettingsPage
              title={t("settings.notifications")}
              description={t("settings.notificationsHint")}
            >
              {notifPrefs ? (
                <>
                  <SettingsSection id="notifications">
                    <SettingRow
                      label={t("settings.notificationsMaster")}
                      hint={t("settings.notificationsMasterHint")}
                    >
                      <Switch
                        label={t("settings.notificationsMaster")}
                        checked={notifPrefs.enabled}
                        disabled={savingNotifs}
                        onChange={() => void patchNotifPrefs({ enabled: !notifPrefs.enabled })}
                      />
                    </SettingRow>
                  </SettingsSection>
                  <SettingsSection title="Categories">
                    {NOTIFICATION_ROWS.map((row) => (
                      <SettingRow key={row.key} label={t(row.label)} hint={t(row.hint)}>
                        <Switch
                          label={t(row.label)}
                          checked={notifPrefs.enabled && notifPrefs[row.key]}
                          disabled={savingNotifs || !notifPrefs.enabled}
                          onChange={() =>
                            void patchNotifPrefs({ [row.key]: !notifPrefs[row.key] })
                          }
                        />
                      </SettingRow>
                    ))}
                  </SettingsSection>
                </>
              ) : (
                <EmptyState icon="notifications" title={t("settings.notificationsLoadError")} />
              )}
            </SettingsPage>
          ) : null}

          {activeTab === "church" && canEditChurch && profile?.church ? (
            <SettingsPage
              title={t("settings.churchProfile")}
              description={t("settings.churchProfileHint")}
            >
              <SettingsSection>
                <SettingRow label={t("settings.churchPhoto")} hint="Shown on the sidebar and projector logo.">
                  <span className="w-10 h-10 rounded-lg overflow-hidden bg-surface-container-highest border border-white/10 flex items-center justify-center">
                    {churchPhotoUrl ? (
                      <img src={churchPhotoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Icon name="church" className="text-[18px] text-on-surface-variant" />
                    )}
                  </span>
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
                    className="ui-btn ui-btn-secondary"
                  >
                    {t("settings.changePhoto")}
                  </button>
                </SettingRow>
                <SettingRow label={t("settings.churchName")} htmlFor="settings-church-name">
                  <input
                    id="settings-church-name"
                    value={churchName}
                    onChange={(event) => setChurchName(event.target.value)}
                    className={fieldClass}
                  />
                </SettingRow>
                <SettingRow label={t("settings.churchAddress")} htmlFor="settings-church-address">
                  <input
                    id="settings-church-address"
                    value={churchAddress}
                    onChange={(event) => setChurchAddress(event.target.value)}
                    className={fieldClass}
                  />
                </SettingRow>
                <SettingRow label={t("settings.churchPhone")} htmlFor="settings-church-phone">
                  <input
                    id="settings-church-phone"
                    value={churchPhone}
                    onChange={(event) => setChurchPhone(event.target.value)}
                    className={fieldClass}
                  />
                </SettingRow>
              </SettingsSection>
              <SaveBar
                show={churchDirty}
                saving={savingChurch}
                saveLabel={t("settings.saveChurch")}
                savingLabel={t("settings.saving")}
                onSave={() => void saveChurch()}
                onDiscard={discardChurch}
              />
            </SettingsPage>
          ) : null}

          {activeTab === "team" && canEditChurch && !superadmin ? (
            <TeamAccountsPanel myUserId={profile?.user?.id ?? ""} />
          ) : null}

          {activeTab === "approvals" && superadmin ? <ApprovalsPanel embedded /> : null}

          {activeTab === "general" ? (
            <SettingsPage
              title={t("settings.appearance")}
              description="Theme, color and interface language for this device and account."
            >
              <SettingsSection>
                <SettingRow label="Theme" hint={t("settings.appearanceHint")}>
                  <Segmented<ThemeName>
                    label="Theme"
                    value={theme}
                    onChange={changeTheme}
                    options={[
                      { id: "dark", label: t("settings.dark") },
                      { id: "light", label: t("settings.light") },
                      { id: "system", label: t("settings.system") },
                    ]}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.language")}
                  hint={t("settings.languageHint")}
                  htmlFor="settings-language"
                >
                  <select
                    id="settings-language"
                    value={language}
                    onChange={(event) => changeLanguage(normalizeLang(event.target.value))}
                    className={fieldClass}
                  >
                    {INTERFACE_LANGUAGES.map((lang) => (
                      <option key={lang.id} value={lang.id}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </SettingRow>
              </SettingsSection>

              <section>
                <div className="mb-3">
                  <h3 className="text-[13px] font-semibold text-on-surface">Color theme</h3>
                  <p className="mt-0.5 text-[12px] text-on-surface-variant">
                    Accent and surface tint for this device. Works in light and dark.
                  </p>
                </div>
                <PaletteGallery value={prefs.palette} onChange={prefs.setPalette} />
              </section>

              {canEditPresentation ? (
                <SettingsSection>
                  <SettingRow
                    label={t("settings.reset")}
                    hint="Theme, language, presentation and backup defaults. Review, then save."
                  >
                    <button type="button" onClick={resetAll} className="ui-btn ui-btn-secondary">
                      <Icon name="undo" className="text-[15px]" />
                      {t("settings.reset")}
                    </button>
                  </SettingRow>
                </SettingsSection>
              ) : null}
            </SettingsPage>
          ) : null}

          {activeTab === "backup" ? (
            <SettingsPage
              title={t("settings.syncBackup")}
              description={`Cloud backups and offline storage for ${profile?.user?.email || "this account"}.`}
            >
              <SettingsSection>
                <SettingRow
                  label={
                    <span className="flex items-center gap-2">
                      <Icon
                        name={syncIcon(sync)}
                        className={`text-[15px] text-primary ${sync.syncing ? "animate-spin" : ""}`}
                      />
                      {syncLabel(sync)}
                    </span>
                  }
                  hint={
                    <>
                      {t("settings.backupHint", {
                        when: formatRelative(sync.lastSyncAt),
                        pending: sync.pending ? t("settings.pending", { n: sync.pending }) : "",
                      })}
                      {sync.error ? <span className="block mt-1 text-error">{sync.error}</span> : null}
                    </>
                  }
                >
                  <button
                    type="button"
                    disabled={backingUp || sync.syncing}
                    onClick={() => void backupNow()}
                    className="ui-btn ui-btn-secondary"
                  >
                    <Icon name="cloud_upload" className="text-[15px]" />
                    {backingUp || sync.syncing ? t("settings.backingUp") : t("settings.backupNow")}
                  </button>
                </SettingRow>
                <SettingRow
                  label={t("settings.backupFreq")}
                  hint={
                    canEditPresentation
                      ? `Applies to ${profile?.church?.name || "your church"}.`
                      : "Set by your church admin."
                  }
                  htmlFor="settings-backup-frequency"
                >
                  <select
                    id="settings-backup-frequency"
                    value={backup}
                    disabled={!canEditPresentation}
                    onChange={(event) => setBackup(event.target.value)}
                    className={`${fieldClass} disabled:opacity-60`}
                  >
                    <option value="15m">{t("settings.every15")}</option>
                    <option value="hourly">{t("settings.hourly")}</option>
                    <option value="daily">{t("settings.daily")}</option>
                  </select>
                </SettingRow>
                <SettingRow label={t("settings.offline")} hint={t("settings.offlineHint")}>
                  <span className="text-[12px] text-on-surface-variant tabular-nums">{storageLabel}</span>
                  <span className="w-24 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                    <span
                      className="block bg-primary h-full transition-[width] duration-500 ease-out"
                      style={{ width: `${storagePct}%` }}
                    />
                  </span>
                </SettingRow>
              </SettingsSection>
            </SettingsPage>
          ) : null}

          {activeTab === "presentation" && canEditPresentation ? (
            <SettingsPage
              title={t("settings.presentation")}
              description={t("settings.lyricsFontHint")}
            >
              <SettingsSection title="Lyrics">
                <SettingRow label={t("settings.lyricsFont")} htmlFor="settings-font">
                  <select
                    id="settings-font"
                    value={font}
                    onChange={(event) => setFont(event.target.value)}
                    className={fieldClass}
                  >
                    {STAGE_FONTS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                        {option.id === DEFAULT_STAGE_FONT ? ` ${t("settings.fontDefault")}` : ""}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Text size" hint="Preset or exact pixel size on the projector.">
                  <TextSizePicker value={lyricSize} onChange={setLyricSize} />
                </SettingRow>
                <SettingRow label="Text style">
                  <TextStylePicker value={lyricStyle} onChange={setLyricStyle} />
                </SettingRow>
              </SettingsSection>

              <SettingsSection title="Projection">
                <SettingRow label={t("settings.transition")} htmlFor="settings-transition">
                  <select
                    id="settings-transition"
                    value={transition}
                    onChange={(event) => setTransition(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="dissolve">{t("settings.dissolve")}</option>
                    <option value="wipe">{t("settings.wipe")}</option>
                    <option value="cut">{t("settings.cut")}</option>
                  </select>
                </SettingRow>
                <SettingRow label={t("settings.outputDisplay")} htmlFor="settings-output">
                  <select
                    id="settings-output"
                    value={displayId}
                    onChange={(event) => setDisplayId(event.target.value)}
                    className={fieldClass}
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
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                title={t("settings.stageBackground")}
                description={t("settings.stageBackgroundHint")}
              >
                <div className="p-4 [&_.grid]:!grid-cols-4 sm:[&_.grid]:!grid-cols-6">
                  <StageBackgroundPicker value={stageBackground} onChange={setStageBackground} />
                </div>
              </SettingsSection>

              <SettingsSection>
                <SettingRow
                  label={t("settings.reset")}
                  hint="Font, size, style, background and transition. Review, then save."
                >
                  <button type="button" onClick={resetPresentation} className="ui-btn ui-btn-secondary">
                    <Icon name="undo" className="text-[15px]" />
                    {t("settings.reset")}
                  </button>
                </SettingRow>
              </SettingsSection>
            </SettingsPage>
          ) : null}

          {settingsBar ? (
            <SaveBar
              show={dirty}
              saving={saving}
              saveLabel={t("settings.save")}
              savingLabel={t("settings.saving")}
              onSave={() => void save()}
              onDiscard={discardSettings}
            />
          ) : null}
          <div className="h-10" aria-hidden />
        </div>
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
