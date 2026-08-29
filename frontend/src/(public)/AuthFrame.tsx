import type { ReactNode } from "react";
import {
  BroadcastIcon,
  CloudSyncIcon,
  CollaborationIcon,
  VideoIcon,
} from "../components/icons";
import churchInterior from "../assets/images/church-interior.png";

type AuthFrameProps = {
  children: ReactNode;
  step?: 1 | 2 | 3;
};

const STEPS = [
  { n: 1, label: "Sign in" },
  { n: 2, label: "Ministry" },
  { n: 3, label: "Live" },
] as const;

function AuthSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex flex-wrap items-center gap-y-3 w-full">
      {STEPS.map((step, index) => {
        const active = step.n <= current;
        return (
          <div key={step.n} className="flex items-center min-w-0 flex-1">
            {index > 0 ? (
              <div className="h-px flex-1 mx-2 sm:mx-3 bg-white/10 min-w-4" />
            ) : null}
            <div className={`flex items-center shrink-0 ${active ? "" : "opacity-40"}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  active
                    ? "bg-white text-[#131313]"
                    : "border border-white/30 text-white"
                }`}
              >
                {step.n}
              </div>
              <span className="ml-2 sm:ml-3 text-[10px] font-bold tracking-widest uppercase text-white/80">
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AuthFrame({ children, step = 1 }: AuthFrameProps) {
  return (
    <div className="h-full overflow-y-auto bg-[#0B0B14]">
      <div className="min-h-full flex justify-center items-stretch p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-7xl flex flex-col rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/5 bg-white/[0.02]">
            <div className="flex space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">
              MinistryCast — Production Engine V1.0
            </div>
            <div className="w-12" />
          </div>

          <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 min-h-0">
            <div className="p-6 sm:p-10 lg:p-12 xl:p-14 flex flex-col gap-10 border-b xl:border-b-0 xl:border-r border-white/5">
              <div className="flex-1 min-w-0">{children}</div>
              <AuthSteps current={step} />
            </div>

            <div className="p-6 sm:p-10 lg:p-12 flex flex-col gap-6">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center mb-6">
                  <VideoIcon />
                </div>
                <h4 className="text-xl font-bold mb-3 text-[#E2E8F0]">Cinematic Engine</h4>
                <p className="text-white/50 text-sm leading-relaxed">
                  Adaptive lyric rendering with AI-enhanced background selection
                  and smooth 60fps transitions.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center mb-6">
                  <BroadcastIcon />
                </div>
                <h4 className="text-xl font-bold mb-3 text-pink-400">Broadcast Layers</h4>
                <p className="text-white/50 text-sm leading-relaxed">
                  Separate outputs for stage monitors, live streams, and main
                  projectors with independent control.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 flex items-center gap-4">
                  <CloudSyncIcon />
                  <span className="text-sm font-medium text-[#E2E8F0]">Cloud Sync</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 flex items-center gap-4">
                  <CollaborationIcon />
                  <span className="text-sm font-medium text-[#E2E8F0]">Collaboration</span>
                </div>
              </div>

              <img
                src={churchInterior}
                alt="Sanctuary"
                className="w-full h-32 sm:h-40 object-cover rounded-xl border border-white/10 opacity-60"
              />
            </div>
          </div>

          <footer className="shrink-0 border-t border-white/5 bg-white/[0.02] px-6 sm:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-medium tracking-widest text-white/30 uppercase">
            <div className="flex gap-8">
              <span>Resources</span>
              <span>Network</span>
              <span>Changelog</span>
            </div>
            <div className="flex items-center gap-2 text-green-500/70">
              <span>Ministry Secure</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

export const AUTH_EMAIL_KEY = "mc_auth_email";

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
