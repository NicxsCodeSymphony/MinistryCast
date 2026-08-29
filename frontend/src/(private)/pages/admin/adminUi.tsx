export function statusTone(status: string) {
  if (status === "active") return "bg-primary/15 text-primary border-primary/30";
  if (status === "pending") return "bg-secondary/15 text-secondary border-secondary/30";
  if (status === "suspended" || status === "disabled" || status === "rejected") {
    return "bg-error/15 text-error border-error/30";
  }
  return "bg-white/10 text-on-surface-variant border-white/10";
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${statusTone(status)}`}
    >
      {status === "disabled" ? "suspended" : status}
    </span>
  );
}

export function formatWhen(iso?: string | null) {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Never";
  return date.toLocaleString();
}
