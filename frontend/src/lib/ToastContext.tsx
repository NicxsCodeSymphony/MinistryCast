import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ToastKind = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastApi = {
  push: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const STYLE: Record<
  ToastKind,
  { icon: string; bar: string; iconClass: string }
> = {
  success: {
    icon: "check_circle",
    bar: "bg-emerald-400",
    iconClass: "text-emerald-400",
  },
  error: {
    icon: "error",
    bar: "bg-[#ffb4ab]",
    iconClass: "text-[#ffb4ab]",
  },
  warning: {
    icon: "warning",
    bar: "bg-amber-400",
    iconClass: "text-amber-400",
  },
  info: {
    icon: "info",
    bar: "bg-primary",
    iconClass: "text-primary",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const text = message.trim();
      if (!text) return;
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-4), { id, kind, message: text }]);
      const ms = kind === "error" ? 7000 : kind === "warning" ? 5600 : 3800;
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), ms),
      );
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      warning: (message) => push("warning", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-6 right-6 z-[200] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map((row) => {
            const look = STYLE[row.kind];
            return (
              <div
                key={row.id}
                className="pointer-events-auto toast-in relative overflow-hidden rounded-xl border border-white/10 bg-surface-container-high shadow-2xl"
                role={row.kind === "error" ? "alert" : "status"}
              >
                <div className={`absolute inset-y-0 left-0 w-1 ${look.bar}`} />
                <div className="flex items-start gap-3 py-3 pl-4 pr-2">
                  <span
                    className={`material-symbols-outlined filled mt-0.5 text-[22px] ${look.iconClass}`}
                  >
                    {look.icon}
                  </span>
                  <p className="min-w-0 flex-1 pt-0.5 text-sm leading-snug text-on-surface">
                    {row.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => dismiss(row.id)}
                    className="shrink-0 rounded-lg p-1 text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                    aria-label="Dismiss"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      close
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider.");
  return ctx;
}
