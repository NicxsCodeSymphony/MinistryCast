import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SetlistFormModal from "../../components/modals/SetlistFormModal";
import SongFormModal from "../../components/modals/SongFormModal";

const setlistItems = [
  {
    num: "01",
    title: "Way Maker",
    meta: "Key: E • 68 BPM • 4/4 Time",
    tone: "primary" as const,
  },
  {
    num: "02",
    title: "Goodness of God",
    meta: "Key: Ab • 72 BPM • 3/4 Time",
    tone: "secondary" as const,
  },
  {
    num: "03",
    title: "Scripture Reading",
    meta: "Matthew 5:13-16 • Sermon Intro",
    tone: "muted" as const,
  },
];

const recent = [
  { title: "Youth Night Session", meta: "Last Wednesday • 4 Songs" },
  { title: "Sunday Morning Service", meta: "Oct 22, 2023 • 5 Songs" },
  { title: "Prayer & Worship Night", meta: "Oct 18, 2023 • 8 Songs" },
];

const toneBox: Record<string, string> = {
  primary:
    "bg-primary/20 text-primary group-hover:bg-primary group-hover:text-on-primary",
  secondary:
    "bg-secondary/20 text-secondary group-hover:bg-secondary group-hover:text-on-secondary",
  muted: "bg-surface-variant/20 text-on-surface-variant",
};

export default function Dashboard() {
  const [clock, setClock] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [sessionName, setSessionName] = useState("Sunday Morning Service");
  const [setlistOpen, setSetlistOpen] = useState(false);
  const [setlistMode, setSetlistMode] = useState<"create" | "edit">("create");
  const [songOpen, setSongOpen] = useState(false);

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const show = setTimeout(() => setShowToast(true), 1500);
    const hide = setTimeout(() => setShowToast(false), 5500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  return (
    <section className="h-full overflow-y-auto custom-scrollbar relative px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <header className="mb-8 sm:mb-10 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface mb-1">
            Production Command
          </h2>
          <p className="text-on-surface-variant">
            Good morning, Media Team. All systems are standby.
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end">
          <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold">
            Current Time
          </span>
          <span className="text-2xl font-mono font-semibold text-on-surface">
            {clock || "--:--:--"}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4 sm:gap-6">
        {/* Active setlist */}
        <div className="col-span-12 lg:col-span-8 glass-card rounded-xl p-6 sm:p-8 flex flex-col justify-between min-h-[400px]">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-primary text-[12px] font-semibold tracking-[0.05em] uppercase mb-4">
                <span className="w-2 h-2 bg-primary rounded-full live-pulse" />
                ACTIVE SESSION
              </div>
              <h3 className="text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-[-0.02em] text-on-surface mb-2 leading-tight">
                {sessionName}
              </h3>
              <p className="text-on-surface-variant text-lg">
                Full Worship Experience • Main Sanctuary
              </p>
            </div>
            <div className="bg-surface-container-high px-6 py-4 rounded-2xl text-center border border-white/5 shrink-0 self-start">
              <span className="block text-on-surface-variant text-[10px] uppercase font-bold tracking-tighter mb-1">
                STARTS IN
              </span>
              <span className="text-3xl font-bold font-mono text-secondary">
                45:00
              </span>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            {setlistItems.map((item) => (
              <div
                key={item.num}
                className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5 hover:border-primary/30 transition-all cursor-pointer group"
              >
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold transition-all ${toneBox[item.tone]}`}
                >
                  {item.num}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-[18px] text-on-surface truncate">
                    {item.title}
                  </h4>
                  <p className="text-on-surface-variant text-sm truncate">
                    {item.meta}
                  </p>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant shrink-0">
                  drag_indicator
                </span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex gap-4">
            <Link
              to="/live"
              className="flex-1 bg-primary text-on-primary py-4 rounded-xl font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 primary-glow"
            >
              <span className="material-symbols-outlined filled">
                play_circle
              </span>
              Go Live Now
            </Link>
            <button
              type="button"
              onClick={() => {
                setSetlistMode("edit");
                setSetlistOpen(true);
              }}
              className="px-6 border border-white/10 rounded-xl hover:bg-white/5 transition-all"
              aria-label="Edit setlist"
            >
              <span className="material-symbols-outlined">edit</span>
            </button>
          </div>
        </div>

        {/* Side column */}
        <div className="col-span-12 lg:col-span-4 space-y-4 sm:space-y-6">
          <div className="glass-card rounded-xl p-6">
            <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant mb-4">
              Quick Actions
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSongOpen(true)}
                className="flex flex-col items-center justify-center gap-2 bg-surface-container-high hover:bg-white/10 p-4 rounded-xl border border-white/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">add_box</span>
                </div>
                <span className="text-xs font-semibold">Add New Song</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSetlistMode("create");
                  setSetlistOpen(true);
                }}
                className="flex flex-col items-center justify-center gap-2 bg-surface-container-high hover:bg-white/10 p-4 rounded-xl border border-white/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">queue_music</span>
                </div>
                <span className="text-xs font-semibold">Create Setlist</span>
              </button>
              <Link
                to="/sermon"
                className="col-span-2 flex items-center gap-3 bg-surface-container-high hover:bg-white/10 p-4 rounded-xl border border-white/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-tertiary/10 flex items-center justify-center text-tertiary group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">edit_note</span>
                </div>
                <div className="text-left">
                  <span className="text-xs font-semibold block">
                    Add Sermon
                  </span>
                  <span className="text-[10px] text-on-surface-variant">
                    Transcription mode
                  </span>
                </div>
              </Link>
            </div>
          </div>

          <div className="glass-card rounded-xl p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-400 shrink-0">
              <span className="material-symbols-outlined filled">
                cloud_done
              </span>
            </div>
            <div>
              <h4 className="font-bold text-sm">Sync Status</h4>
              <p className="text-on-surface-variant text-xs">
                All changes synced to cloud
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card rounded-xl p-6 text-center">
              <span className="block text-primary text-3xl font-bold mb-1">
                248
              </span>
              <span className="text-on-surface-variant text-[10px] uppercase font-bold tracking-widest">
                Library Songs
              </span>
            </div>
            <div className="glass-card rounded-xl p-6 text-center">
              <span className="block text-secondary text-3xl font-bold mb-1">
                12
              </span>
              <span className="text-on-surface-variant text-[10px] uppercase font-bold tracking-widest">
                Presentations
              </span>
            </div>
          </div>

          <div className="glass-card rounded-xl p-0 overflow-hidden relative group h-[180px]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a2744] via-[#2a1a44] to-[#0a0a12] opacity-80 group-hover:scale-110 transition-transform duration-1000" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/20 to-transparent p-6 flex flex-col justify-end">
              <span className="text-[10px] uppercase font-bold tracking-widest text-primary mb-1">
                Stage Environment
              </span>
              <h4 className="font-semibold text-[18px]">
                Default Visualizer: Active
              </h4>
            </div>
          </div>
        </div>

        {/* Recent */}
        <div className="col-span-12 glass-card rounded-xl p-6">
          <div className="flex justify-between items-center mb-6 gap-3">
            <h4 className="text-2xl font-semibold text-on-surface">
              Recent Presentations
            </h4>
            <button
              type="button"
              className="text-primary text-sm font-semibold hover:underline shrink-0"
            >
              View All History
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recent.map((item) => (
              <div
                key={item.title}
                className="bg-surface-container-low p-4 rounded-xl border border-white/5 hover:border-white/20 transition-all cursor-pointer flex gap-4 items-center"
              >
                <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-on-surface-variant shrink-0">
                  <span className="material-symbols-outlined">event</span>
                </div>
                <div className="min-w-0">
                  <h5 className="font-bold text-sm truncate">{item.title}</h5>
                  <p className="text-on-surface-variant text-xs">{item.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`fixed bottom-6 right-6 transition-all duration-500 z-50 ${
          showToast
            ? "translate-y-0 opacity-100"
            : "translate-y-20 opacity-0 pointer-events-none"
        }`}
      >
        <div className="glass-card bg-surface-container-highest/90 border border-primary/30 py-3 px-6 rounded-2xl flex items-center gap-3 shadow-2xl">
          <span className="material-symbols-outlined text-primary">info</span>
          <span className="text-sm font-medium">
            Preparing production assets...
          </span>
        </div>
      </div>

      <SetlistFormModal
        open={setlistOpen}
        mode={setlistMode}
        initialValues={
          setlistMode === "edit" ? { name: sessionName } : undefined
        }
        onClose={() => setSetlistOpen(false)}
        onSubmit={(values) => {
          setSessionName(values.name.trim());
          setSetlistOpen(false);
        }}
      />

      <SongFormModal
        open={songOpen}
        onClose={() => setSongOpen(false)}
        onSubmit={() => setSongOpen(false)}
      />
    </section>
  );
}
