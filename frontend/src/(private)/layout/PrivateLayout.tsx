import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import AnimatedOutlet from "../../components/AnimatedOutlet";
import { SearchProvider, useSearch } from "../../lib/SearchContext";
import { usePrefs } from "../../lib/PrefsContext";
import Sidebar from "../components/Sidebar";
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

  useEffect(() => {
    setQuery("");
  }, [pathname, setQuery]);

  return (
    <div className="flex min-h-full w-full bg-surface-container-lowest text-on-surface">
      <Sidebar />

      <div className="ml-[260px] w-[calc(100%-260px)] h-screen min-w-0 flex flex-col overflow-hidden">
        <Header
          searchPlaceholder={placeholderFor(pathname, t)}
          pageTitle={pathname.startsWith("/settings") ? t("nav.settings") : undefined}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatedOutlet />
        </div>
      </div>
    </div>
  );
}

export default function PrivateLayout() {
  return (
    <SearchProvider>
      <LayoutBody />
    </SearchProvider>
  );
}
