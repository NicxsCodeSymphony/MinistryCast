type HeaderProps = {
  searchPlaceholder?: string;
};

export default function Header({
  searchPlaceholder = "Search service items...",
}: HeaderProps) {
  return (
    <header className="h-16 shrink-0 sticky top-0 z-40 bg-surface/50 backdrop-blur-lg border-b border-white/5 flex justify-between items-center gap-4 px-4 sm:px-6">
      <div className="flex items-center gap-4 lg:gap-8 min-w-0 flex-1">
        <div className="relative group w-full max-w-md min-w-0">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
            search
          </span>
          <input
            className="w-full bg-surface-container border border-white/10 rounded-full pl-10 pr-4 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/40"
            placeholder={searchPlaceholder}
            type="text"
          />
        </div>

        <nav className="hidden md:flex gap-6 items-center shrink-0">
          <a
            className="text-sm text-on-surface-variant hover:text-primary transition-colors whitespace-nowrap"
            href="#"
          >
            Live View
          </a>
          <a
            className="text-sm text-on-surface-variant hover:text-primary transition-colors whitespace-nowrap"
            href="#"
          >
            Stage Monitor
          </a>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-surface-container rounded-full text-xs text-on-surface-variant">
          <span className="material-symbols-outlined filled text-primary text-[16px]">
            cloud_done
          </span>
          <span>Sync Status</span>
        </div>

        <button
          type="button"
          className="bg-gradient-to-r from-primary to-secondary text-on-primary px-3 sm:px-4 py-1.5 rounded-full text-sm font-semibold hover:opacity-90 active:scale-95 transition-all whitespace-nowrap"
        >
          Start Presentation
        </button>

        <button
          type="button"
          className="p-2 text-on-surface-variant hover:text-on-surface"
        >
          <span className="material-symbols-outlined">notifications</span>
        </button>

        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-surface-container-high shrink-0">
          <div className="w-full h-full bg-gradient-to-br from-primary/40 to-secondary/40" />
        </div>
      </div>
    </header>
  );
}
