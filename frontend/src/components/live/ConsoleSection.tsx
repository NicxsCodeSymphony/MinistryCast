import { useId, type ReactNode } from "react";
import Icon from "../Icon";

/**
 * One collapsible "Stage settings" section on the operator console.
 * The parent owns which section is open so only one is expanded at a time.
 */
export default function ConsoleSection({
  id,
  title,
  summary,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  /** Muted current value shown on the closed header, e.g. "Inter · 72px". */
  summary?: ReactNode;
  icon: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <section className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(id)}
        className="w-full h-10 flex items-center gap-2.5 px-4 text-left hover:bg-white/5 transition-colors"
      >
        <Icon name={icon} className="text-[15px] text-on-surface-variant shrink-0" />
        <span className="text-[13px] font-medium text-on-surface shrink-0">{title}</span>
        {summary != null && !open ? (
          <span className="min-w-0 flex-1 truncate text-right text-[12px] text-on-surface-variant">
            {summary}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <Icon
          name="expand_more"
          className={`text-[16px] text-on-surface-variant shrink-0 transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open ? (
        <div id={panelId} className="px-4 pb-4 pt-1 space-y-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}
