import { NavLink, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  getSessionProfile,
  isSuperadmin,
  signOut,
  type SessionProfile,
} from "../../lib/auth";
import { MinistryCastIcon } from "../../components/icons";
import { usePrefs } from "../../lib/PrefsContext";

type NavItem = {
  labelKey: string;
  to: string;
  icon: string;
  end?: boolean;
};

const churchNav: NavItem[] = [
  { labelKey: "nav.dashboard", to: "/dashboard", icon: "dashboard" },
  { labelKey: "nav.setlists", to: "/setlists", icon: "list_alt" },
  { labelKey: "nav.songs", to: "/songs", icon: "music_note" },
  { labelKey: "nav.sermon", to: "/sermon", icon: "menu_book" },
  { labelKey: "nav.presentation", to: "/live", icon: "present_to_all" },
  { labelKey: "nav.categories", to: "/categories", icon: "category" },
  { labelKey: "nav.settings", to: "/settings", icon: "settings" },
];

const superadminNav: NavItem[] = [
  { labelKey: "nav.admin", to: "/admin", icon: "admin_panel_settings", end: true },
  { labelKey: "nav.churches", to: "/admin/churches", icon: "church" },
  { labelKey: "nav.accounts", to: "/admin/accounts", icon: "group" },
  { labelKey: "nav.audit", to: "/admin/audit", icon: "policy" },
  { labelKey: "nav.approvals", to: "/admin/approvals", icon: "verified_user" },
];

function NavItemLink({ item }: { item: NavItem }) {
  const { t } = usePrefs();
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg ${
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
          <span className="text-[16px] leading-6">{t(item.labelKey)}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const { t } = usePrefs();
  const [profile, setProfile] = useState<SessionProfile | null>(null);

  useEffect(() => {
    void getSessionProfile().then(setProfile);
  }, []);

  const superadmin = isSuperadmin(
    profile ?? { authenticated: false, user: null, church: null },
  );
  const items = superadmin ? [...superadminNav, ...churchNav] : churchNav;

  return (
    <aside className="w-[260px] h-screen fixed left-0 top-0 bg-surface-container/70 backdrop-blur-xl border-r border-white/10 flex flex-col py-6 z-50">
      <div className="px-6 mb-8 flex items-center gap-3">
        <MinistryCastIcon width={40} height={40} />
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold text-primary leading-none truncate">
            MinistryCast
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant opacity-60">
            {superadmin ? t("brand.superadmin") : t("brand.subtitle")}
          </p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
        {items.map((item) => (
          <NavItemLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="px-4 mt-auto space-y-1 pt-6 border-t border-white/5">
        <Link
          to="/settings#about"
          className="flex items-center gap-3 px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all duration-200"
        >
          <span className="material-symbols-outlined">help</span>
          <span className="text-xs font-medium">{t("nav.help")}</span>
        </Link>
        <Link
          to="/settings#about"
          className="flex items-center gap-3 px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all duration-200"
        >
          <span className="material-symbols-outlined">contact_support</span>
          <span className="text-xs font-medium">{t("nav.support")}</span>
        </Link>
        {profile?.user ? (
          <p className="px-4 py-2 text-xs text-on-surface-variant truncate">
            {profile.user.email}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void (async () => {
              await signOut();
              navigate("/", { replace: true });
            })();
          }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 border-l-4 border-transparent"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="text-[16px] leading-6">{t("nav.signOut")}</span>
        </button>
      </div>
    </aside>
  );
}
