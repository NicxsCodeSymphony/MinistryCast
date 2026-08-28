import { useMemo, useState } from "react";
import { newServiceItem, type ServiceItem } from "./serviceItem";

type MediaKind = "VIDEO" | "IMAGE";
type MediaTab = "all" | "backgrounds" | "videos" | "images";

type CatalogMedia = {
  id: string;
  name: string;
  kind: MediaKind;
  category: "backgrounds" | "videos" | "images";
  meta: string;
  duration?: string;
  processing?: boolean;
  progress?: number;
  gradient: string;
};

const catalog: CatalogMedia[] = [
  {
    id: "ocean",
    name: "Ocean_Waves_Loop.mp4",
    kind: "VIDEO",
    category: "videos",
    meta: "4K • 0:45",
    duration: "00:45",
    gradient: "from-cyan-900 via-blue-950 to-slate-950",
  },
  {
    id: "stone",
    name: "Sermon_Blank_Stone.jpg",
    kind: "IMAGE",
    category: "images",
    meta: "1920x1080",
    duration: "02:00",
    gradient: "from-amber-900 via-stone-900 to-black",
  },
  {
    id: "particles",
    name: "Ascend_Particles_V2.mov",
    kind: "VIDEO",
    category: "videos",
    meta: "1080p • 1:20",
    duration: "01:20",
    gradient: "from-violet-900 via-indigo-950 to-black",
  },
  {
    id: "mountains",
    name: "Mountains_Dusk_Wide.png",
    kind: "IMAGE",
    category: "backgrounds",
    meta: "3840x2160",
    duration: "02:00",
    gradient: "from-indigo-950 via-slate-900 to-black",
  },
  {
    id: "welcome",
    name: "Welcome_Loop_Final.mp4",
    kind: "VIDEO",
    category: "videos",
    meta: "1080p",
    duration: "02:00",
    processing: true,
    progress: 66,
    gradient: "from-zinc-800 to-zinc-950",
  },
];

type MediaSelectPanelProps = {
  setlistName: string;
  onBack: () => void;
  onClose: () => void;
  onAdd: (item: ServiceItem) => void;
};

export default function MediaSelectPanel({
  setlistName,
  onBack,
  onClose,
  onAdd,
}: MediaSelectPanelProps) {
  const [tab, setTab] = useState<MediaTab>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>(["ocean"]);

  const visible = useMemo(() => {
    if (tab === "all") return catalog;
    return catalog.filter((item) => item.category === tab);
  }, [tab]);

  const selected = catalog.filter(
    (item) => selectedIds.includes(item.id) && !item.processing,
  );

  const toggle = (item: CatalogMedia) => {
    if (item.processing) return;
    setSelectedIds((prev) =>
      prev.includes(item.id)
        ? prev.filter((id) => id !== item.id)
        : [...prev, item.id],
    );
  };

  const addSelected = () => {
    selected.forEach((item) => {
      onAdd(
        newServiceItem({
          title: item.name.replace(/\.[^.]+$/, "").replace(/_/g, " "),
          subtitle: `${item.kind === "VIDEO" ? "Loop" : "Still"}: ${item.name}`,
          duration: item.duration ?? "02:00",
          label: item.kind === "VIDEO" ? "Media" : "Announcement",
          icon: item.kind === "VIDEO" ? "movie" : "image",
          accent: "tertiary",
        }),
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 text-on-surface-variant hover:text-on-surface transition-colors z-10"
        aria-label="Close"
      >
        <span className="material-symbols-outlined">close</span>
      </button>

      <div className="p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar min-h-0 pb-28">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4 pr-10">
          <div>
            <div className="flex items-center gap-2 text-on-surface-variant mb-2">
              <button
                type="button"
                onClick={onBack}
                className="text-[12px] font-medium hover:text-primary transition-colors"
              >
                {setlistName}
              </button>
              <span className="material-symbols-outlined text-sm">
                chevron_right
              </span>
              <span className="text-[12px] font-medium text-primary">
                Add Media
              </span>
            </div>
            <h2 className="text-[28px] leading-9 md:text-[48px] md:leading-[56px] text-on-surface mb-2 font-bold">
              Media Library
            </h2>
            <p className="text-base text-on-surface-variant">
              Select assets for the current setlist or upload new media.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="bg-[#121212] border border-white/10 hover:bg-white/5 text-on-surface text-sm font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">
                filter_list
              </span>
              Filter
            </button>
            <button
              type="button"
              className="primary-btn-gradient text-white text-sm font-medium py-2 px-6 rounded-lg flex items-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(79,172,254,0.4)]"
            >
              <span className="material-symbols-outlined text-sm">
                cloud_upload
              </span>
              Upload New
            </button>
          </div>
        </div>

        <div className="flex border-b border-white/10 mb-8">
          {(
            [
              ["all", "All Media"],
              ["backgrounds", "Backgrounds"],
              ["videos", "Videos"],
              ["images", "Images"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-6 py-3 text-base transition-colors ${
                tab === id
                  ? "font-medium text-primary border-b-2 border-primary -mb-px"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {visible.map((item) => {
            const isSelected = selectedIds.includes(item.id) && !item.processing;
            if (item.processing) {
              return (
                <div
                  key={item.id}
                  className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden relative"
                >
                  <div className="aspect-video bg-surface-container flex flex-col items-center justify-center gap-3">
                    <span className="material-symbols-outlined text-outline animate-spin text-3xl">
                      progress_activity
                    </span>
                    <span className="text-[12px] font-semibold tracking-[0.05em] text-on-surface-variant">
                      PROCESSING
                    </span>
                  </div>
                  <div className="p-3 opacity-50">
                    <h3 className="text-sm font-medium text-on-surface truncate">
                      {item.name}
                    </h3>
                    <div className="w-full bg-surface-variant h-1 rounded-full mt-2 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${item.progress ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item)}
                className={`rounded-xl overflow-hidden group cursor-pointer relative text-left transition-colors ${
                  isSelected
                    ? "bg-[rgba(18,18,18,0.7)] backdrop-blur-[20px] border border-white/10 ring-2 ring-primary primary-glow"
                    : "bg-[#121212] border border-white/10 hover:bg-surface-container-high"
                }`}
              >
                <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs font-semibold tracking-wider text-white flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">
                    {item.kind === "VIDEO" ? "movie" : "image"}
                  </span>
                  {item.kind}
                </div>
                {isSelected ? (
                  <div className="absolute top-2 right-2 z-10 bg-primary rounded-full w-6 h-6 flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-primary text-[16px] font-bold">
                      check
                    </span>
                  </div>
                ) : null}
                <div
                  className={`aspect-video bg-gradient-to-br ${item.gradient} relative overflow-hidden`}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-medium text-on-surface truncate">
                    {item.name}
                  </h3>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[12px] font-semibold tracking-[0.05em] text-on-surface-variant">
                      {item.meta}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-0 right-0 left-0 p-6 bg-gradient-to-t from-surface-container/95 via-surface-container/80 to-transparent flex justify-end rounded-b-2xl pointer-events-none">
        <div className="pointer-events-auto rounded-xl p-4 flex items-center gap-6 bg-[rgba(18,18,18,0.7)] backdrop-blur-[20px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <div className="text-on-surface-variant text-sm">
            <span className="text-on-surface font-medium">{selected.length}</span>{" "}
            item{selected.length === 1 ? "" : "s"} selected
          </div>
          <button
            type="button"
            onClick={addSelected}
            disabled={!selected.length}
            className="primary-btn-gradient text-white text-base font-medium py-2 px-6 rounded-lg flex items-center gap-2 hover:shadow-[0_0_15px_rgba(79,172,254,0.4)] transition-all disabled:opacity-40"
          >
            Add to Setlist
            <span className="material-symbols-outlined text-sm">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
