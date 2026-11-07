import type { ReactNode } from "react";
import { IconButton } from "../ui";

/**
 * Detail pane that slides in beside a Platform roster. The list shrinks, the
 * pane takes ~400px on the right. `aria-hidden` reflects whether it is open.
 */
export function EditorPane({
  open,
  onClose,
  title,
  subtitle,
  leading,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: ReactNode;
  leading?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <aside
      aria-hidden={!open}
      className={`overflow-hidden shrink-0 transition-[width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open
          ? "w-[min(400px,44%)] opacity-100 translate-x-0 border-l border-white/5"
          : "w-0 opacity-0 translate-x-6 pointer-events-none"
      }`}
    >
      <div className="w-[min(400px,44vw)] min-w-[300px] h-full flex flex-col bg-surface-container-low">
        {title ? (
          <>
            <div className="flex items-start gap-3 px-5 pt-4 pb-4 border-b border-white/5 shrink-0">
              {leading}
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-on-surface truncate">{title}</h2>
                {subtitle ? (
                  <div className="text-[12px] text-on-surface-variant mt-0.5 truncate">{subtitle}</div>
                ) : null}
              </div>
              <IconButton icon="close" label="Close" onClick={onClose} />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-5">{children}</div>
            {footer ? (
              <div className="px-5 py-3 border-t border-white/5 flex items-center gap-2 shrink-0">
                {footer}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[12px] font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}
