import { useEffect, useMemo, useState } from "react";
import { PageSkeleton } from "../../components/Skeleton";
import {
  listSignupRequests,
  reviewSignup,
  type SignupRequest,
} from "../../lib/auth";
import { useSearch } from "../../lib/SearchContext";
import { useToast } from "../../lib/ToastContext";

export default function Approvals() {
  const toast = useToast();
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { query } = useSearch();

  const load = async () => {
    setError("");
    try {
      setRequests(await listSignupRequests());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requests.");
      toast.error(err instanceof Error ? err.message : "Could not load requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const review = async (churchId: string, action: "approve" | "reject") => {
    setBusyId(churchId);
    setError("");
    try {
      setRequests(await reviewSignup(churchId, action));
      toast.success(action === "approve" ? "Church approved." : "Request rejected.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update request.";
      setError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((row) =>
      [
        row.church_name,
        row.church_email,
        row.applicant_name,
        row.applicant_email,
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [requests, query]);

  const pending = visible.filter((row) => row.status === "pending");
  const rejected = visible.filter((row) => row.status === "rejected");

  return (
    <section className="h-full overflow-y-auto custom-scrollbar relative px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <header className="mb-8 sm:mb-10 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface mb-1">
            Ministry approvals
          </h2>
          <p className="text-on-surface-variant">
            Approve or reject churches waiting to use MinistryCast.
          </p>
        </div>
      </header>

      {error ? (
        <p className="mb-6 text-sm text-[#ffb4ab]">{error}</p>
      ) : null}

      <div className="glass-card rounded-xl p-6 sm:p-8">
        <p className="text-primary text-[12px] font-semibold tracking-[0.05em] uppercase mb-6">
          Pending ({pending.length})
        </p>

        {loading ? (
          <PageSkeleton />
        ) : pending.length === 0 ? (
          <p className="text-on-surface-variant text-sm">
            {query.trim()
              ? `No pending requests match “${query.trim()}”.`
              : "No churches are waiting for review."}
          </p>
        ) : (
          <ul className="space-y-4">
            {pending.map((row) => (
              <li
                key={row.church_id}
                className="flex flex-col gap-4 sm:flex-row sm:items-center bg-white/5 p-4 rounded-xl border border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-[18px] text-on-surface truncate">
                    {row.church_name}
                  </h4>
                  <p className="text-on-surface-variant text-sm truncate">
                    {row.applicant_name} · {row.applicant_email}
                  </p>
                  <p className="text-on-surface-variant/70 text-xs mt-1">
                    Requested {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === row.church_id}
                    onClick={() => void review(row.church_id, "reject")}
                    className="min-h-10 px-4 rounded-lg border border-white/10 text-sm text-on-surface-variant hover:bg-white/5 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.church_id}
                    onClick={() => void review(row.church_id, "approve")}
                    className="min-h-10 px-4 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    {busyId === row.church_id ? "Saving…" : "Approve"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {rejected.length > 0 ? (
        <div className="glass-card rounded-xl p-6 sm:p-8 mt-6">
          <p className="text-on-surface-variant text-[12px] font-semibold tracking-[0.05em] uppercase mb-6">
            Rejected ({rejected.length})
          </p>
          <ul className="space-y-3">
            {rejected.map((row) => (
              <li
                key={row.church_id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5"
              >
                <div className="min-w-0">
                  <p className="font-medium text-on-surface truncate">
                    {row.church_name}
                  </p>
                  <p className="text-on-surface-variant text-sm truncate">
                    {row.applicant_email}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === row.church_id}
                  onClick={() => void review(row.church_id, "approve")}
                  className="min-h-10 px-4 rounded-lg border border-primary/40 text-sm text-primary hover:bg-primary/10 disabled:opacity-50 shrink-0"
                >
                  Approve anyway
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
