import type { ReactNode } from "react";
import Icon from "../components/Icon";
import { BentoCard, BentoGrid } from "../components/bento";
import { BUNDLED_VERSION } from "../lib/appVersion";
import { PALETTES } from "../lib/palettes";

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

/* ── Feature bento (illustrative mini-visuals only, no data) ─────────── */

function FeatureTitle({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="w-7 h-7 shrink-0 rounded-lg border border-white/10 bg-surface-container-high flex items-center justify-center text-on-surface-variant">
          <Icon name={icon} className="text-[14px]" />
        </span>
        <p className="text-[14px] font-medium text-on-surface">{title}</p>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">{body}</p>
    </div>
  );
}

/** A tiny 16:9 projector frame with a lyric slide. */
function MiniStage() {
  return (
    <div
      aria-hidden
      className="force-dark relative aspect-video w-full rounded-[10px] overflow-hidden border border-white/10 bg-black"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 pt-4 text-center">
        <p className="font-serif text-[14px] xl:text-[16px] leading-snug text-white/90">
          Holy, holy, holy!
        </p>
        <p className="font-serif text-[14px] xl:text-[16px] leading-snug text-white/90">
          Lord God Almighty
        </p>
      </div>
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80">
        <span className="w-1.5 h-1.5 rounded-full bg-error" />
        Live
      </span>
      <span className="absolute right-3 bottom-3 text-[10px] text-white/50">Verse 1 · 1/4</span>
    </div>
  );
}

function MiniOutputs() {
  const outputs = [
    { icon: "desktop_windows", label: "Projector" },
    { icon: "live_tv", label: "Stage" },
    { icon: "cast", label: "Stream" },
  ];
  return (
    <ul aria-hidden className="grid grid-cols-3 gap-2">
      {outputs.map((output) => (
        <li
          key={output.label}
          className="rounded-lg border border-white/10 bg-surface-container-low px-2 py-2.5 flex flex-col items-center gap-1.5"
        >
          <Icon name={output.icon} className="text-[16px] text-on-surface-variant" />
          <span className="text-[11px] text-on-surface-variant">{output.label}</span>
        </li>
      ))}
    </ul>
  );
}

function MiniOffline() {
  return (
    <div aria-hidden className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-container-low px-2.5 py-1 text-[11px] text-on-surface-variant">
        <Icon name="cloud_done" className="text-[13px] text-primary" />
        Saved on this device
      </span>
    </div>
  );
}

function MiniTeam() {
  const roles = [{ label: "Admin" }, { label: "Producer" }, { label: "Operator" }];
  return (
    <ul aria-hidden className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <li
          key={role.label}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-container-low px-2.5 py-1 text-[11px] text-on-surface-variant"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
          {role.label}
        </li>
      ))}
    </ul>
  );
}

function MiniPalettes() {
  return (
    <ul aria-hidden className="grid grid-cols-9 gap-1.5">
      {PALETTES.map((palette) => (
        <li key={palette.id} title={palette.label} className="aspect-square rounded-md overflow-hidden border border-white/10 flex">
          <span className="flex-1" style={{ background: palette.swatch.dark }} />
          <span className="flex-1" style={{ background: palette.swatch.accent }} />
        </li>
      ))}
    </ul>
  );
}

function FeatureBento() {
  return (
    <BentoGrid className="w-full max-w-[720px] auto-rows-auto">
      <BentoCard span={12} accent aria-label="Cinematic stage output">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-5 items-center pt-1">
          <FeatureTitle
            icon="slideshow"
            title="Cinematic stage output"
            body="Lyrics, scripture, and sermon slides with smooth transitions on every screen."
          />
          <MiniStage />
        </div>
      </BentoCard>
      <BentoCard span={6} aria-label="Independent outputs">
        <div className="pt-1 flex flex-col gap-4 h-full justify-between">
          <FeatureTitle
            icon="cast"
            title="Independent outputs"
            body="Drive the projector, stage monitor, and stream from one console."
          />
          <MiniOutputs />
        </div>
      </BentoCard>
      <BentoCard span={6} aria-label="Works offline">
        <div className="pt-1 flex flex-col gap-4 h-full justify-between">
          <FeatureTitle
            icon="cloud_sync"
            title="Works offline"
            body="Everything saves on this device first and backs up when you're online."
          />
          <MiniOffline />
        </div>
      </BentoCard>
      <BentoCard span={6} aria-label="Built for the whole team">
        <div className="pt-1 flex flex-col gap-4 h-full justify-between">
          <FeatureTitle
            icon="group"
            title="Built for the whole team"
            body="Roles, approvals, and chat for worship, media, and pastoral staff."
          />
          <MiniTeam />
        </div>
      </BentoCard>
      <BentoCard span={6} aria-label="Make it yours">
        <div className="pt-1 flex flex-col gap-4 h-full justify-between">
          <FeatureTitle
            icon="palette"
            title="Make it yours"
            body="Nine color themes, light and dark, on every device."
          />
          <MiniPalettes />
        </div>
      </BentoCard>
    </BentoGrid>
  );
}

export default function AuthFrame({ children, step = 1 }: AuthFrameProps) {
  return (
    <div className="h-full overflow-y-auto bg-[#0B0B14]">
      <div className="min-h-full flex justify-center items-stretch p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-7xl flex flex-col rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md shadow-2xl overflow-x-hidden overflow-y-visible">
          <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/5 bg-white/[0.02]">
            <div className="flex space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">
              MinistryCast — v{BUNDLED_VERSION}
            </div>
            <div className="w-12" />
          </div>

          <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 min-h-0">
            <div className="p-6 sm:p-10 lg:p-12 xl:p-14 flex flex-col gap-10 border-b xl:border-b-0 xl:border-r border-white/5 overflow-visible">
              <div className="flex-1 min-w-0 overflow-visible">{children}</div>
              <div className="space-y-3">
                <AuthSteps current={step} />
                <p className="text-[11px] leading-relaxed text-white/40">
                  Version {BUNDLED_VERSION}. MinistryCast is church presentation
                  software for lyrics, sermons, setlists, and live output.
                </p>
              </div>
            </div>

            <aside
              aria-label="Why MinistryCast"
              className="force-dark p-6 sm:p-10 lg:p-12 flex flex-col justify-center gap-6"
            >
              <div>
                <p className="text-[12px] font-medium text-primary">Why MinistryCast</p>
                <h2 className="mt-1.5 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-[#E2E8F0]">
                  Everything your Sunday needs, in one calm console.
                </h2>
              </div>
              <FeatureBento />
            </aside>
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
