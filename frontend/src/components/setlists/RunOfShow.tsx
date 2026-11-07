/**
 * Run of show: the original item-card layout of the open setlist (drag handle,
 * type tile, title + meta, duration/type on the right, hover remove, dashed
 * connector between cards, "Add Service Item" below), lightly refined.
 */
import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import Icon from "../Icon";
import { itemMeta } from "../../lib/api";
import { formatDuration } from "../../lib/helpers";
import type { SetlistItem } from "../../lib/types";

export const ITEM_TYPES: Record<
  SetlistItem["item_type"],
  { label: string; icon: string; tint: string }
> = {
  song: { label: "Song", icon: "music_note", tint: "bg-primary/10 text-primary" },
  sermon: { label: "Sermon", icon: "record_voice_over", tint: "bg-tertiary/10 text-tertiary" },
  scripture: { label: "Scripture", icon: "menu_book", tint: "bg-secondary/10 text-secondary" },
  media: { label: "Media", icon: "movie", tint: "bg-tertiary/10 text-tertiary" },
  roster: { label: "Assignments", icon: "assignment_ind", tint: "bg-secondary/10 text-secondary" },
};

type Props = {
  /** Every item of the setlist (used for the empty state). */
  items: SetlistItem[];
  /** Items shown after the search filter. */
  visible: SetlistItem[];
  canManage: boolean;
  bind: (id: string) => HTMLAttributes<HTMLElement> & Record<string, unknown>;
  onRemove: (item: SetlistItem) => void;
  onAddItem: () => void;
  noMatch: ReactNode;
};

export default function RunOfShow({
  items,
  visible,
  canManage,
  bind,
  onRemove,
  onAddItem,
  noMatch,
}: Props) {
  return (
    <div>
      <ol aria-label="Run of show">
        {visible.map((item, index) => {
          const type = ITEM_TYPES[item.item_type] ?? ITEM_TYPES.media;
          const href =
            item.item_type === "song" && item.song_id
              ? `/songs?song=${item.song_id}`
              : item.item_type === "sermon" && item.sermon_id
                ? `/sermon?sermon=${item.sermon_id}`
                : null;
          const hold = canManage ? bind(item.id) : {};
          const title = (
            <h4
              className={`text-[14px] font-semibold text-on-surface truncate ${
                href ? "hover:text-primary" : ""
              }`}
            >
              {item.title}
            </h4>
          );
          return (
            <li key={item.id} className="group relative">
              <div
                {...hold}
                className={`rounded-xl border border-white/5 bg-surface-container px-4 py-3 flex items-center gap-3 sm:gap-4 transition-colors hover:border-white/10 hover:bg-surface-container-high select-none touch-none ${
                  canManage ? "cursor-grab active:cursor-grabbing" : ""
                }`}
              >
                {canManage ? (
                  <span
                    className="text-outline group-hover:text-on-surface-variant shrink-0 transition-colors"
                    aria-hidden
                  >
                    <Icon name="drag_indicator" className="text-[18px]" />
                  </span>
                ) : null}
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${type.tint}`}
                >
                  <Icon name={type.icon} className="text-[18px]" />
                </div>
                <div className="flex-1 min-w-0">
                  {href ? (
                    <Link to={href} data-hold-ignore className="block min-w-0">
                      {title}
                    </Link>
                  ) : (
                    title
                  )}
                  <p className="text-[12px] text-on-surface-variant truncate mt-0.5">
                    {itemMeta(item) || item.subtitle}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-medium tabular-nums text-primary">
                    {formatDuration(item.duration_seconds)}
                  </div>
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-0.5">
                    {item.item_type === "roster" ? "assignments" : item.item_type}
                  </div>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => onRemove(item)}
                    className="ui-icon-btn ui-icon-btn-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label="Remove item"
                    title="Remove item"
                  >
                    <Icon name="close" className="text-[16px]" />
                  </button>
                ) : null}
              </div>
              {index < visible.length - 1 ? (
                <div
                  aria-hidden
                  className={`relative h-6 border-l border-dashed border-primary/25 ${
                    canManage ? "ml-[66px] sm:ml-[70px]" : "ml-[36px]"
                  }`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {visible.length === 0 && items.length > 0 ? noMatch : null}

      {items.length === 0 ? (
        <p className="text-[13px] text-on-surface-variant text-center pt-10">
          {canManage
            ? "No items yet. Add songs from the library, or a sermon, scripture, media or assignments."
            : "This setlist has no items yet."}
        </p>
      ) : null}

      {canManage ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={onAddItem}
            className="flex items-center gap-2 h-10 px-5 rounded-xl border border-dashed border-white/15 text-on-surface-variant hover:text-on-surface hover:border-primary/50 hover:bg-surface-container transition-colors"
          >
            <Icon name="add_circle" className="text-[18px] text-primary" />
            <span className="text-[13px] font-medium">Add Service Item</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
