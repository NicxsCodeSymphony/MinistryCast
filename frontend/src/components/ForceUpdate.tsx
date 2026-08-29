import { useCallback, useEffect, useState } from "react";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type Phase = "hidden" | "checking" | "downloading" | "restarting" | "error";

export default function ForceUpdate() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [nextVersion, setNextVersion] = useState("");
  const [percent, setPercent] = useState(0);

  const run = useCallback(async () => {
    if (!isTauri() || import.meta.env.DEV) return;
    setPhase("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        setPhase("hidden");
        return;
      }
      setNextVersion(update.version);
      setPhase("downloading");
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          downloaded = 0;
        }
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) setPercent(Math.min(100, Math.round((downloaded / total) * 100)));
        }
        if (event.event === "Finished") setPercent(100);
      });
      setPhase("restarting");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void run();
    const id = window.setInterval(() => void run(), 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [run]);

  useEffect(() => {
    if (phase !== "error") return;
    const id = window.setTimeout(() => void run(), 12_000);
    return () => window.clearTimeout(id);
  }, [phase, run]);

  if (phase === "hidden" || phase === "checking") return null;

  const label =
    phase === "restarting"
      ? "Restarting…"
      : phase === "error"
        ? "Update failed. Retrying from Settings is not needed — retrying automatically."
        : `Downloading ${nextVersion}…`;

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B0B14]/92 backdrop-blur-md flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-container p-8 text-center">
        <p className="text-[10px] tracking-[0.2em] font-bold text-[#4FACFE]">MINISTRYCAST</p>
        <h2 className="mt-4 text-2xl font-semibold text-on-surface">Required update</h2>
        <p className="mt-3 text-sm text-on-surface-variant">{label}</p>
        {phase === "downloading" ? (
          <div className="mt-6 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-[#4FACFE] transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
        {phase === "error" ? (
          <button
            type="button"
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
            onClick={() => void run()}
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
