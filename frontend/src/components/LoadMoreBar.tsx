export function LoadMoreBar({
  shown,
  total,
  hasMore,
  loading,
  onMore,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  loading?: boolean;
  onMore: () => void;
}) {
  if (total <= 0) return null;
  return (
    <div className="pt-4 flex flex-col items-center gap-2">
      <p className="text-xs text-on-surface-variant">
        Showing {shown} of {total}
      </p>
      {hasMore ? (
        <button
          type="button"
          disabled={loading}
          onClick={onMore}
          className="px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
