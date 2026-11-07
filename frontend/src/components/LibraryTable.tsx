import type { ReactNode } from "react";

/**
 * The library list container used by Songs, Setlists and Sermons: a bordered
 * surface with a sticky column header and compact rows. Visual rules mirror
 * the Songs table so the three libraries read as one system.
 */

export type LibraryColumn = {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  /** Hide on narrow screens. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

export type LibraryRow = {
  id: string;
  /** Accessible name of the row's open button. */
  label: string;
  onOpen: () => void;
  selected?: boolean;
  /** Small square tile shown before the first column (icon, date, thumb). */
  leading?: ReactNode;
  cells: Record<string, ReactNode>;
  /** Row actions (usually a RowMenu); clicks don't open the row. */
  actions?: ReactNode;
};

export type LibraryGroup = {
  id: string;
  label?: string;
  rows: LibraryRow[];
};

const HIDE: Record<NonNullable<LibraryColumn["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

export default function LibraryTable({
  columns,
  groups,
  ariaLabel,
  footer,
  className = "",
}: {
  columns: LibraryColumn[];
  groups: LibraryGroup[];
  ariaLabel: string;
  footer?: ReactNode;
  className?: string;
}) {
  const hasActions = groups.some((group) => group.rows.some((row) => row.actions));
  const span = columns.length + (hasActions ? 1 : 0);

  return (
    <div
      className={`flex-1 min-h-0 overflow-auto card-surface rounded-xl border border-white/5 custom-scrollbar ${className}`}
    >
      <table className="w-full text-left border-collapse min-w-[640px]" aria-label={ariaLabel}>
        <thead className="sticky top-0 bg-surface-container-high z-10">
          <tr className="border-b border-white/5">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 sm:px-5 h-9 text-[12px] font-medium text-on-surface-variant ${
                  ALIGN[col.align ?? "left"]
                } ${col.hideBelow ? HIDE[col.hideBelow] : ""} ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
            {hasActions ? (
              <th scope="col" className="w-12">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.id} className="divide-y divide-white/5">
            {group.label ? (
              <tr className="bg-surface-container-low">
                <th
                  scope="rowgroup"
                  colSpan={span}
                  className="px-4 sm:px-5 h-8 text-left text-[12px] font-medium text-on-surface-variant"
                >
                  {group.label}
                  <span className="ml-2 text-outline tabular-nums">{group.rows.length}</span>
                </th>
              </tr>
            ) : null}
            {group.rows.map((row) => (
              <tr
                key={row.id}
                onClick={row.onOpen}
                aria-selected={row.selected || undefined}
                className={`group cursor-pointer transition-colors ${
                  row.selected
                    ? "bg-primary/10 shadow-[inset_2px_0_0_var(--mc-primary)]"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                {columns.map((col, index) => (
                  <td
                    key={col.key}
                    className={`px-4 sm:px-5 py-2 text-sm ${
                      index === 0 ? "text-on-surface" : "text-on-surface-variant"
                    } ${ALIGN[col.align ?? "left"]} ${col.hideBelow ? HIDE[col.hideBelow] : ""} ${
                      col.className ?? ""
                    }`}
                  >
                    {index === 0 ? (
                      <button
                        type="button"
                        aria-label={row.label}
                        onClick={(event) => {
                          event.stopPropagation();
                          row.onOpen();
                        }}
                        className="flex items-center gap-3 min-w-0 w-full text-left outline-none focus-visible:underline"
                      >
                        {row.leading ? <span className="shrink-0">{row.leading}</span> : null}
                        <span className="min-w-0 font-medium text-[14px] text-on-surface truncate">
                          {row.cells[col.key]}
                        </span>
                      </button>
                    ) : (
                      row.cells[col.key]
                    )}
                  </td>
                ))}
                {hasActions ? (
                  <td className="pr-3 w-12" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 transition-opacity">
                      {row.actions}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {footer}
    </div>
  );
}

/** Square leading tile matching the Songs thumbnail size. */
export function LibraryTile({ children }: { children: ReactNode }) {
  return (
    <span className="w-11 h-11 rounded-lg bg-surface-container-high border border-white/10 flex items-center justify-center text-on-surface-variant">
      {children}
    </span>
  );
}
