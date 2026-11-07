/**
 * MinistryCast UI kit — Linear-inspired primitives.
 *
 * Rules of the system:
 * - Hierarchy comes from type weight, size and muted color, not from boxes.
 * - Lists are rows separated by hairlines, not cards.
 * - One primary action per view. Destructive actions live in a row menu and
 *   always go through ConfirmDialog.
 * - Shadows only on floating layers (menus, popovers, dialogs).
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import Icon from "../Icon";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ── Page header ─────────────────────────────────────────────────────── */

type PageHeaderProps = {
  title: string;
  /** Muted count or subtitle next to the title, e.g. "12 songs". */
  meta?: ReactNode;
  /** Breadcrumb segments rendered before the title. */
  crumbs?: Array<{ label: string; onClick?: () => void }>;
  /** Right side: usually one primary button plus ghost buttons. */
  actions?: ReactNode;
  /** Second row: view tabs, filters, search. */
  toolbar?: ReactNode;
};

export function PageHeader({ title, meta, crumbs, actions, toolbar }: PageHeaderProps) {
  return (
    <header className="shrink-0 border-b border-white/5">
      <div className="flex items-center gap-3 px-6 h-14">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {crumbs?.map((crumb) => (
            <span key={crumb.label} className="flex items-center gap-2 min-w-0">
              {crumb.onClick ? (
                <button
                  type="button"
                  onClick={crumb.onClick}
                  className="text-[14px] text-on-surface-variant hover:text-on-surface truncate"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-[14px] text-on-surface-variant truncate">{crumb.label}</span>
              )}
              <Icon name="chevron_right" className="text-[14px] text-outline" />
            </span>
          ))}
          <h1 className="text-[15px] font-semibold text-on-surface truncate">{title}</h1>
          {meta != null ? (
            <span className="text-[13px] text-on-surface-variant tabular-nums">{meta}</span>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2 px-6 pb-3">{toolbar}</div>
      ) : null}
    </header>
  );
}

/* ── Buttons ─────────────────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: string;
  /** Keyboard hint shown on the right, e.g. "N". */
  kbd?: string;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  kbd,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("ui-btn", `ui-btn-${variant}`, size === "sm" && "ui-btn-sm", className)}
      {...rest}
    >
      {icon ? <Icon name={icon} className={size === "sm" ? "text-[14px]" : "text-[16px]"} /> : null}
      {children}
      {kbd ? <kbd className="ui-kbd ml-1">{kbd}</kbd> : null}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  tone?: "default" | "danger";
};

export function IconButton({
  icon,
  label,
  tone = "default",
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx("ui-icon-btn", tone === "danger" && "ui-icon-btn-danger", className)}
      {...rest}
    >
      <Icon name={icon} className="text-[16px]" />
    </button>
  );
}

/* ── View tabs (Active / Archive, Edit / Preview ...) ─────────────────── */

type ViewTabsProps<T extends string> = {
  label: string;
  value: T;
  onChange: (value: T) => void;
  tabs: Array<{ id: T; label: string; count?: number }>;
};

export function ViewTabs<T extends string>({ label, value, onChange, tabs }: ViewTabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="ui-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className="ui-tab"
        >
          {tab.label}
          {tab.count != null ? <span className="ui-tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ── Search field ────────────────────────────────────────────────────── */

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cx("ui-search", className)}>
      <Icon name="search" className="text-[15px] text-outline" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-on-surface placeholder:text-outline"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="text-outline hover:text-on-surface"
        >
          <Icon name="close" className="text-[14px]" />
        </button>
      ) : null}
    </label>
  );
}

/* ── Filter chip ─────────────────────────────────────────────────────── */

export function Chip({
  active,
  onClick,
  children,
  dot,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  /** Optional color dot (e.g. category color class like "bg-sky-400"). */
  dot?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx("ui-chip", active && "ui-chip-active")}
    >
      {dot ? <span className={cx("w-1.5 h-1.5 rounded-full", dot)} /> : null}
      {children}
    </button>
  );
}

/* ── List rows ───────────────────────────────────────────────────────── */

export function ListGroup({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="ui-group-label">
        <span>{label}</span>
        {count != null ? <span className="tabular-nums text-outline">{count}</span> : null}
      </div>
      <ul role="list">{children}</ul>
    </section>
  );
}

type RowProps = {
  selected?: boolean;
  onOpen?: () => void;
  /** Accessible name for the row's open button. */
  label: string;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned compact metadata (key, date, duration...). */
  meta?: ReactNode;
  /** Hover actions, usually a RowMenu. Kept outside the open button. */
  actions?: ReactNode;
};

export function Row({ selected, onOpen, label, leading, title, subtitle, meta, actions }: RowProps) {
  return (
    <li className={cx("ui-row group", selected && "ui-row-selected")}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        aria-current={selected ? "true" : undefined}
        className="flex items-center gap-3 min-w-0 flex-1 text-left h-full"
      >
        {leading ? <span className="shrink-0 flex items-center">{leading}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] text-on-surface truncate">{title}</span>
          {subtitle ? (
            <span className="block text-[12px] text-on-surface-variant truncate">{subtitle}</span>
          ) : null}
        </span>
        {meta ? (
          <span className="shrink-0 flex items-center gap-4 text-[12px] text-on-surface-variant tabular-nums">
            {meta}
          </span>
        ) : null}
      </button>
      {actions ? (
        <span className="shrink-0 flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[open=true]:opacity-100 transition-opacity">
          {actions}
        </span>
      ) : null}
    </li>
  );
}

/* ── Row / overflow menu ─────────────────────────────────────────────── */

export type MenuItem = {
  label: string;
  icon?: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const safe = items.filter((item) => !item.danger);
  const danger = items.filter((item) => item.danger);

  return (
    <div ref={ref} className="relative" data-open={open}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="ui-icon-btn"
      >
        <Icon name="more_horiz" className="text-[16px]" />
      </button>
      {open ? (
        <div id={menuId} role="menu" className="ui-menu right-0 top-full mt-1">
          {[safe, danger].map((group, index) =>
            group.length ? (
              <div key={index} className={index ? "border-t border-white/5 pt-1 mt-1" : ""}>
                {group.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpen(false);
                      item.onSelect();
                    }}
                    className={cx("ui-menu-item", item.danger && "ui-menu-item-danger")}
                  >
                    {item.icon ? <Icon name={item.icon} className="text-[15px]" /> : null}
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ── Badges, keys, empty states ──────────────────────────────────────── */

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return <span className={cx("ui-badge", `ui-badge-${tone}`)}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16">
      <span className="w-10 h-10 rounded-lg border border-white/10 flex items-center justify-center text-on-surface-variant">
        <Icon name={icon} className="text-[18px]" />
      </span>
      <p className="mt-4 text-[14px] font-medium text-on-surface">{title}</p>
      {body ? <p className="mt-1 text-[13px] text-on-surface-variant max-w-sm">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ── Detail pane / property list ─────────────────────────────────────── */

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="ui-section-label">{children}</p>;
}

export function Properties({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-on-surface-variant">{item.label}</dt>
          <dd className="text-on-surface min-w-0 truncate">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
