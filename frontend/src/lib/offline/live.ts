import type { LyricTextStyle } from "../lyricTextStyle";
import type { Presentation, Setlist } from "../types";
import { invalidateQueries } from "./queryCache";

const PRESENTATION_CHANNEL = "mc-presentation";
const CONTENT_CHANNEL = "mc-content";
const STAGE_CHANNEL = "mc-stage";
const CONTENT_TICK_KEY = "mc-content-tick";
const PRESENTATION_TICK_KEY = "mc-presentation-tick";
const STAGE_TICK_KEY = "mc-stage-tick";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function openChannel(name: string) {
  try {
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}

function writeTick(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

async function emitDesktop(name: string, payload?: unknown) {
  if (!isTauri()) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(name, payload);
  } catch {
    /* capability or runtime missing */
  }
}

async function listenDesktop<T>(name: string, onEvent: (payload: T) => void) {
  if (!isTauri()) return () => undefined;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<T>(name, (event) => onEvent(event.payload));
  } catch {
    return () => undefined;
  }
}

export type StageSnapshot = {
  setlistId: string;
  setlist: Setlist;
  font: string;
  lyricSize: string;
  lyricStyle: LyricTextStyle;
  stageBg: string;
  transitionStyle: string;
  at: number;
};

export function setlistFingerprint(setlist: Setlist | null) {
  if (!setlist) return "";
  return JSON.stringify(
    (setlist.items ?? []).map((item) => [
      item.id,
      item.sort_order,
      item.title,
      item.song?.updated_at,
      item.song?.lyric_sections?.map((row) => [
        row.id,
        row.section,
        row.content,
        row.sort_order,
      ]),
      item.sermon?.title,
      item.sermon?.text_size,
      item.sermon?.updated_at,
      item.sermon?.slides?.map((row) => [
        row.id,
        row.content,
        row.scripture_reference,
        row.sort_order,
      ]),
      item.passage?.reference,
      item.passage?.text,
      item.payload,
    ]),
  );
}

export function publishPresentation(row: Presentation) {
  const message = { type: "update", row };
  const bus = openChannel(PRESENTATION_CHANNEL);
  if (bus) {
    bus.postMessage(message);
    bus.close();
  }
  writeTick(PRESENTATION_TICK_KEY, { t: Date.now(), row });
  void emitDesktop("mc-presentation", row);
}

export function subscribeLocalPresentation(
  id: string,
  onChange: (row: Presentation) => void,
) {
  const bus = openChannel(PRESENTATION_CHANNEL);
  if (bus) {
    bus.onmessage = (event: MessageEvent<{ type?: string; row?: Presentation }>) => {
      if (event.data?.row?.id === id) onChange(event.data.row);
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PRESENTATION_TICK_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as { row?: Presentation };
      if (parsed.row?.id === id) onChange(parsed.row);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("storage", onStorage);
  let stopDesktop: () => void = () => undefined;
  void listenDesktop<Presentation>("mc-presentation", (row) => {
    if (row?.id === id) onChange(row);
  }).then((stop) => {
    stopDesktop = stop;
  });
  return () => {
    bus?.close();
    window.removeEventListener("storage", onStorage);
    stopDesktop();
  };
}

export function publishContent() {
  const bus = openChannel(CONTENT_CHANNEL);
  if (bus) {
    bus.postMessage({ type: "content" });
    bus.close();
  }
  writeTick(CONTENT_TICK_KEY, Date.now());
  void emitDesktop("mc-content");
}

export function subscribeContent(onChange: () => void) {
  const fire = () => {
    invalidateQueries();
    onChange();
  };
  const bus = openChannel(CONTENT_CHANNEL);
  if (bus) bus.onmessage = () => fire();
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONTENT_TICK_KEY) fire();
  };
  window.addEventListener("storage", onStorage);
  let stopDesktop: () => void = () => undefined;
  void listenDesktop("mc-content", fire).then((stop) => {
    stopDesktop = stop;
  });
  return () => {
    bus?.close();
    window.removeEventListener("storage", onStorage);
    stopDesktop();
  };
}

export function publishStageSnapshot(snapshot: StageSnapshot) {
  const bus = openChannel(STAGE_CHANNEL);
  if (bus) {
    bus.postMessage(snapshot);
    bus.close();
  }
  writeTick(STAGE_TICK_KEY, snapshot);
  void emitDesktop("mc-stage", snapshot);
}

export function subscribeStageSnapshot(onChange: (snapshot: StageSnapshot) => void) {
  const bus = openChannel(STAGE_CHANNEL);
  if (bus) {
    bus.onmessage = (event: MessageEvent<StageSnapshot>) => {
      if (event.data?.setlist) onChange(event.data);
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STAGE_TICK_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as StageSnapshot;
      if (parsed?.setlist) onChange(parsed);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("storage", onStorage);
  let stopDesktop: () => void = () => undefined;
  void listenDesktop<StageSnapshot>("mc-stage", (snapshot) => {
    if (snapshot?.setlist) onChange(snapshot);
  }).then((stop) => {
    stopDesktop = stop;
  });
  return () => {
    bus?.close();
    window.removeEventListener("storage", onStorage);
    stopDesktop();
  };
}
