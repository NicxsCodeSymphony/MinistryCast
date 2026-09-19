import { useEffect, useMemo, useState } from "react";
import { PageSkeleton } from "../../components/Skeleton";
import {
  getSessionProfile,
  isChurchAdmin,
  isSuperadmin,
  listApprovalRequests,
  reviewMemberJoin,
  reviewSignup,
  type ApprovalRequest,
  type SessionProfile,
} from "../../lib/auth";
import { peekQuery } from "../../lib/offline/queryCache";
import { useToast } from "../../lib/ToastContext";

type ApprovalsPanelProps = {
  /** Compact layout for Settings tabs. */
  embedded?: boolean;
  /** Limit which queues to show. */
  mode?: "all" | "church" | "platform";
};

export default function ApprovalsPanel({
  embedded = false,
  mode = "all",
}: ApprovalsPanelProps) {
  const toast = useToast();
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [requests, setRequests] = useState<ApprovalRequest[]>(
    () => peekQuery<ApprovalRequest[]>("approval-requests") ?? [],
  );
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    () => !peekQuery<ApprovalRequest[]>("approval-requests"),
  );
  const [query, setQuery] = useState("");
  const superadmin = profile ? isSuperadmin(profile) : false;
  const churchAdmin = profile ? isChurchAdmin(profile) : false;

  const load = async (fresh = false) => {
    setError("");
    try {
      const [nextProfile, rows] = await Promise.all([
        getSessionProfile(),
        listApprovalRequests({ fresh }),
      ]);
      setProfile(nextProfile);
      setRequests(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requests.");
      toast.error(err instanceof Error ? err.message : "Could not load requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  const review = async (row: ApprovalRequest, action: "approve" | "reject") => {
    setBusyId(row.id);
    setError("");
    try {
      if (row.kind === "church") {
        setRequests(await reviewSignup(row.church_id, action));
        toast.success(
          action === "approve"
            ? "Church approved and activated."
            : "Church request rejected.",
        );
      } else {
        setRequests(await reviewMemberJoin(row.applicant_id, action));
        toast.success(
          action === "approve"
            ? "Member approved and set to active."
            : "Join request rejected.",
        );
      }
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
        row.kind,
        row.phase,
      ].some((value) => (value ?? "").toLowerCase().includes(q)),
    );
  }, [requests, query]);

  const churchPending = visible.filter(
    (row) => row.kind === "church" && row.status === "pending",
  );
  const churchRejected = visible.filter(
    (row) => row.kind === "church" && row.status === "rejected",
  );
  const memberChurchPhase = visible.filter(
    (row) =>
      row.kind === "member" &&
      (row.phase === "church" || row.phase === "platform"),
  );
  const memberPlatformPhase = visible.filter(
    (row) => row.kind === "member" && row.phase === "platform",
  );

  const showChurchAdminQueue =
    mode !== "platform" && churchAdmin && !superadmin;
  const showSuperadminQueue = mode !== "church" && superadmin;

  if (loading) {
    return embedded ? (
      <div className="space-y-3">
        <div className="h-6 w-40 rounded skeleton" />
        <div className="h-24 rounded-xl skeleton" />
      </div>
    ) : (
      <PageSkeleton />
    );
  }

  return (
    <div className={embedded ? "space-y-5" : "space-y-6"}>
      {!embedded ? (
        <header className="flex flex-col gap-2">
          <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-tight text-on-surface">
            Approvals
          </h2>
          <p className="text-on-surface-variant text-sm">
            {superadmin
              ? "Approve new churches and activate members."
              : "Approve people who asked to join your church. Approved members become active right away."}
          </p>
        </header>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-on-surface mb-1">
              Approvals
            </h2>
            <p className="text-sm text-on-surface-variant">
              {superadmin
                ? "New churches and members. Approve sets status to active."
                : "Join requests for your church. Approve sets status to active."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-white/5"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Refresh
          </button>
        </div>
      )}

      {embedded ? (
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
            search
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search requests…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface border border-outline-variant text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-[#ffb4ab]">{error}</p> : null}

      {showChurchAdminQueue ? (
        <RequestPanel
          title={`Join requests (${memberChurchPhase.length})`}
          empty="No one is waiting for your approval."
          rows={memberChurchPhase}
          busyId={busyId}
          onReview={review}
          approveLabel="Approve & activate"
        />
      ) : null}

      {showSuperadminQueue ? (
        <>
          <RequestPanel
            title={`New churches (${churchPending.length})`}
            empty="No churches waiting for review."
            rows={churchPending}
            busyId={busyId}
            onReview={review}
            approveLabel="Approve & activate"
          />
          <RequestPanel
            title={`Members (${memberPlatformPhase.length || memberChurchPhase.filter((r) => r.phase === "platform").length})`}
            empty="No members waiting for activation."
            rows={
              memberPlatformPhase.length
                ? memberPlatformPhase
                : memberChurchPhase.filter((r) => r.phase === "platform")
            }
            busyId={busyId}
            onReview={review}
            approveLabel="Approve & activate"
          />
          {churchRejected.length > 0 ? (
            <RequestPanel
              title={`Rejected churches (${churchRejected.length})`}
              empty=""
              rows={churchRejected}
              busyId={busyId}
              onReview={review}
              approveLabel="Re-approve & activate"
              showReject={false}
            />
          ) : null}
        </>
      ) : null}

      {!showChurchAdminQueue && !showSuperadminQueue ? (
        <p className="text-sm text-on-surface-variant">
          No approval queues for your role.
        </p>
      ) : null}
    </div>
  );
}

function RequestPanel({
  title,
  empty,
  rows,
  busyId,
  onReview,
  approveLabel,
  showReject = true,
}: {
  title: string;
  empty: string;
  rows: ApprovalRequest[];
  busyId: string | null;
  onReview: (row: ApprovalRequest, action: "approve" | "reject") => void;
  approveLabel: string;
  showReject?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-surface-container/40 p-4 sm:p-5">
      <p className="text-primary text-[11px] font-semibold tracking-[0.05em] uppercase mb-4">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-on-surface-variant text-sm">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={`${row.kind}-${row.id}`}
              className="flex flex-col gap-3 sm:flex-row sm:items-center bg-white/5 p-3.5 rounded-xl border border-white/5"
            >
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-on-surface truncate">
                  {row.kind === "church" ? row.church_name : row.applicant_name}
                </h4>
                <p className="text-on-surface-variant text-sm truncate">
                  {row.kind === "church"
                    ? `${row.applicant_name} · ${row.applicant_email}`
                    : `${row.applicant_email} · ${row.church_name}`}
                </p>
                <p className="text-on-surface-variant/70 text-xs mt-1">
                  {new Date(row.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {showReject ? (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void onReview(row, "reject")}
                    className="min-h-10 px-4 rounded-lg border border-white/10 text-sm text-on-surface-variant hover:bg-white/5 disabled:opacity-50"
                  >
                    Reject
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void onReview(row, "approve")}
                  className="min-h-10 px-4 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-50"
                >
                  {approveLabel}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
