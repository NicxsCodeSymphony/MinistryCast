import { useState } from "react";
import AddServiceItemModal from "../../components/modals/AddServiceItemModal";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import SetlistFormModal, {
  type SetlistFormValues,
} from "../../components/modals/SetlistFormModal";
import type { ServiceItem } from "../../components/modals/serviceItem";

const initialItems: ServiceItem[] = [
  {
    id: "1",
    title: "Service Intro & Announcements",
    subtitle: "Host: Pastor David • Loop: Sunday_Welcome.mp4",
    duration: "02:00",
    label: "Announcement",
    icon: "campaign",
    accent: "tertiary",
  },
  {
    id: "2",
    title: "Way Maker",
    subtitle: "Leeland • V1 - C1 - V2 - C2 - B - C3 - Outro",
    duration: "06:30",
    label: "Song",
    icon: "music_note",
    accent: "primary",
    border: "primary",
    keyBadge: "Key: B",
  },
  {
    id: "3",
    title: "Scripture Reading: Psalm 23",
    subtitle: "Read by: Sarah Jenkins • Layout: Lower Thirds",
    duration: "01:30",
    label: "Verse",
    icon: "menu_book",
    accent: "secondary",
  },
  {
    id: "4",
    title: "The Blessing",
    subtitle: "Elevation Worship • Standard Arrangement",
    duration: "05:00",
    label: "Song",
    icon: "music_note",
    accent: "primary",
    border: "primary",
    keyBadge: "Key: G",
  },
  {
    id: "5",
    title: "Sermon: The Heart of Worship",
    subtitle: "Speaker: Pastor David • Scripture: John 4:23-24",
    duration: "35:00",
    label: "Sermon",
    icon: "record_voice_over",
    accent: "tertiary",
    border: "tertiary",
    durationTone: "tertiary",
  },
];

const libraryQuickAdd = [
  { title: "Graves Into Gardens", artist: "Elevation Worship" },
  { title: "Lion and the Lamb", artist: "Bethel Music" },
  { title: "Great Are You Lord", artist: "All Sons & Daughters" },
];

const accentIcon: Record<ServiceItem["accent"], string> = {
  tertiary: "bg-tertiary/10 text-tertiary",
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
};

const borderAccent: Record<NonNullable<ServiceItem["border"]>, string> = {
  primary: "border-l-4 border-primary",
  tertiary: "border-l-4 border-tertiary",
};

export default function Setlists() {
  const [meta, setMeta] = useState({
    name: "Sunday Morning Worship (Aug 20)",
    dateLabel: "Sunday, Aug 20, 2023 • 9:00 AM",
    duration: "Est. 60:00 Total",
    serviceType: "Sunday Morning Service",
    date: "2023-08-20",
  });
  const [items, setItems] = useState(initialItems);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const applySetlist = (values: SetlistFormValues, isCreate: boolean) => {
    const dateLabel = values.date
      ? new Date(`${values.date}T00:00:00`).toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : meta.dateLabel;
    setMeta({
      name: values.name.trim(),
      dateLabel,
      duration: values.duration ? `Est. ${values.duration}` : meta.duration,
      serviceType: values.serviceType,
      date: values.date || meta.date,
    });
    if (isCreate) setDeleted(false);
    setFormOpen(false);
  };

  return (
    <section className="h-full overflow-y-auto custom-scrollbar relative pb-20">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-end">
          <div className="min-w-0">
            <nav className="flex flex-wrap gap-2 text-xs text-on-surface-variant mb-2">
              <span>Setlists</span>
              <span>/</span>
              <span className="text-on-surface">{meta.name}</span>
            </nav>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] leading-10 font-semibold tracking-[-0.01em] text-on-surface">
              {deleted ? "No active setlist" : meta.name}
            </h2>
            {deleted ? (
              <p className="text-on-surface-variant text-sm mt-2">
                Create a new setlist to start building your service flow.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
                  <span className="material-symbols-outlined text-[14px]">
                    calendar_today
                  </span>
                  {meta.dateLabel}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high text-on-surface-variant text-xs font-medium">
                  <span className="material-symbols-outlined text-[14px]">
                    timer
                  </span>
                  {meta.duration}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setFormMode("create");
                setFormOpen(true);
              }}
              className="flex items-center gap-2 glow-button text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Setlist
            </button>
            <button
              type="button"
              className="flex items-center gap-2 bg-surface-container border border-white/10 px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">
                share
              </span>
              Share
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 bg-surface-container border border-white/10 px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-container-high transition-colors"
                aria-label="More setlist actions"
              >
                <span className="material-symbols-outlined text-[18px]">
                  more_horiz
                </span>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 mt-2 w-44 glass-modal rounded-xl py-1 z-20 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setFormMode("edit");
                      setFormOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-on-surface hover:bg-white/5"
                  >
                    Edit Setlist
                  </button>
                  <button
                    type="button"
                    disabled={deleted}
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-error hover:bg-white/5 disabled:opacity-40"
                  >
                    Delete Setlist
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8">
          <div className="xl:col-span-8">
            {items.map((item, index) => (
              <div key={item.id} className="group relative">
                <div
                  className={`glass-panel rounded-xl p-4 flex items-center gap-3 sm:gap-4 transition-all mb-1 hover:shadow-[0_0_15px_rgba(155,203,255,0.15)] hover:border-primary/30 ${
                    item.border ? borderAccent[item.border] : ""
                  }`}
                >
                  <div className="text-on-surface-variant opacity-40 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0">
                    <span className="material-symbols-outlined">
                      drag_indicator
                    </span>
                  </div>
                  <div
                    className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${
                      item.border === "tertiary"
                        ? "bg-tertiary/20 text-tertiary"
                        : accentIcon[item.accent]
                    }`}
                  >
                    <span className="material-symbols-outlined">
                      {item.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-on-surface truncate">
                        {item.title}
                      </h4>
                      {item.keyBadge ? (
                        <span className="px-1.5 py-0.5 rounded bg-surface-variant text-[10px] font-bold shrink-0">
                          {item.keyBadge}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-on-surface-variant truncate">
                      {item.subtitle}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm font-mono ${
                        item.durationTone === "tertiary"
                          ? "text-tertiary"
                          : "text-primary"
                      }`}
                    >
                      {item.duration}
                    </div>
                    <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                      {item.label}
                    </div>
                  </div>
                </div>
                {index < items.length - 1 ? (
                  <div className="transition-line" />
                ) : null}
              </div>
            ))}

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setAddItemOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-surface-container-high border border-dashed border-white/20 rounded-xl hover:border-primary/50 hover:bg-surface-container-highest transition-all group"
              >
                <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">
                  add_circle
                </span>
                <span className="text-sm font-medium">Add Service Item</span>
              </button>
            </div>
          </div>

          <div className="xl:col-span-4 space-y-6">
            <div className="glass-panel rounded-2xl p-6 ambient-shadow">
              <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant mb-4 flex justify-between items-center">
                Library Quick-Add
                <span className="material-symbols-outlined text-sm">
                  library_music
                </span>
              </h3>
              <div className="space-y-3">
                {libraryQuickAdd.map((song) => (
                  <div
                    key={song.title}
                    className="p-3 bg-surface-container-low rounded-lg border border-white/5 flex items-center justify-between group cursor-pointer hover:border-primary/30 transition-all"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {song.title}
                      </p>
                      <p className="text-[10px] text-on-surface-variant">
                        {song.artist}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="material-symbols-outlined opacity-0 group-hover:opacity-100 text-primary transition-opacity shrink-0"
                    >
                      add
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="w-full mt-4 text-xs text-primary font-semibold py-2 hover:underline"
              >
                View Full Music Library
              </button>
            </div>

            <div className="glass-panel rounded-2xl p-6 ambient-shadow bg-primary/5">
              <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary mb-4">
                Flow Analysis
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-on-surface-variant">
                    Musical Energy
                  </span>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-4 bg-primary rounded-full" />
                    <div className="w-1.5 h-4 bg-primary rounded-full" />
                    <div className="w-1.5 h-4 bg-primary rounded-full" />
                    <div className="w-1.5 h-4 bg-primary/20 rounded-full" />
                    <div className="w-1.5 h-4 bg-primary/20 rounded-full" />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-on-surface-variant">
                    Transition Pacing
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-tertiary/30 text-tertiary rounded">
                    Moderate
                  </span>
                </div>
                <div className="h-2 bg-surface-container rounded-full overflow-hidden flex">
                  <div className="h-full bg-primary" style={{ width: "25%" }} />
                  <div className="h-full bg-tertiary" style={{ width: "65%" }} />
                  <div
                    className="h-full bg-secondary"
                    style={{ width: "10%" }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-on-surface-variant">
                  <span>25% Worship</span>
                  <span>65% Sermon</span>
                  <span>10% Word</span>
                </div>
              </div>
            </div>

            <div className="relative group rounded-2xl overflow-hidden aspect-video border border-white/10 cursor-pointer bg-surface-container">
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a2744] via-[#2a1a44] to-[#0a0a12] transition-all duration-500 group-hover:brightness-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">
                    play_circle
                  </span>
                  <span className="text-xs font-medium">
                    Preview Service Flow
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 sm:bottom-6 left-[calc(260px+16px)] right-4 sm:left-[calc(260px+24px)] sm:right-6 h-12 glass-panel rounded-full flex items-center px-4 sm:px-6 gap-3 sm:gap-6 z-30">
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-xs font-mono font-bold truncate">
            LIVE: PRE-SERVICE LOOP
          </span>
        </div>
        <div className="flex-1 h-1 bg-surface-container rounded-full overflow-hidden relative min-w-0 hidden sm:block">
          <div className="absolute inset-y-0 left-0 bg-primary w-1/4" />
        </div>
        <div className="flex items-center gap-3 sm:gap-4 border-l border-white/10 pl-4 sm:pl-6 shrink-0">
          <button
            type="button"
            className="material-symbols-outlined text-on-surface-variant hover:text-on-surface text-[22px]"
          >
            skip_previous
          </button>
          <button
            type="button"
            className="material-symbols-outlined text-primary bg-primary/10 p-1 rounded-full text-[22px]"
          >
            play_arrow
          </button>
          <button
            type="button"
            className="material-symbols-outlined text-on-surface-variant hover:text-on-surface text-[22px]"
          >
            skip_next
          </button>
        </div>
      </div>

      <AddServiceItemModal
        open={addItemOpen}
        setlistName={meta.name}
        onClose={() => setAddItemOpen(false)}
        onAdd={(item) => {
          setItems((prev) => [...prev, item]);
          setDeleted(false);
          setAddItemOpen(false);
        }}
      />

      <SetlistFormModal
        open={formOpen}
        mode={formMode}
        initialValues={
          formMode === "edit"
            ? {
                name: meta.name,
                date: meta.date,
                duration: meta.duration.replace(/^Est\.\s*/, ""),
                serviceType: meta.serviceType,
              }
            : undefined
        }
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => applySetlist(values, formMode === "create")}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Setlist?"
        description={`Are you sure you want to delete "${meta.name}"? This action cannot be undone.`}
        highlight={`"${meta.name}"`}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleted(true);
          setDeleteOpen(false);
        }}
      />
    </section>
  );
}
