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
import Icon from "../components/Icon";

export type ToastKind = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ProgressItem = {
  id: string;
  message: string;
};

type ToastApi = {
  push: (kind: ToastKind, message: string) => void;
  /** Show a spinner toast under `id` until called again with `null`. */
  progress: (id: string, message: string | null) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const STYLE: Record<ToastKind, { icon: string; tone: string; label: string }> = {
  success: { icon: "check", tone: "toast-success", label: "Done" },
  error: { icon: "close", tone: "toast-error", label: "Oops" },
  warning: { icon: "warning", tone: "toast-warning", label: "Heads up" },
  info: { icon: "info", tone: "toast-info", label: "Note" },
};

const DURATION: Record<ToastKind, number> = {
  success: 3800,
  info: 3800,
  warning: 5600,
  error: 7000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [tasks, setTasks] = useState<ProgressItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const progress = useCallback((id: string, message: string | null) => {
    setTasks((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (!message) return index === -1 ? prev : prev.filter((row) => row.id !== id);
      if (index === -1) return [...prev, { id, message }];
      if (prev[index].message === message) return prev;
      return prev.map((row) => (row.id === id ? { id, message } : row));
    });
  }, []);

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
      const ms = DURATION[kind];
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
      progress,
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      warning: (message) => push("warning", message),
      info: (message) => push("info", message),
    }),
    [push, progress],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        // Bottom-right stack. Toasts are click-through (only their close button
        // takes clicks) so they never block the buttons underneath them.
        <div
          className="pointer-events-none fixed bottom-6 right-6 z-[200] flex w-[min(22rem,calc(100vw-3rem))] flex-col items-end gap-3"
          aria-live="polite"
        >
          {tasks.map((row) => (
            <div key={row.id} className="toast-sticker toast-info toast-pop" role="status">
              <span className="toast-badge">
                <Icon name="progress_activity" className="text-[15px] animate-spin" />
              </span>
              <p className="toast-text">{row.message}</p>
            </div>
          ))}
          {toasts.map((row) => {
            const look = STYLE[row.kind];
            return (
              <div
                key={row.id}
                className={`toast-sticker ${look.tone} toast-pop`}
                role={row.kind === "error" ? "alert" : "status"}
              >
                <span className="toast-badge" aria-hidden="true">
                  <Icon name={look.icon} className="text-[15px]" strokeWidth={3} />
                </span>
                <p className="toast-text">
                  <span className="sr-only">{look.label}: </span>
                  {row.message}
                </p>
                <button
                  type="button"
                  onClick={() => dismiss(row.id)}
                  className="toast-close"
                  aria-label="Dismiss"
                >
                  <Icon name="close" className="text-[13px]" strokeWidth={2.5} />
                </button>
                <span
                  className="toast-timer"
                  style={{ animationDuration: `${DURATION[row.kind]}ms` }}
                  aria-hidden="true"
                />
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
