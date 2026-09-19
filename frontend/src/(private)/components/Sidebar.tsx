import { NavLink, useNavigate } from "react-router-dom";
import {
  isChurchAdmin,
  isLibraryEditor,
  isSuperadmin,
  signOut,
  type SessionProfile,
} from "../../lib/auth";
import { MinistryCastIcon } from "../../components/icons";
import { usePrefs } from "../../lib/PrefsContext";
import { useProfile } from "../../lib/ProfileContext";

const SIDEBAR_COLLAPSED_KEY = "mc_sidebar_collapsed";

type NavItem = {
  labelKey: string;
  to: string;
  icon: string;
  end?: boolean;
};

/** Core day-of tools — every active role. */
const coreNav: NavItem[] = [
  { labelKey: "nav.dashboard", to: "/dashboard", icon: "dashboard" },
  { labelKey: "nav.setlists", to: "/setlists", icon: "list_alt" },
  { labelKey: "nav.presentation", to: "/live", icon: "present_to_all" },
  { labelKey: "nav.chat", to: "/chat", icon: "forum" },
];

/** Content library — admin + producer (+ superadmin). */
const libraryNav: NavItem[] = [
  { labelKey: "nav.songs", to: "/songs", icon: "music_note" },
  { labelKey: "nav.sermon", to: "/sermon", icon: "menu_book" },
  { labelKey: "nav.categories", to: "/categories", icon: "category" },
];

const settingsNav: NavItem = {
  labelKey: "nav.settings",
  to: "/settings",
  icon: "settings",
};

/** Single platform hub — churches, accounts, approvals, audit live inside. */
const platformNav: NavItem = {
  labelKey: "nav.platform",
  to: "/admin",
  icon: "admin_panel_settings",
  end: true,
};

function NavItemLink({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  const { t } = usePrefs();
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? t(item.labelKey) : undefined}
      className={({ isActive }) =>
        `flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-4"} py-3 rounded-lg ${
          isActive
            ? "border-l-4 border-primary bg-primary/10 text-on-surface font-semibold"
            : "text-on-surface-variant hover:text-on-surface hover:bg-white/5 border-l-4 border-transparent"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`material-symbols-outlined ${isActive ? "filled" : ""}`}
          >
            {item.icon}
          </span>
          {!collapsed ? (
            <span className="text-[16px] leading-6">{t(item.labelKey)}</span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function buildNav(profile: SessionProfile | null): NavItem[] {
  if (!profile?.user) return [...coreNav, settingsNav];
  const items: NavItem[] = [];

  if (isSuperadmin(profile)) {
    items.push(coreNav[0]); // Dashboard first
    items.push(platformNav);
    items.push(...coreNav.slice(1));
    items.push(...libraryNav);
    items.push(settingsNav);
    return items;
  }

  items.push(...coreNav);
  if (isLibraryEditor(profile) || isChurchAdmin(profile)) {
    items.push(...libraryNav);
  }
  items.push(settingsNav);
  return items;
}

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

type SidebarProps = {
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
};

export default function Sidebar({
  collapsed,
  onCollapsedChange,
}: SidebarProps) {
  const navigate = useNavigate();
  const { t } = usePrefs();
  const { profile } = useProfile();

  const superadmin = isSuperadmin(
    profile ?? { authenticated: false, user: null, church: null },
  );
  const items = buildNav(profile);

  const toggle = () => {
    const next = !collapsed;
    onCollapsedChange(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return (
    <aside
      className={`${
        collapsed ? "w-[72px]" : "w-[260px]"
      } h-screen fixed left-0 top-0 bg-surface-container/70 backdrop-blur-xl border-r border-white/10 flex flex-col py-6 z-50 transition-[width] duration-300 ease-out`}
    >
      <div
        className={`mb-6 flex items-center ${
          collapsed ? "px-2 justify-center" : "px-4 justify-between gap-2"
        }`}
      >
        <div
          className={`flex items-center min-w-0 ${collapsed ? "" : "gap-3 px-2"}`}
        >
          <MinistryCastIcon width={40} height={40} />
          {!collapsed ? (
            <div className="min-w-0">
              <h1 className="text-[24px] leading-8 font-bold text-primary truncate">
                MinistryCast
              </h1>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant opacity-60">
                {superadmin ? t("brand.superadmin") : t("brand.subtitle")}
              </p>
            </div>
          ) : null}
        </div>
        {!collapsed ? (
          <button
            type="button"
            onClick={toggle}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-white/5 hover:text-on-surface shrink-0"
            title="Minimize sidebar"
            aria-label="Minimize sidebar"
          >
            <span className="material-symbols-outlined text-[20px]">
              left_panel_close
            </span>
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <div className="px-2 mb-4 flex justify-center">
          <button
            type="button"
            onClick={toggle}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <span className="material-symbols-outlined text-[20px]">
              left_panel_open
            </span>
          </button>
        </div>
      ) : null}

      <nav className="flex-1 px-2 space-y-1 overflow-y-auto custom-scrollbar">
        {items.map((item) => (
          <NavItemLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="px-2 mt-auto pt-4 border-t border-white/5">
        <button
          type="button"
          title={collapsed ? t("nav.signOut") : undefined}
          onClick={() => {
            void (async () => {
              await signOut();
              navigate("/", { replace: true });
            })();
          }}
          className={`w-full flex items-center ${
            collapsed ? "justify-center px-2" : "gap-3 px-4"
          } py-3 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 border-l-4 border-transparent`}
        >
          <span className="material-symbols-outlined">logout</span>
          {!collapsed ? (
            <span className="text-[16px] leading-6">{t("nav.signOut")}</span>
          ) : null}
        </button>
      </div>
    </aside>
  );
}

export { readCollapsed, SIDEBAR_COLLAPSED_KEY };
