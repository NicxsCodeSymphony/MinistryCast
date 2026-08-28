import { NavLink } from "react-router-dom";

type NavItem = {
  label: string;
  to: string;
  icon: string;
  end?: boolean;
};

const primaryNav: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: "dashboard" },
  { label: "Setlists", to: "/setlists", icon: "list_alt" },
  { label: "Songs", to: "/songs", icon: "music_note" },
  { label: "Presentation", to: "/live", icon: "present_to_all" },
  { label: "Categories", to: "/categories", icon: "category" },
  { label: "Settings", to: "/settings", icon: "settings" },
];

const secondaryNav: NavItem[] = [
  { label: "Help", to: "/", icon: "help" },
  { label: "Support", to: "/", icon: "contact_support" },
];

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
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
          <span className="text-[16px] leading-6">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="w-[260px] h-screen fixed left-0 top-0 bg-surface-container/70 backdrop-blur-xl border-r border-white/10 flex flex-col py-6 z-50">
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined filled text-on-primary text-[22px]">
            church
          </span>
        </div>
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold text-primary leading-none truncate">
            MinistryCast
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant opacity-60">
            Production Suite
          </p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
        {primaryNav.map((item) => (
          <NavItemLink key={item.label} item={item} />
        ))}
      </nav>

      <div className="px-4 mt-auto space-y-1 pt-4 border-t border-white/5">
        {secondaryNav.map((item) => (
          <NavItemLink key={item.label} item={item} />
        ))}
      </div>
    </aside>
  );
}
