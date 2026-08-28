import { useState } from "react";

export default function Settings() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <section className="h-full overflow-y-auto custom-scrollbar bg-surface-container-lowest">
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
        <div className="grid grid-cols-12 gap-6">
          {/* General */}
          <section className="col-span-12 md:col-span-8 glass-panel rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-primary">
                tune
              </span>
              <h2 className="text-2xl font-semibold text-on-surface">
                General Configuration
              </h2>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-4 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-on-surface">Interface Language</p>
                  <p className="text-xs text-on-surface-variant">
                    Choose your preferred localized interface.
                  </p>
                </div>
                <select className="bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none">
                  <option>English (US)</option>
                  <option>Spanish</option>
                  <option>Portuguese</option>
                  <option>French</option>
                </select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-4 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-on-surface">Visual Appearance</p>
                  <p className="text-xs text-on-surface-variant">
                    Switch between High-Contrast Dark and Light mode.
                  </p>
                </div>
                <div className="flex p-1 bg-surface-container-high rounded-full border border-white/5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                      theme === "dark"
                        ? "bg-primary text-on-primary shadow-lg"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                      theme === "light"
                        ? "bg-primary text-on-primary shadow-lg"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Light
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-white/5 border border-white/5">
                <div className="flex justify-between items-center mb-3 gap-3">
                  <div>
                    <p className="text-on-surface">Offline Storage</p>
                    <p className="text-xs text-on-surface-variant">
                      Cached media for seamless offline playback.
                    </p>
                  </div>
                  <span className="text-xs font-medium text-primary whitespace-nowrap">
                    1.2 GB / 5 GB
                  </span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full shadow-[0_0_12px_rgba(155,203,255,0.35)]"
                    style={{ width: "24%" }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Account */}
          <section className="col-span-12 md:col-span-4 glass-panel rounded-xl p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-secondary">
                cloud_sync
              </span>
              <h2 className="text-2xl font-semibold text-on-surface">Account</h2>
            </div>

            <div className="flex-1 space-y-6">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/5 border border-secondary/20">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#4285F4] text-[22px]">
                    mail
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-secondary">
                    Sync Active
                  </p>
                  <p className="text-sm text-on-surface truncate">
                    production@church.org
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                    Backup Frequency
                  </label>
                  <select className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none">
                    <option>Every 15 Minutes</option>
                    <option>Every Hour</option>
                    <option>Daily</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-on-surface text-xs font-medium transition-all active:scale-95"
                >
                  Backup Now
                </button>
              </div>
            </div>
          </section>

          {/* Presentation */}
          <section className="col-span-12 glass-panel rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-tertiary">
                desktop_windows
              </span>
              <h2 className="text-2xl font-semibold text-on-surface">
                Presentation & Projection
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-on-surface-variant block uppercase tracking-widest">
                  Default Typography
                </label>
                <select className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none">
                  <option>Inter (Modern Sans)</option>
                  <option>Montserrat (Display)</option>
                  <option>Playfair Display (Serif)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-on-surface-variant block uppercase tracking-widest">
                  Transition Style
                </label>
                <select className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none">
                  <option>Cross-Fade (0.5s)</option>
                  <option>Smooth Wipe</option>
                  <option>Instant</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-on-surface-variant block uppercase tracking-widest">
                  Active Output Display
                </label>
                <select className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none">
                  <option>Display 2: Projector Main</option>
                  <option>Display 3: NDI Stream</option>
                  <option>Display 4: Stage Confident</option>
                </select>
              </div>
            </div>
          </section>

          {/* About */}
          <section className="col-span-12 glass-panel rounded-xl p-6 sm:p-8 flex flex-col md:flex-row items-center gap-8 md:gap-10">
            <div className="w-32 h-32 shrink-0 bg-surface-container rounded-2xl overflow-hidden border border-white/10 shadow-xl group cursor-pointer relative">
              <div className="w-full h-full bg-gradient-to-br from-primary/30 via-secondary/20 to-tertiary/20 transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-3xl">
                  info
                </span>
              </div>
            </div>
            <div className="text-center md:text-left space-y-2">
              <h3 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold text-primary">
                MinistryCast Suite
              </h3>
              <p className="text-on-surface-variant max-w-2xl text-sm sm:text-base">
                Version 4.2.1-Stable | Build #290424
                <br />
                Copyright © 2024 Production Ecosystems. All rights reserved.
                Engineered for high-reliability spiritual production
                environments.
              </p>
              <div className="flex flex-wrap gap-4 pt-4 justify-center md:justify-start">
                <a className="text-xs text-primary hover:underline" href="#">
                  Release Notes
                </a>
                <span className="text-white/10">|</span>
                <a className="text-xs text-primary hover:underline" href="#">
                  Privacy Policy
                </a>
                <span className="text-white/10">|</span>
                <a className="text-xs text-primary hover:underline" href="#">
                  Support Portal
                </a>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 pb-8">
          <button
            type="button"
            className="px-8 py-3 rounded-lg border border-white/10 text-on-surface hover:bg-white/5 transition-all"
          >
            Reset to Defaults
          </button>
          <button
            type="button"
            className="px-10 py-3 rounded-lg bg-primary text-on-primary font-bold shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
          >
            Save Changes
          </button>
        </div>
      </div>
    </section>
  );
}
