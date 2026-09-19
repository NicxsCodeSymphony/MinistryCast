import { useCallback, useEffect, useRef, useState } from "react";
import { BUNDLED_VERSION, readAppVersion } from "../lib/appVersion";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function errorMessage(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return "Could not reach the update server.";
}

type Phase = "hidden" | "checking" | "downloading" | "restarting" | "error";

export default function ForceUpdate() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [currentVersion, setCurrentVersion] = useState(BUNDLED_VERSION);
  const [nextVersion, setNextVersion] = useState("");
  const [percent, setPercent] = useState(0);
  const [detail, setDetail] = useState("");
  const installing = useRef(false);

  useEffect(() => {
    void readAppVersion().then(setCurrentVersion);
  }, []);

  const run = useCallback(async () => {
    if (!isTauri() || import.meta.env.DEV) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      if (getCurrentWindow().label === "projector") return;
    } catch {
      return;
    }
    installing.current = false;
    setPhase("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check({ timeout: 30_000 });
      if (!update) {
        setPhase("hidden");
        setDetail("");
        setNextVersion("");
        return;
      }
      installing.current = true;
      setNextVersion(update.version);
      setPhase("downloading");
      setPercent(0);
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
    } catch (err) {
      // A failed check is not an available update. Don't lock the app when
      // GitHub is slow, offline, or the install is already current.
      if (!installing.current) {
        setPhase("hidden");
        setDetail("");
        return;
      }
      setDetail(errorMessage(err));
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
        ? detail || "Update failed."
        : `Downloading ${nextVersion}…`;

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B0B14]/92 backdrop-blur-md flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-container p-8 text-center">
        <p className="text-[10px] tracking-[0.2em] font-bold text-[#4FACFE]">MINISTRYCAST</p>
        <h2 className="mt-4 text-2xl font-semibold text-on-surface">
          {phase === "error" ? "Update failed" : "Required update"}
        </h2>
        <p className="mt-3 text-sm font-medium text-on-surface">
          {nextVersion
            ? `${currentVersion} → ${nextVersion}`
            : `Installed ${currentVersion}`}
        </p>
        <p className="mt-2 text-sm text-on-surface-variant break-words">{label}</p>
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
