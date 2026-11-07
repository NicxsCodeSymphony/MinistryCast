import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import Sheet from "../../components/modals/Sheet";
import { Skeleton, TableSkeleton } from "../../components/Skeleton";
import {
  listApprovalRequests,
  listChurchTeamAccounts,
  reviewMemberJoin,
  updateChurchTeamAccount,
  type ApprovalRequest,
  type ChurchTeamAccount,
} from "../../lib/auth";
import { peekQuery } from "../../lib/offline/queryCache";
import { usePrefs } from "../../lib/PrefsContext";
import { useToast } from "../../lib/ToastContext";
import Icon from "../../components/Icon";
import LibraryTable from "../../components/LibraryTable";
import { BentoCard, BentoGrid, Stat } from "../../components/bento";
import { Badge, EmptyState, SearchField } from "../../components/ui";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function roleLabel(role: string, t: (key: string) => string) {
  if (role === "admin") return t("settings.teamRoleAdmin");
  if (role === "producer") return t("settings.teamRoleProducer");
  if (role === "operator") return t("settings.teamRoleMember");
  if (role === "superadmin") return t("brand.superadmin");
  return role;
}

function statusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  return "neutral";
}

function statusLabel(status: string, t: (key: string) => string) {
  if (status === "active") return t("settings.teamStatusActive");
  if (status === "pending") return t("settings.teamStatusPending");
  if (status === "disabled") return t("settings.teamStatusDisabled");
  return status;
}

type TeamAccountsPanelProps = {
  myUserId: string;
};

export default function TeamAccountsPanel({ myUserId }: TeamAccountsPanelProps) {
  const toast = useToast();
  const { t } = usePrefs();
  const [team, setTeam] = useState<ChurchTeamAccount[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ChurchTeamAccount | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("operator");
  const [status, setStatus] = useState("active");
  const [saving, setSaving] = useState(false);
  const [busyApproval, setBusyApproval] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = async (fresh = false) => {
    setError("");
    if (fresh) setRefreshing(true);
    else if (!team.length) setLoading(true);
    try {
      const [rows, requests] = await Promise.all([
        listChurchTeamAccounts({ fresh }),
        listApprovalRequests({ fresh }),
      ]);
      setTeam(rows);
      setApprovals(
        requests.filter(
          (row) => row.kind === "member" && row.phase === "church",
        ),
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("settings.teamLoadError");
      setError(msg);
      if (!team.length) toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const cachedTeam = peekQuery<ChurchTeamAccount[]>("church-team-accounts");
    const cachedApprovals = peekQuery<ApprovalRequest[]>("approval-requests");
    if (cachedTeam) {
      setTeam(cachedTeam);
      setLoading(false);
    }
    if (cachedApprovals) {
      setApprovals(
        cachedApprovals.filter(
          (row) => row.kind === "member" && row.phase === "church",
        ),
      );
    }
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only hydrate
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return team;
    return team.filter((row) =>
      [row.name, row.email, row.phone ?? "", row.role, row.status].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [team, query]);

  const activeCount = team.filter((row) => row.status === "active").length;
  const adminCount = team.filter((row) => row.role === "admin" || row.role === "superadmin").length;

  const openMember = (row: ChurchTeamAccount) => {
    setSelected(row);
    setName(row.name);
    setPhone(row.phone ?? "");
    setRole(row.role === "superadmin" ? "admin" : row.role);
    setStatus(row.status);
    setSavedFlash(false);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    if (saving) return;
    setSheetOpen(false);
    setSelected(null);
    setConfirmBlock(false);
  };

  const save = async (nextStatus?: string) => {
    if (!selected) return;
    setSaving(true);
    setError("");
    setSavedFlash(false);
    try {
      const rows = await updateChurchTeamAccount(selected.id, {
        name,
        phone,
        role,
        status: nextStatus ?? status,
      });
      setTeam(rows);
      const fresh = rows.find((row) => row.id === selected.id) ?? null;
      setSelected(fresh);
      if (fresh) {
        setName(fresh.name);
        setPhone(fresh.phone ?? "");
        setRole(fresh.role === "superadmin" ? "admin" : fresh.role);
        setStatus(fresh.status);
      }
      if (nextStatus) setStatus(nextStatus);
      setSavedFlash(true);
      toast.success(t("settings.teamSaved"));
      setConfirmBlock(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("settings.teamSaveError");
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const onApproval = async (
    row: ApprovalRequest,
    action: "approve" | "reject",
  ) => {
    setBusyApproval(row.applicant_id);
    try {
      const next = await reviewMemberJoin(row.applicant_id, action);
      setApprovals(
        next.filter((item) => item.kind === "member" && item.phase === "church"),
      );
      await load(true);
      toast.success(
        action === "approve"
          ? t("settings.teamApproved")
          : t("settings.teamRejected"),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("settings.teamApprovalError"),
      );
    } finally {
      setBusyApproval(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-full rounded-lg" />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  const label = "block text-[12px] text-on-surface-variant mb-1.5";

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-semibold tracking-tight text-on-surface">
            {t("settings.team")}
          </h2>
          <p className="mt-1 text-[13px] text-on-surface-variant">
            {t("settings.teamPanelHint")}
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void load(true)}
          className="ui-btn ui-btn-ghost shrink-0"
        >
          <Icon name="refresh" className={`text-[15px] ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? t("settings.teamRefreshing") : t("settings.teamRefresh")}
        </button>
      </div>

      {error ? (
        <div className="rounded-[10px] border border-error/30 px-4 py-3 text-[13px] text-error flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => void load(true)}>
            {t("settings.teamRetry")}
          </button>
        </div>
      ) : null}

      <BentoGrid className="auto-rows-auto">
        <BentoCard span={4} aria-label={t("settings.teamMember")}>
          <Stat
            label="Members"
            value={team.length}
            hint={`${adminCount} ${adminCount === 1 ? "admin" : "admins"}`}
          />
        </BentoCard>
        <BentoCard span={4} aria-label={t("settings.teamStatusActive")}>
          <Stat
            label={t("settings.teamStatusActive")}
            value={activeCount}
            hint={team.length ? `${Math.round((activeCount / team.length) * 100)}% of team` : undefined}
          />
        </BentoCard>
        <BentoCard span={4} aria-label={t("settings.teamStatusPending")}>
          <Stat
            label={t("settings.teamStatusPending")}
            value={approvals.length}
            hint={approvals.length ? "Waiting for you" : "All caught up"}
          />
        </BentoCard>
      </BentoGrid>

      {approvals.length ? (
        <section className="rounded-[14px] border border-primary/30 bg-primary/5">
          <div className="px-5 pt-4 pb-3 flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-on-surface">
              {t("settings.teamPendingApprovals", { n: approvals.length })}
            </h3>
            <Badge tone="warning">{t("settings.teamStatusPending")}</Badge>
          </div>
          <ul className="border-t border-white/5">
            {approvals.map((row) => (
              <li
                key={row.applicant_id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 border-t border-white/5 first:border-t-0"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-8 h-8 rounded-full bg-surface-container-highest shrink-0 flex items-center justify-center text-[11px] font-semibold text-on-surface-variant">
                    {initials(row.applicant_name || "?")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-on-surface truncate">
                      {row.applicant_name}
                    </p>
                    <p className="text-[12px] text-on-surface-variant truncate">
                      {row.applicant_email}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyApproval === row.applicant_id}
                    onClick={() => void onApproval(row, "reject")}
                    className="ui-btn ui-btn-ghost ui-btn-sm"
                  >
                    {t("settings.teamReject")}
                  </button>
                  <button
                    type="button"
                    disabled={busyApproval === row.applicant_id}
                    onClick={() => void onApproval(row, "approve")}
                    className="ui-btn ui-btn-primary ui-btn-sm"
                  >
                    {t("settings.teamApprove")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h3 className="text-[13px] font-semibold text-on-surface flex-1">
            {t("settings.teamMember")}
            <span className="ml-2 font-normal text-on-surface-variant tabular-nums">
              {visible.length}
            </span>
          </h3>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={t("settings.teamSearch")}
            className="w-full max-w-[280px]"
          />
        </div>

        {!visible.length ? (
          <div className="card-surface rounded-xl border border-white/5">
            <EmptyState
              icon="group"
              title={query ? t("settings.teamEmptySearch") : t("settings.teamEmpty")}
            />
          </div>
        ) : (
          <LibraryTable
            ariaLabel={t("settings.team")}
            className="max-h-[560px]"
            columns={[
              { key: "member", header: t("settings.teamMember") },
              { key: "contact", header: t("settings.teamContact"), hideBelow: "md" },
              { key: "role", header: t("settings.teamRole") },
              { key: "status", header: t("settings.teamStatus") },
            ]}
            groups={[
              {
                id: "team",
                rows: visible.map((row) => ({
                  id: row.id,
                  label: row.name || row.email,
                  onOpen: () => openMember(row),
                  selected: sheetOpen && selected?.id === row.id,
                  leading: (
                    <span className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest border border-white/10 flex items-center justify-center text-[11px] font-semibold text-on-surface-variant">
                      {row.avatar_url ? (
                        <img src={row.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        initials(row.name || "?")
                      )}
                    </span>
                  ),
                  cells: {
                    member: (
                      <span className="block min-w-0">
                        <span className="block truncate">
                          {row.name}
                          {row.id === myUserId ? (
                            <span className="ml-1.5 text-[11px] font-normal text-primary">
                              {t("settings.teamYou")}
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-[12px] font-normal text-on-surface-variant truncate">
                          {row.email}
                        </span>
                      </span>
                    ),
                    contact: <span className="tabular-nums">{row.phone?.trim() || "—"}</span>,
                    role: <span className="text-on-surface">{roleLabel(row.role, t)}</span>,
                    status: (
                      <Badge tone={statusTone(row.status)}>
                        {statusLabel(row.status, t)}
                        {row.approval_phase ? ` · ${row.approval_phase}` : ""}
                      </Badge>
                    ),
                  },
                })),
              },
            ]}
          />
        )}
      </div>

      <Sheet open={sheetOpen} onClose={closeSheet} labelledBy="team-sheet-title">
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest shrink-0 flex items-center justify-center text-[13px] font-semibold text-on-surface-variant">
                  {selected.avatar_url ? (
                    <img src={selected.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initials(selected.name || "?")
                  )}
                </div>
                <div className="min-w-0">
                  <h2 id="team-sheet-title" className="text-[15px] font-semibold text-on-surface truncate">
                    {selected.name}
                  </h2>
                  <p className="text-[12px] text-on-surface-variant truncate">{selected.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="ui-icon-btn"
                aria-label={t("settings.teamClose")}
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
              {savedFlash ? (
                <p className="text-[13px] text-primary">{t("settings.teamSavedFlash")}</p>
              ) : null}

              <div>
                <label className={label}>{t("settings.displayName")}</label>
                <input value={name} onChange={(event) => setName(event.target.value)} className="ui-input" />
              </div>

              <div>
                <label className={label}>{t("settings.teamPhone")}</label>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={t("settings.teamPhoneHint")}
                  className="ui-input"
                />
              </div>

              <div>
                <label className={label}>{t("settings.teamEmail")}</label>
                <input
                  value={selected.email}
                  disabled
                  className="ui-input opacity-60 cursor-not-allowed"
                />
                <p className="text-[12px] text-on-surface-variant mt-1.5">
                  {t("settings.teamEmailHint")}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={label}>{t("settings.teamRole")}</label>
                  <select value={role} onChange={(event) => setRole(event.target.value)} className="ui-input">
                    <option value="admin">{t("settings.teamRoleAdmin")}</option>
                    <option value="producer">{t("settings.teamRoleProducer")}</option>
                    <option value="operator">{t("settings.teamRoleMember")}</option>
                  </select>
                </div>
                <div>
                  <label className={label}>{t("settings.teamStatus")}</label>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    disabled={selected.id === myUserId}
                    className="ui-input disabled:opacity-60"
                  >
                    <option value="active">{t("settings.teamStatusActive")}</option>
                    <option value="pending">{t("settings.teamStatusPending")}</option>
                    <option value="disabled">{t("settings.teamStatusDisabled")}</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/5 flex items-center gap-2">
              {selected.id !== myUserId ? (
                <button
                  type="button"
                  disabled={saving || selected.status === "disabled"}
                  onClick={() => setConfirmBlock(true)}
                  className="ui-btn ui-btn-danger"
                >
                  {t("settings.teamBlock")}
                </button>
              ) : null}
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="ui-btn ui-btn-primary ml-auto"
              >
                {saving ? t("common.saving") : t("settings.teamSaveChanges")}
              </button>
            </div>
          </>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={() => save("disabled")}
        title={t("settings.teamBlockTitle")}
        description={t("settings.teamBlockDesc", {
          name: selected?.name || t("settings.teamThisPerson"),
        })}
        confirmLabel={t("settings.teamBlock")}
      />
    </div>
  );
}
