import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type NavItem = {
  id: string;
  tag: string;
  label: string;
  preview: string;
  kind: "lyric" | "point" | "ref";
};

const lyricSlides: NavItem[] = [
  {
    id: "v1",
    tag: "V1",
    label: "VERSE 1",
    preview: "I love You Lord, for Your mercy never fails me...",
    kind: "lyric",
  },
  {
    id: "c1",
    tag: "C1",
    label: "CHORUS",
    preview: "And all my life You have been faithful...",
    kind: "lyric",
  },
];

const sermonPoints: NavItem[] = [
  {
    id: "p1",
    tag: "P1",
    label: "POINT 1",
    preview: "Defining Faith",
    kind: "point",
  },
  {
    id: "ref",
    tag: "REF",
    label: "SCRIPTURE",
    preview: "Hebrews 11:1",
    kind: "ref",
  },
  {
    id: "p2",
    tag: "P2",
    label: "POINT 2",
    preview: "Walking in Truth",
    kind: "point",
  },
];

export default function Live() {
  const [activeId, setActiveId] = useState("v1");
  const [elapsed, setElapsed] = useState(0);
  const [transition, setTransition] = useState(0.4);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setHint(true);
        window.setTimeout(() => setHint(false), 1000);
        const all = [...lyricSlides, ...sermonPoints];
        const idx = all.findIndex((s) => s.id === activeId);
        const next = all[(idx + 1) % all.length];
        setActiveId(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId]);

  const formatTime = (s: number) => {
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const active =
    [...lyricSlides, ...sermonPoints].find((s) => s.id === activeId) ??
    lyricSlides[0];

  const activeLines =
    active.id === "v1"
      ? ["I love You, Lord", "For Your mercy never fails me"]
      : active.id === "c1"
        ? ["And all my life You have been faithful", "All my life You have been so, so good"]
        : [active.preview];

  return (
    <div className="bg-background text-on-surface font-sans overflow-hidden h-screen select-none">
      <header className="fixed top-0 left-0 right-0 h-16 bg-surface/50 backdrop-blur-lg border-b border-white/5 flex items-center justify-between px-4 sm:px-6 z-50">
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="material-symbols-outlined filled text-on-primary text-[20px]">
                movie_filter
              </span>
            </div>
            <h1 className="hidden sm:block font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary text-xl">
              MinistryCast
            </h1>
          </div>
          <div className="hidden md:block h-6 w-px bg-white/10" />
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
              <div className="w-2 h-2 rounded-full bg-primary live-pulse" />
              <span className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary">
                On Air
              </span>
            </div>
            <span className="text-xs text-on-surface-variant font-mono">
              {formatTime(elapsed)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            type="button"
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high border border-white/10 hover:bg-white/5 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">sync</span>
            <span className="text-xs font-medium">Sync Status</span>
          </button>
          <Link
            to="/dashboard"
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-error/15 text-error hover:brightness-110 transition-all active:scale-95 font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">
              stop_circle
            </span>
            <span className="text-xs font-medium hidden sm:inline">
              End Presentation
            </span>
          </Link>
        </div>
      </header>

      <main className="pt-16 h-screen flex">
        {/* Left navigator */}
        <aside className="hidden lg:flex w-[280px] border-r border-white/5 bg-surface-container-lowest/50 flex-col h-[calc(100vh-4rem)]">
          <div className="p-4 border-b border-white/5 bg-surface-container-low">
            <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant mb-1">
              Current Song
            </h3>
            <h2 className="text-xl font-semibold text-primary truncate">
              Goodness of God
            </h2>
            <div className="flex gap-2 mt-2">
              <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-bold border border-white/10">
                G MAJOR
              </span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-bold border border-white/10">
                72 BPM
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-2 space-y-2">
              {lyricSlides.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  className={`w-full text-left relative p-3 rounded-lg cursor-pointer transition-colors border ${
                    activeId === item.id
                      ? "bg-primary/10 border-l-4 border-primary border-y-transparent border-r-transparent"
                      : "border-white/5 hover:bg-white/5"
                  }`}
                >
                  <span className="absolute top-2 right-3 text-[10px] font-bold text-primary/50">
                    {item.tag}
                  </span>
                  <div
                    className={`text-[10px] font-semibold tracking-wider mb-1 ${
                      activeId === item.id
                        ? "text-primary/70"
                        : "text-on-surface-variant"
                    }`}
                  >
                    {item.label}
                  </div>
                  <p
                    className={`text-sm leading-snug ${
                      activeId === item.id
                        ? "text-on-surface"
                        : "text-on-surface-variant"
                    }`}
                  >
                    {item.preview}
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-4 border-t border-white/5 pt-4">
              <div className="px-4 mb-2 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                  Sermon Points
                </h3>
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                  terminal
                </span>
              </div>
              <div className="p-2 space-y-2">
                {sermonPoints.map((item) => {
                  const isActive = activeId === item.id;
                  const accent =
                    item.kind === "ref" ? "primary" : "tertiary";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      className={`w-full text-left relative p-3 rounded-lg border cursor-pointer transition-all ${
                        isActive
                          ? accent === "tertiary"
                            ? "border-tertiary bg-tertiary/10"
                            : "border-primary bg-primary/10"
                          : "border-white/5 hover:bg-white/5"
                      }`}
                    >
                      <span
                        className={`absolute top-2 right-3 text-[10px] font-bold ${
                          accent === "tertiary"
                            ? "text-tertiary/50"
                            : "text-primary/50"
                        }`}
                      >
                        {item.tag}
                      </span>
                      <div
                        className={`text-[10px] font-semibold tracking-wider mb-1 ${
                          accent === "tertiary"
                            ? "text-tertiary"
                            : "text-primary"
                        }`}
                      >
                        {item.label}
                      </div>
                      <p
                        className={`text-sm leading-snug ${
                          item.kind === "ref" ? "italic" : "font-medium"
                        } text-on-surface`}
                      >
                        {item.preview}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-white/5 bg-surface-container-low flex justify-between items-center">
            <button type="button" className="p-2 rounded hover:bg-white/5">
              <span className="material-symbols-outlined">skip_previous</span>
            </button>
            <span className="text-xs text-on-surface-variant">Slide 1 / 12</span>
            <button type="button" className="p-2 rounded hover:bg-white/5">
              <span className="material-symbols-outlined">skip_next</span>
            </button>
          </div>
        </aside>

        {/* Center stage */}
        <section className="flex-1 flex flex-col bg-surface-container-lowest p-3 sm:p-6 overflow-hidden min-w-0">
          <div className="flex-1 relative flex flex-col gap-4 sm:gap-6 min-h-0">
            <div className="flex-1 rounded-xl overflow-hidden relative border-2 border-primary shadow-[0_0_40px_rgba(155,203,255,0.15)] group min-h-[240px]">
              <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#1a0a28] to-[#050505] transition-transform duration-[10s] group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 sm:p-12">
                <div className="max-w-4xl">
                  <h2 className="text-[clamp(1.5rem,5vw,3rem)] font-extrabold text-white leading-tight uppercase tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                    {activeLines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </h2>
                </div>
              </div>
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 bg-primary rounded text-on-primary font-bold text-[10px] uppercase">
                Active Output
              </div>
            </div>

            <div className="h-auto sm:h-48 flex flex-col sm:flex-row gap-3 sm:gap-6 shrink-0">
              <div className="flex-1 bg-surface-container rounded-xl border border-white/10 relative overflow-hidden group cursor-pointer hover:border-white/20 transition-all min-h-[120px]">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-30" />
                <div className="absolute inset-0 p-4 flex flex-col justify-center items-center text-center">
                  <span className="text-[10px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant absolute top-3 left-4">
                    Next Preview
                  </span>
                  <p className="text-lg sm:text-xl font-semibold text-on-surface-variant scale-95 opacity-70">
                    Point 1: Defining Faith
                  </p>
                </div>
              </div>
              <div className="w-full sm:w-64 glass-panel rounded-xl p-4 flex flex-col gap-2 shrink-0">
                <span className="text-[10px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                  Song Progress
                </span>
                <div className="flex-1 flex flex-col justify-center gap-1">
                  <div className="h-2 rounded bg-primary/20 w-full overflow-hidden">
                    <div className="h-full bg-primary w-1/4" />
                  </div>
                  <div className="flex justify-between text-[10px] text-on-surface-variant font-mono">
                    <span>01:12</span>
                    <span>04:45</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-primary">
                  <span className="material-symbols-outlined text-[16px]">
                    mic
                  </span>
                  <span className="text-xs font-medium">Vocal: Lead</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right controls */}
        <aside className="hidden xl:flex w-[320px] border-l border-white/5 bg-surface-container-lowest/50 flex-col p-4 gap-6 h-[calc(100vh-4rem)]">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-error/20 bg-error/10 hover:bg-error/20 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-error text-[32px]">
                block
              </span>
              <span className="text-[12px] font-semibold tracking-[0.05em] uppercase text-error">
                Blackout
              </span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-primary/20 bg-primary/10 hover:bg-primary/20 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-primary text-[32px]">
                branding_watermark
              </span>
              <span className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary">
                Logo
              </span>
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                Transition Speed
              </h4>
              <span className="font-mono text-xs text-primary">
                {transition.toFixed(1)}s
              </span>
            </div>
            <input
              className="w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
              max={2}
              min={0}
              step={0.1}
              type="range"
              value={transition}
              onChange={(e) => setTransition(Number(e.target.value))}
            />
            <div className="flex justify-between text-[10px] text-on-surface-variant font-medium">
              <span>CUT</span>
              <span>SMOOTH</span>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
              Quick Scripture
            </h4>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[18px]">
                search
              </span>
              <input
                className="w-full bg-surface-container-high border-none rounded-lg pl-10 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                placeholder="John 3:16..."
                type="text"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded bg-surface-container hover:bg-surface-container-high text-sm border border-white/5 transition-colors text-left"
              >
                ESV
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded bg-surface-container hover:bg-surface-container-high text-sm border border-white/5 transition-colors text-left"
              >
                NIV
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar min-h-0">
            <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
              Media Triggers
            </h4>
            <div className="space-y-2">
              {[
                {
                  title: "Sermon Deck",
                  meta: "12 Slides Loaded",
                  icon: "present_to_all",
                  color: "tertiary",
                },
                {
                  title: "Announcement Loop",
                  meta: "Ready (5 items)",
                  icon: "campaign",
                  color: "secondary",
                },
                {
                  title: "Sermon Bumper",
                  meta: "0:45 Duration",
                  icon: "movie",
                  color: "tertiary",
                },
                {
                  title: "Countdown Timer",
                  meta: "Auto-start next",
                  icon: "timer",
                  color: "primary",
                },
              ].map((item) => (
                <button
                  key={item.title}
                  type="button"
                  className="w-full p-3 rounded-lg bg-surface-container-high border border-white/5 hover:border-primary/50 flex items-center gap-3 transition-all group text-left"
                >
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                      item.color === "tertiary"
                        ? "bg-tertiary/20 text-tertiary group-hover:bg-tertiary group-hover:text-on-tertiary"
                        : item.color === "secondary"
                          ? "bg-secondary/20 text-secondary group-hover:bg-secondary group-hover:text-on-secondary"
                          : "bg-primary/20 text-primary group-hover:bg-primary group-hover:text-on-primary"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {item.icon}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs font-medium">{item.title}</div>
                    <div className="text-[10px] text-on-surface-variant">
                      {item.meta}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-white/5 flex gap-2">
            {["settings", "help", "more_vert"].map((icon) => (
              <button
                key={icon}
                type="button"
                className="flex-1 p-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-all"
              >
                <span className="material-symbols-outlined">{icon}</span>
              </button>
            ))}
          </div>
        </aside>
      </main>

      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-full transition-opacity duration-300 pointer-events-none z-50 ${
          hint ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="text-[10px] font-bold text-primary tracking-widest uppercase">
          Spacebar: Next Slide
        </span>
      </div>
    </div>
  );
}
