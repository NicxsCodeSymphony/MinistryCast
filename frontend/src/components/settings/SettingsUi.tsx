/**
 * Settings page primitives (Linear-style): a grouped left nav, a narrow
 * content column, setting rows with hairlines, and a sticky save bar.
 */
import type { ReactNode } from "react";
import Icon from "../Icon";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ── Left navigation ─────────────────────────────────────────────────── */

export type SettingsNavItem<T extends string> = {
  id: T;
  label: string;
  icon: string;
  badge?: ReactNode;
};

export type SettingsNavGroup<T extends string> = {
  label: string;
  items: SettingsNavItem<T>[];
};

export function SettingsNav<T extends string>({
  groups,
  value,
  onChange,
  header,
  footer,
}: {
  groups: SettingsNavGroup<T>[];
  value: T;
  onChange: (id: T) => void;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="shrink-0 md:w-[232px] border-b md:border-b-0 md:border-r border-white/5 bg-surface-container-lowest flex flex-col min-h-0">
      {header ? <div className="hidden md:block px-4 pt-5 pb-3">{header}</div> : null}
      <div
        role="tablist"
        aria-label="Settings sections"
        aria-orientation="vertical"
        className="flex md:flex-col gap-1 md:gap-5 px-3 py-2 md:py-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto custom-scrollbar md:flex-1"
      >
        {groups.map((group) =>
          group.items.length ? (
            <div key={group.label} role="presentation" className="flex md:flex-col gap-0.5 shrink-0">
              <p
                role="presentation"
                className="hidden md:block px-2 pb-1 text-[11px] font-medium text-outline"
              >
                {group.label}
              </p>
              {group.items.map((item) => {
                const active = item.id === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`settings-tab-${item.id}`}
                    aria-selected={active}
                    aria-controls="settings-panel"
                    onClick={() => onChange(item.id)}
                    className={cx(
                      "flex items-center gap-2.5 h-8 px-2 rounded-md text-[13px] whitespace-nowrap transition-colors text-left",
                      active
                        ? "bg-surface-container-high text-on-surface font-medium"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cx("text-[15px] shrink-0", active ? "text-on-surface" : "text-outline")}
                    />
                    <span className="truncate flex-1">{item.label}</span>
                    {item.badge}
                  </button>
                );
              })}
            </div>
          ) : null,
        )}
      </div>
      {footer ? <div className="hidden md:block px-5 py-4 border-t border-white/5">{footer}</div> : null}
    </div>
  );
}

/* ── Content column ──────────────────────────────────────────────────── */

export function SettingsPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-semibold tracking-tight text-on-surface">{title}</h2>
          {description ? (
            <p className="mt-1 text-[13px] text-on-surface-variant">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  tone = "default",
  id,
  children,
}: {
  title?: string;
  description?: string;
  tone?: "default" | "danger";
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      {title ? (
        <div className="mb-2.5">
          <h3
            className={cx(
              "text-[13px] font-semibold",
              tone === "danger" ? "text-error" : "text-on-surface",
            )}
          >
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-[12px] text-on-surface-variant">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div
        className={cx(
          "rounded-[10px] border",
          tone === "danger" ? "border-error/30" : "border-white/10",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * One setting: label + helper on the left, control on the right.
 * `stacked` puts a wide control (pickers, galleries) under the label.
 */
export function SettingRow({
  label,
  hint,
  htmlFor,
  children,
  stacked = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
  stacked?: boolean;
}) {
  const Label = htmlFor ? "label" : "p";
  return (
    <div
      className={cx(
        "px-4 py-3.5 border-t border-white/5 first:border-t-0",
        stacked
          ? "space-y-3"
          : "flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-8 min-h-[60px]",
      )}
    >
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor} className="block text-[13px] font-medium text-on-surface">
          {label}
        </Label>
        {hint ? (
          <div className="mt-0.5 text-[12px] leading-[18px] text-on-surface-variant">{hint}</div>
        ) : null}
      </div>
      {children != null ? (
        <div className={cx("min-w-0", !stacked && "sm:shrink-0 flex items-center gap-2")}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Text inputs and selects in setting rows share one width. */
export const fieldClass = "ui-input sm:w-[280px]";

export function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cx(
        "relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50",
        checked ? "bg-primary" : "bg-surface-container-highest",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

/** Small segmented control (Dark / Light / System). Buttons keep their names. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="ui-tabs">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cx(
            "ui-tab",
            value === option.id && "bg-surface-container-highest text-on-surface",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ── Sticky save bar ─────────────────────────────────────────────────── */

export function SaveBar({
  show,
  saving,
  saveLabel,
  savingLabel,
  onSave,
  onDiscard,
}: {
  show: boolean;
  saving: boolean;
  saveLabel: string;
  savingLabel: string;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!show && !saving) return null;
  return (
    <div className="sticky bottom-0 z-10 pt-6 pb-5 pointer-events-none">
      <div
        role="region"
        aria-label="Unsaved changes"
        className="pointer-events-auto flex items-center gap-3 pl-4 pr-2 h-12 rounded-[10px] border border-white/10 bg-surface-container-highest shadow-[var(--mc-popover-shadow)]"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
        <span className="text-[13px] text-on-surface flex-1 truncate">Unsaved changes</span>
        <button
          type="button"
          disabled={saving}
          onClick={onDiscard}
          className="ui-btn ui-btn-ghost"
        >
          Discard
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="ui-btn ui-btn-primary"
        >
          {saving ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  );
}
