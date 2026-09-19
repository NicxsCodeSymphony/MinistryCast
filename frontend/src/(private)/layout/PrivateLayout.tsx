import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import KeepAliveOutlet from "../../components/KeepAliveOutlet";
import { SearchProvider, useSearch } from "../../lib/SearchContext";
import { ProfileProvider } from "../../lib/ProfileContext";
import { PrefsProvider, usePrefs } from "../../lib/PrefsContext";
import Sidebar, { readCollapsed } from "../components/Sidebar";
import Header from "../components/Header";

function placeholderFor(pathname: string, t: (key: string) => string) {
  if (pathname.startsWith("/sermon")) return t("header.searchSermons");
  if (pathname.startsWith("/songs")) return t("header.searchSongs");
  if (pathname.startsWith("/categories")) return t("header.searchCategories");
  if (pathname.startsWith("/setlists")) return t("header.searchSetlists");
  if (pathname.startsWith("/settings")) return t("header.searchSettings");
  if (pathname.startsWith("/admin/audit")) return t("header.searchAudit");
  if (pathname.startsWith("/admin/accounts")) return t("header.searchAccounts");
  if (pathname.startsWith("/admin/churches")) return t("header.searchChurches");
  if (pathname.startsWith("/admin")) return t("header.searchRequests");
  return t("header.search");
}

function LayoutBody() {
  const { pathname } = useLocation();
  const { setQuery } = useSearch();
  const { t } = usePrefs();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const liveMode = pathname.startsWith("/live");
  const sidebarW = collapsed ? 72 : 260;

  useEffect(() => {
    setQuery("");
  }, [pathname, setQuery]);

  // One KeepAliveOutlet for all routes — swapping trees on /live was wiping
  // the page cache and forcing Dashboard / Setlists / etc. to refetch.
  return (
    <div
      className={
        liveMode
          ? "h-screen w-full bg-surface-container-lowest text-on-surface overflow-hidden"
          : "flex min-h-full w-full bg-surface-container-lowest text-on-surface"
      }
    >
      {!liveMode ? (
        <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
      ) : null}

      <div
        className={
          liveMode
            ? "h-full w-full min-w-0 flex flex-col overflow-hidden"
            : "h-screen min-w-0 flex flex-col overflow-hidden transition-[margin,width] duration-300 ease-out"
        }
        style={
          liveMode
            ? undefined
            : {
                marginLeft: sidebarW,
                width: `calc(100% - ${sidebarW}px)`,
              }
        }
      >
        {!liveMode ? (
          <Header
            searchPlaceholder={placeholderFor(pathname, t)}
            pageTitle={
              pathname.startsWith("/settings") ? t("nav.settings") : undefined
            }
          />
        ) : null}
        <div className="flex-1 min-h-0 overflow-hidden isolate">
          <KeepAliveOutlet />
        </div>
      </div>
    </div>
  );
}

export default function PrivateLayout() {
  return (
    <PrefsProvider>
      <ProfileProvider>
        <SearchProvider>
          <LayoutBody />
        </SearchProvider>
      </ProfileProvider>
    </PrefsProvider>
  );
}
