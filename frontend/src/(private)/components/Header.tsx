import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSearch } from "../../lib/SearchContext";
import { forceSync } from "../../lib/offline/sync";
import { syncIcon, syncLabel } from "../../lib/offline/status";
import { useSyncStatus } from "../../lib/offline/useSyncStatus";
import { usePrefs } from "../../lib/PrefsContext";
import { useProfile } from "../../lib/ProfileContext";
import { readCachedSessionProfile } from "../../lib/auth";
import {
  kindIcon,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "../../lib/notifications";
import { supabase } from "../../lib/supabase";

type HeaderProps = {
  searchPlaceholder?: string;
  pageTitle?: string;
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function Header({ searchPlaceholder, pageTitle }: HeaderProps) {
  const sync = useSyncStatus();
  const { query, setQuery } = useSearch();
  const { t } = usePrefs();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const placeholder = searchPlaceholder ?? t("header.search");
  const pageMode = Boolean(pageTitle);
  // Fall back to localStorage cache so a photo shows even before RPC refresh.
  const avatarUrl =
    profile?.user?.avatar_url ||
    readCachedSessionProfile()?.user?.avatar_url ||
    null;
  const userId = profile?.user?.id ?? null;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const unread = items.filter((n) => !n.read_at).length;

  const reload = async () => {
    try {
      const rows = await listMyNotifications(40);
      setItems(rows);
    } catch {
      /* ignore offline / missing migration */
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }
      if (pageMode) return;
      event.preventDefault();
      document.getElementById("app-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageMode]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }
    void reload();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as AppNotification;
          setItems((prev) => [row, ...prev.filter((n) => n.id !== row.id)].slice(0, 40));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const openItem = async (item: AppNotification) => {
    if (!item.read_at) {
      setItems((prev) =>
        prev.map((n) =>
          n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
      void markNotificationRead(item.id).catch(() => undefined);
    }
    setOpen(false);
    if (!item.href && item.kind !== "chat") return;

    // Legacy hash tabs fight HashRouter; map to query tabs.
    let href = (item.href || "/chat")
      .replace(/^\/settings#approvals$/, "/settings?tab=approvals")
      .replace(/^\/settings#team$/, "/settings?tab=team")
      .replace(
        /^\/settings#(notifications|general)$/,
        "/settings?tab=notifications",
      );

    // Join requests: church admins use Team Accounts (Approvals is superadmin-only).
    const isJoinRequest =
      item.title === "notif.joinRequest" ||
      href === "/settings?tab=approvals" ||
      href.endsWith("tab=approvals");
    if (
      isJoinRequest &&
      profile?.user?.role !== "superadmin" &&
      (href.includes("tab=approvals") || href.includes("#approvals"))
    ) {
      href = "/settings?tab=team";
    }

    // Chat: open the exact thread (channel id) or the sender's DM (peer).
    if (item.kind === "chat" || href.startsWith("/chat")) {
      try {
        const url = new URL(href, "http://local");
        const hasChannel = Boolean(url.searchParams.get("channel")?.trim());
        const hasPeer = Boolean(url.searchParams.get("peer")?.trim());
        if (!hasChannel && !hasPeer && item.actor_id) {
          url.searchParams.set("peer", item.actor_id);
          href = `${url.pathname}?${url.searchParams.toString()}`;
        } else {
          href = `${url.pathname}${url.search}`;
        }
      } catch {
        if (item.actor_id && (href === "/chat" || href.startsWith("/chat?"))) {
          href = `/chat?peer=${encodeURIComponent(item.actor_id)}`;
        }
      }
    }

    navigate(href);
  };

  const markAll = async () => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
    );
    void markAllNotificationsRead().catch(() => undefined);
  };

  return (
    <header className="h-16 shrink-0 sticky top-0 z-40 bg-surface/50 backdrop-blur-lg border-b border-white/5 flex justify-between items-center gap-4 px-4 sm:px-8">
      <div className="flex items-center gap-4 lg:gap-8 min-w-0 flex-1">
        {pageMode ? (
          <span className="text-on-surface text-2xl font-semibold tracking-tight">
            {pageTitle}
          </span>
        ) : (
          <>
            <div className="relative group w-full max-w-md min-w-0">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                search
              </span>
              <input
                id="app-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("");
                }}
                className="w-full bg-surface-container border border-white/10 rounded-full pl-10 pr-10 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/40"
                placeholder={placeholder}
                type="search"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  aria-label={t("header.clearSearch")}
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              ) : (
                <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-on-surface-variant/50 font-mono">
                  ⌘K
                </kbd>
              )}
            </div>

            <nav className="hidden md:flex gap-6 items-center shrink-0">
              <Link
                className="text-sm text-on-surface-variant hover:text-primary transition-colors whitespace-nowrap"
                to="/live"
              >
                {t("header.liveView")}
              </Link>
              <Link
                className="text-sm text-on-surface-variant hover:text-primary transition-colors whitespace-nowrap"
                to="/live"
              >
                {t("header.stageMonitor")}
              </Link>
            </nav>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {pageMode ? (
          <button
            type="button"
            disabled={sync.syncing}
            onClick={() => void forceSync().catch(() => undefined)}
            className="p-2 text-on-surface-variant hover:text-primary transition-colors disabled:opacity-60"
            title={
              sync.error ||
              (sync.online ? t("header.backupNow") : t("header.offline"))
            }
            aria-label={syncLabel(sync)}
          >
            <span
              className={`material-symbols-outlined ${
                sync.syncing ? "animate-spin" : ""
              }`}
            >
              {sync.syncing ? syncIcon(sync) : sync.error ? "cloud_off" : "cloud_done"}
            </span>
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={sync.syncing}
              onClick={() => void forceSync().catch(() => undefined)}
              className="hidden sm:flex items-center gap-2 px-3 py-1 bg-surface-container rounded-full text-xs text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-60"
              title={
                sync.error ||
                (sync.online ? t("header.backupNow") : t("header.offline"))
              }
            >
              <span
                className={`material-symbols-outlined filled text-primary text-[16px] ${
                  sync.syncing ? "animate-spin" : ""
                }`}
              >
                {syncIcon(sync)}
              </span>
              <span>{syncLabel(sync)}</span>
            </button>

            <Link
              to="/live"
              className="bg-gradient-to-r from-primary to-secondary text-on-primary px-3 sm:px-4 py-1.5 rounded-full text-sm font-semibold hover:opacity-90 active:scale-95 transition-all whitespace-nowrap"
            >
              {t("header.startPresentation")}
            </Link>
          </>
        )}

        <div className="relative" ref={panelRef}>
          <button
            type="button"
            className="relative p-2 text-on-surface-variant hover:text-primary transition-colors"
            aria-label={t("header.notifications")}
            aria-expanded={open}
            onClick={() => {
              setOpen((v) => !v);
              if (!open) void reload();
            }}
          >
            <span className="material-symbols-outlined">notifications</span>
            {unread > 0 ? (
              <span className="absolute top-1.5 right-1.5 min-w-[8px] h-2 rounded-full bg-primary" />
            ) : null}
          </button>

          {open ? (
            <div className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-white/10 bg-surface-container-high shadow-2xl overflow-hidden z-50">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/5">
                <p className="text-sm font-semibold text-on-surface">
                  {t("header.notifications")}
                </p>
                {unread > 0 ? (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => void markAll()}
                  >
                    {t("header.markAllRead")}
                  </button>
                ) : null}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {items.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-center text-on-surface-variant">
                    {t("header.notificationsEmpty")}
                  </p>
                ) : (
                  items.map((item) => {
                    const showAvatar =
                      item.kind === "chat" && Boolean(item.actor_avatar_url);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void openItem(item)}
                        className={`w-full flex gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${
                          item.read_at ? "opacity-70" : ""
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-surface-variant border border-white/10 flex items-center justify-center">
                          {showAvatar ? (
                            <img
                              src={item.actor_avatar_url!}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                              {item.icon || kindIcon(item.kind)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-on-surface truncate">
                              {item.title.startsWith("notif.")
                                ? t(item.title)
                                : item.title}
                            </p>
                            <span className="text-[10px] text-on-surface-variant shrink-0">
                              {timeAgo(item.created_at)}
                            </span>
                          </div>
                          <p className="text-xs text-on-surface-variant line-clamp-2 mt-0.5">
                            {item.title === "notif.memberDeleted"
                              ? t("notif.memberDeletedBody", {
                                  name: item.body,
                                })
                              : item.title === "notif.joinApproved"
                                ? t("notif.joinApprovedBody", {
                                    name: item.body,
                                  })
                                : item.body}
                          </p>
                        </div>
                        {!item.read_at ? (
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="px-4 py-2 border-t border-white/5">
                <Link
                  to="/settings?tab=notifications"
                  onClick={() => setOpen(false)}
                  className="text-xs text-on-surface-variant hover:text-primary"
                >
                  {t("header.notificationSettings")}
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-surface-variant shrink-0">
          {avatarUrl ? (
            <img
              key={avatarUrl}
              src={avatarUrl}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/40 to-secondary/40" />
          )}
        </div>
      </div>
    </header>
  );
}
