import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

function placeholderFor(pathname: string) {
  if (pathname.startsWith("/sermon")) return "Search sermons, scriptures, or tags...";
  if (pathname.startsWith("/songs")) return "Search Library";
  if (pathname.startsWith("/categories")) return "Search categories or resources...";
  if (pathname.startsWith("/settings")) return "Search settings...";
  if (pathname.startsWith("/dashboard")) return "Search songs, setlists, or themes...";
  return "Search service items...";
}

export default function PrivateLayout() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-full w-full bg-[#050505] text-on-surface">
      <Sidebar />

      <div className="ml-[260px] w-[calc(100%-260px)] h-screen min-w-0 flex flex-col overflow-hidden">
        <Header searchPlaceholder={placeholderFor(pathname)} />
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
