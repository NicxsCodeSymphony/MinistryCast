import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import UnsavedDialog from "../components/modals/UnsavedDialog";

type UnsavedDraftOptions = {
  enabled?: boolean;
  title?: string;
  description?: string;
  onSave?: () => boolean | void | Promise<boolean | void>;
};

export function useUnsavedDraft(
  dirty: boolean,
  options: UnsavedDraftOptions = {},
) {
  const enabled = options.enabled ?? true;
  const skipRef = useRef(false);
  const pendingRef = useRef<(() => void) | null>(null);
  const dirtyRef = useRef(dirty);
  const enabledRef = useRef(enabled);
  const saveRef = useRef(options.onSave);
  dirtyRef.current = dirty;
  enabledRef.current = enabled;
  saveRef.current = options.onSave;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const shouldBlock = useCallback(
    ({
      currentLocation,
      nextLocation,
    }: {
      currentLocation: { pathname: string; search: string };
      nextLocation: { pathname: string; search: string };
    }) => {
      if (skipRef.current) return false;
      if (!enabledRef.current || !dirtyRef.current) return false;
      return (
        currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search
      );
    },
    [],
  );
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (blocker.state === "blocked") setOpen(true);
  }, [blocker.state]);

  useEffect(() => {
    if (!enabled || !dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, enabled]);

  const bypass = useCallback((next: () => void) => {
    skipRef.current = true;
    next();
    queueMicrotask(() => {
      skipRef.current = false;
    });
  }, []);

  const stay = useCallback(() => {
    if (busy) return;
    setOpen(false);
    pendingRef.current = null;
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker, busy]);

  const finishLeave = useCallback(() => {
    skipRef.current = true;
    const next = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    if (blocker.state === "blocked") blocker.proceed();
    else next?.();
    queueMicrotask(() => {
      skipRef.current = false;
    });
  }, [blocker]);

  const discard = useCallback(() => {
    if (busy) return;
    finishLeave();
  }, [busy, finishLeave]);

  const save = useCallback(async () => {
    const persist = saveRef.current;
    if (!persist) {
      finishLeave();
      return;
    }
    setBusy(true);
    try {
      const ok = await persist();
      if (ok === false) return;
      finishLeave();
    } catch {
      /* Keep the reminder open so the draft is not thrown away. */
    } finally {
      setBusy(false);
    }
  }, [finishLeave]);

  const guard = useCallback((next: () => void) => {
    if (!enabledRef.current || !dirtyRef.current || skipRef.current) {
      next();
      return;
    }
    pendingRef.current = next;
    setOpen(true);
  }, []);

  const dialog = (
    <UnsavedDialog
      open={open}
      busy={busy}
      title={options.title}
      description={options.description}
      showSave={Boolean(options.onSave)}
      onStay={stay}
      onDiscard={discard}
      onSave={options.onSave ? () => void save() : undefined}
    />
  );

  return { guard, bypass, dialog };
}
