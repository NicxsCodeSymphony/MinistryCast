import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useSearch } from "../../lib/SearchContext";
import { forceSync } from "../../lib/offline/sync";
import { syncIcon, syncLabel } from "../../lib/offline/status";
import { useSyncStatus } from "../../lib/offline/useSyncStatus";
import { usePrefs } from "../../lib/PrefsContext";

type HeaderProps = {
  searchPlaceholder?: string;
  pageTitle?: string;
};

export default function Header({ searchPlaceholder, pageTitle }: HeaderProps) {
  const sync = useSyncStatus();
  const { query, setQuery } = useSearch();
  const { t } = usePrefs();
  const placeholder = searchPlaceholder ?? t("header.search");
  const pageMode = Boolean(pageTitle);

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

        <button
          type="button"
          className="p-2 text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined">notifications</span>
        </button>

        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-surface-variant shrink-0">
          <div className="w-full h-full bg-gradient-to-br from-primary/40 to-secondary/40" />
        </div>
      </div>
    </header>
  );
}
