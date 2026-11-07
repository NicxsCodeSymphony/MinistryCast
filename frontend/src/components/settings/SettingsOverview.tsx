/**
 * Settings bento pieces: the Profile overview (account · device · sync) and
 * the Appearance palette gallery. Layout only; all state lives in Settings.
 */
import type { ReactNode } from "react";
import Icon from "../Icon";
import { Badge } from "../ui";
import { BentoCard, BentoGrid, Meter } from "../bento";
import { PALETTES, type PaletteId } from "../../lib/palettes";
import { formatRelative } from "../../lib/helpers";
import { syncIcon, syncLabel, type SyncSnapshot } from "../../lib/offline/status";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function CardButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12px] text-on-surface-variant hover:text-on-surface"
    >
      {children}
      <Icon name="chevron_right" className="text-[13px]" />
    </button>
  );
}

export function ProfileOverview({
  name,
  email,
  avatarUrl,
  role,
  roleAccent,
  churchName,
  churchPhotoUrl,
  themeLabel,
  palette,
  languageLabel,
  sync,
  storageUsed,
  storageQuota,
  storageLabel,
  onOpen,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  roleAccent: boolean;
  churchName: string | null;
  churchPhotoUrl: string | null;
  themeLabel: string;
  palette: PaletteId;
  languageLabel: string;
  sync: SyncSnapshot;
  storageUsed: number;
  storageQuota: number;
  storageLabel: string;
  onOpen: (tab: "general" | "notifications" | "backup") => void;
}) {
  const current = PALETTES.find((row) => row.id === palette) ?? PALETTES[0];
  const healthy = !sync.error && sync.online;
  const usedPct = storageQuota > 0 ? Math.round((storageUsed / storageQuota) * 100) : 0;
  return (
    <BentoGrid className="auto-rows-auto">
      <BentoCard span={4} accent title="Account">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-full overflow-hidden bg-surface-container-highest border border-white/10 shrink-0 flex items-center justify-center text-[15px] font-semibold text-on-surface-variant">
            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initials(name)}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-on-surface truncate">{name || "—"}</p>
            <p className="text-[12px] text-on-surface-variant truncate">{email}</p>
          </div>
        </div>
        <div className="mt-auto pt-4 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-on-surface-variant">Role</span>
            <Badge tone={roleAccent ? "accent" : "neutral"}>{role}</Badge>
          </div>
          {churchName ? (
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-on-surface-variant">Church</span>
              <span className="inline-flex items-center gap-1.5 min-w-0 text-on-surface">
                {churchPhotoUrl ? (
                  <img src={churchPhotoUrl} alt="" className="w-4 h-4 rounded object-cover shrink-0" />
                ) : (
                  <Icon name="church" className="text-[13px] text-outline shrink-0" />
                )}
                <span className="truncate">{churchName}</span>
              </span>
            </div>
          ) : null}
        </div>
      </BentoCard>

      <BentoCard span={4} title="Your device" action={<CardButton onClick={() => onOpen("general")}>Appearance</CardButton>}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="w-12 h-12 shrink-0 rounded-[10px] overflow-hidden border border-white/10 flex"
          >
            <span className="flex-1 flex flex-col justify-end p-1.5" style={{ background: current.swatch.dark }}>
              <span className="h-1.5 w-full rounded-sm" style={{ background: current.swatch.accent }} />
            </span>
            <span className="flex-1 flex flex-col justify-end p-1.5" style={{ background: current.swatch.light }}>
              <span className="h-1.5 w-full rounded-sm" style={{ background: current.swatch.lightAccent }} />
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-on-surface truncate">{current.label}</p>
            <p className="text-[12px] text-on-surface-variant truncate">Color theme</p>
          </div>
        </div>
        <dl className="mt-auto pt-4 space-y-2 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-on-surface-variant">Mode</dt>
            <dd className="text-on-surface">{themeLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-on-surface-variant">Language</dt>
            <dd className="text-on-surface truncate">{languageLabel}</dd>
          </div>
        </dl>
      </BentoCard>

      <BentoCard span={4} title="Sync health" action={<CardButton onClick={() => onOpen("backup")}>Details</CardButton>}>
        <div className="flex items-center gap-3">
          <span
            className={`w-12 h-12 shrink-0 rounded-[10px] border border-white/10 flex items-center justify-center ${
              healthy ? "text-primary" : "text-error"
            }`}
          >
            <Icon name={syncIcon(sync)} className={`text-[20px] ${sync.syncing ? "animate-spin" : ""}`} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-on-surface truncate">{syncLabel(sync)}</p>
            <p className="text-[12px] text-on-surface-variant truncate">
              <span className="tabular-nums">{sync.pending}</span> pending ·{" "}
              {sync.lastSyncAt ? formatRelative(sync.lastSyncAt) : "not synced yet"}
            </p>
          </div>
        </div>
        <div className="mt-auto pt-4">
          <div className="flex items-center justify-between gap-2 text-[12px] mb-2">
            <span className="text-on-surface-variant">Offline storage</span>
            <span className="text-on-surface tabular-nums truncate">
              {storageQuota > 0 ? `${usedPct}%` : storageLabel}
            </span>
          </div>
          <Meter
            value={storageUsed}
            max={storageQuota || 1}
            label={`Offline storage used: ${storageLabel}`}
            tone={usedPct > 85 ? "warning" : "accent"}
          />
        </div>
      </BentoCard>
    </BentoGrid>
  );
}

/** Palette gallery as a bento of preview cards (radiogroup kept for a11y). */
export function PaletteGallery({
  value,
  onChange,
}: {
  value: PaletteId;
  onChange: (id: PaletteId) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {PALETTES.map((palette) => {
        const active = value === palette.id;
        const { accent, dark, light, lightAccent } = palette.swatch;
        return (
          <button
            key={palette.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={palette.label}
            title={palette.description}
            onClick={() => onChange(palette.id)}
            className={`bento-card text-left rounded-[14px] border p-3 transition-colors ${
              active
                ? "!border-primary/70 bg-primary/5"
                : "border-white/5 bg-surface-container hover:!border-white/15"
            }`}
          >
            <span aria-hidden className="flex h-[76px] rounded-[10px] overflow-hidden border border-white/10">
              {[
                { bg: dark, fg: accent, line: "rgba(255,255,255,0.16)", side: "rgba(255,255,255,0.05)" },
                { bg: light, fg: lightAccent, line: "rgba(0,0,0,0.12)", side: "rgba(0,0,0,0.04)" },
              ].map((half, index) => (
                <span key={index} className="flex-1 flex" style={{ background: half.bg }}>
                  {/* mini sidebar */}
                  <span className="w-4 h-full flex flex-col items-center gap-1 pt-2" style={{ background: half.side }}>
                    <span className="w-2 h-1 rounded-full" style={{ background: half.fg }} />
                    <span className="w-2 h-1 rounded-full" style={{ background: half.line }} />
                    <span className="w-2 h-1 rounded-full" style={{ background: half.line }} />
                  </span>
                  <span className="flex-1 flex flex-col justify-between p-2">
                    <span className="space-y-1">
                      <span className="block h-1.5 w-3/4 rounded-full" style={{ background: half.line }} />
                      <span className="block h-1.5 w-1/2 rounded-full" style={{ background: half.line }} />
                    </span>
                    <span className="block h-3 w-9 rounded-[3px]" style={{ background: half.fg }} />
                  </span>
                </span>
              ))}
            </span>
            <span className="mt-3 flex items-center gap-2 px-0.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accent }} />
              <span className="text-[13px] font-medium text-on-surface truncate">{palette.label}</span>
              {active ? (
                <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-primary">
                  <Icon name="check" className="text-[13px]" />
                  Active
                </span>
              ) : null}
            </span>
            {palette.description ? (
              <span className="mt-1 block px-0.5 text-[12px] text-on-surface-variant line-clamp-1">
                {palette.description}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
