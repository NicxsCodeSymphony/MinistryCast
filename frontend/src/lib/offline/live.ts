import type { Presentation, Setlist } from "../types";

const PRESENTATION_CHANNEL = "mc-presentation";
const CONTENT_CHANNEL = "mc-content";

function openChannel(name: string) {
  try {
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}

export function setlistFingerprint(setlist: Setlist | null) {
  if (!setlist) return "";
  return JSON.stringify(
    (setlist.items ?? []).map((item) => [
      item.id,
      item.sort_order,
      item.title,
      item.song?.lyric_sections?.map((row) => [
        row.id,
        row.section,
        row.content,
        row.sort_order,
      ]),
      item.sermon?.title,
      item.sermon?.text_size,
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
  const bus = openChannel(PRESENTATION_CHANNEL);
  if (!bus) return;
  bus.postMessage({ type: "update", row });
  bus.close();
}

export function subscribeLocalPresentation(
  id: string,
  onChange: (row: Presentation) => void,
) {
  const bus = openChannel(PRESENTATION_CHANNEL);
  if (!bus) return () => undefined;
  bus.onmessage = (event: MessageEvent<{ type?: string; row?: Presentation }>) => {
    if (event.data?.row?.id === id) onChange(event.data.row);
  };
  return () => bus.close();
}

export function publishContent() {
  const bus = openChannel(CONTENT_CHANNEL);
  if (!bus) return;
  bus.postMessage({ type: "content" });
  bus.close();
}

export function subscribeContent(onChange: () => void) {
  const bus = openChannel(CONTENT_CHANNEL);
  if (!bus) return () => undefined;
  bus.onmessage = () => onChange();
  return () => bus.close();
}
