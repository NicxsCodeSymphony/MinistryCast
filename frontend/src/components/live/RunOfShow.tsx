import { useEffect, useRef, type HTMLAttributes } from "react";
import Icon from "../Icon";
import type { LiveCue, SetlistItem } from "../../lib/types";

export function itemIcon(type: SetlistItem["item_type"] | undefined) {
  switch (type) {
    case "song":
      return "music_note";
    case "sermon":
      return "record_voice_over";
    case "scripture":
      return "menu_book";
    case "roster":
      return "assignment_ind";
    default:
      return "movie";
  }
}

/**
 * Run of show: one compact row per setlist item. The current item is
 * highlighted; clicking a row jumps to its first slide. Rows can be held and
 * dragged to reorder while live (bindItem from useHoldReorder).
 */
export default function RunOfShow({
  items,
  cues,
  activeItemId,
  live,
  onJump,
  bindItem,
}: {
  items: SetlistItem[];
  cues: LiveCue[];
  activeItemId?: string;
  live: boolean;
  onJump: (cueIndex: number) => void;
  bindItem: (id: string) => HTMLAttributes<HTMLElement>;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current?.parentElement;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-item-id="${activeItemId}"]`);
    if (!list || !row || !list.clientHeight) return;
    const top = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeItemId]);

  return (
    <ol ref={listRef} className="py-1">
      {items.map((item, itemIndex) => {
        const first = cues.findIndex((cue) => cue.itemId === item.id);
        const count = cues.reduce((n, cue) => (cue.itemId === item.id ? n + 1 : n), 0);
        const current = item.id === activeItemId;
        const empty = first === -1;
        const hold = bindItem(item.id);
        const jump = () => {
          if (!empty) onJump(first);
        };
        return (
          <li key={item.id} data-item-id={item.id}>
          <div
            {...hold}
            role="button"
            tabIndex={empty ? -1 : 0}
            aria-current={current ? "true" : undefined}
            aria-disabled={empty || undefined}
            onClick={jump}
            onKeyDown={(event) => {
              if (event.key === "Enter") jump();
            }}
            title={live ? "Click to show · hold and drag to reorder" : undefined}
            className={`group relative flex items-center gap-2.5 h-10 pl-4 pr-3 select-none transition-colors ${
              live ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
            } ${
              current
                ? "bg-primary/10 text-on-surface shadow-[inset_2px_0_0_var(--mc-primary)]"
                : empty
                  ? "text-on-surface-variant/60 cursor-default"
                  : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
            }`}
          >
            <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-on-surface-variant">
              {itemIndex + 1}
            </span>
            <Icon
              name={itemIcon(item.item_type)}
              className={`text-[15px] shrink-0 ${current ? "text-primary" : ""}`}
            />
            <span
              className={`min-w-0 flex-1 truncate text-[13px] ${current ? "font-medium" : ""}`}
            >
              {item.title}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-on-surface-variant">
              {empty ? "—" : count}
            </span>
          </div>
          </li>
        );
      })}
    </ol>
  );
}
