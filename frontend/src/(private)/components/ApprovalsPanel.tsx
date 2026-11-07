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
import Icon from "../../components/Icon";
import { SearchField } from "../../components/ui";
import { BentoCard, BentoGrid, Stat } from "../../components/bento";

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

  const platformMembers = memberPlatformPhase.length
    ? memberPlatformPhase
    : memberChurchPhase.filter((r) => r.phase === "platform");

  const showChurchAdminQueue =
    mode !== "platform" && churchAdmin && !superadmin;
  const showSuperadminQueue = mode !== "church" && superadmin;

  if (loading) {
    return embedded ? (
      <div className="space-y-8">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded skeleton" />
          <div className="h-3.5 w-72 rounded skeleton" />
        </div>
        <div className="h-8 rounded-lg skeleton" />
        <div className="h-28 rounded-[10px] skeleton" />
      </div>
    ) : (
      <PageSkeleton />
    );
  }

  return (
    <div className={embedded ? "space-y-8" : "space-y-6"}>
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
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[20px] font-semibold tracking-tight text-on-surface">
                Approvals
              </h2>
              <p className="mt-1 text-[13px] text-on-surface-variant">
                {superadmin
                  ? "New churches and members. Approve sets status to active."
                  : "Join requests for your church. Approve sets status to active."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load(true)}
              className="ui-btn ui-btn-ghost shrink-0"
            >
              <Icon name="refresh" className="text-[15px]" />
              Refresh
            </button>
          </div>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search requests…"
            className="w-full"
          />
        </div>
      )}

      {error ? <p className="text-[13px] text-error">{error}</p> : null}

      {showSuperadminQueue ? (
        <BentoGrid className="auto-rows-auto">
          <BentoCard span={4} aria-label="Churches waiting">
            <Stat
              label="Churches waiting"
              value={churchPending.length}
              hint={churchPending.length ? "Review and activate" : "All caught up"}
            />
          </BentoCard>
          <BentoCard span={4} aria-label="Members waiting">
            <Stat
              label="Members waiting"
              value={platformMembers.length}
              hint={platformMembers.length ? "Approved by their church" : "All caught up"}
            />
          </BentoCard>
          <BentoCard span={4} aria-label="Rejected churches">
            <Stat label="Rejected churches" value={churchRejected.length} hint="Can be re-approved" />
          </BentoCard>
        </BentoGrid>
      ) : null}

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
            rows={platformMembers}
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
    <section>
      <h3 className="mb-2.5 text-[13px] font-semibold text-on-surface">{title}</h3>
      <div className="card-surface rounded-xl border border-white/5 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-on-surface-variant text-[13px] flex items-center gap-2">
            <Icon name="check_circle" className="text-[15px] text-outline" />
            {empty}
          </p>
        ) : (
          <ul>
            {rows.map((row) => (
              <li
                key={`${row.kind}-${row.id}`}
                className="flex flex-col gap-3 sm:flex-row sm:items-center px-5 py-3 border-t border-white/5 first:border-t-0 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-on-surface truncate">
                    {row.kind === "church" ? row.church_name : row.applicant_name}
                  </p>
                  <p className="text-on-surface-variant text-[12px] truncate">
                    {row.kind === "church"
                      ? `${row.applicant_name} · ${row.applicant_email}`
                      : `${row.applicant_email} · ${row.church_name}`}
                  </p>
                </div>
                <span className="text-[12px] text-outline tabular-nums shrink-0">
                  {new Date(row.created_at).toLocaleString()}
                </span>
                <div className="flex gap-2 shrink-0">
                  {showReject ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void onReview(row, "reject")}
                      className="ui-btn ui-btn-ghost ui-btn-sm"
                    >
                      Reject
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void onReview(row, "approve")}
                    className="ui-btn ui-btn-primary ui-btn-sm"
                  >
                    {approveLabel}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
