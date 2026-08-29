import { invoke } from "@tauri-apps/api/core";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openProjectorWindow(presentationId: string) {
  const path = `output?presentation=${encodeURIComponent(presentationId)}`;
  if (!isTauri()) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.open(
      `${base}/output?presentation=${encodeURIComponent(presentationId)}`,
      "ministrycast-output",
      "noopener,noreferrer",
    );
    return;
  }
  await invoke("open_projector", { path });
}

export async function closeProjectorWindow() {
  if (!isTauri()) return;
  await invoke("close_projector");
}
