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

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-500/15 text-emerald-300";
  if (status === "pending") return "bg-amber-500/15 text-amber-200";
  return "bg-white/10 text-on-surface-variant";
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
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-on-surface">
            {t("settings.team")}
          </h2>
          <p className="text-sm text-on-surface-variant mt-2">
            {t("settings.teamPanelHint")}
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void load(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-white/5 disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          {refreshing ? t("settings.teamRefreshing") : t("settings.teamRefresh")}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-[#ffb4ab]/30 bg-[#ffb4ab]/10 px-4 py-3 text-sm text-[#ffb4ab] flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            className="underline shrink-0"
            onClick={() => void load(true)}
          >
            {t("settings.teamRetry")}
          </button>
        </div>
      ) : null}

      {approvals.length ? (
        <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-200 text-[20px]">
              verified_user
            </span>
            <h3 className="text-sm font-semibold text-on-surface">
              {t("settings.teamPendingApprovals", { n: approvals.length })}
            </h3>
          </div>
          <ul className="space-y-2">
            {approvals.map((row) => (
              <li
                key={row.applicant_id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg bg-surface-container/60 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-on-surface truncate">
                    {row.applicant_name}
                  </p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {row.applicant_email}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyApproval === row.applicant_id}
                    onClick={() => void onApproval(row, "reject")}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 hover:bg-white/5 disabled:opacity-50"
                  >
                    {t("settings.teamReject")}
                  </button>
                  <button
                    type="button"
                    disabled={busyApproval === row.applicant_id}
                    onClick={() => void onApproval(row, "approve")}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-on-primary disabled:opacity-50"
                  >
                    {t("settings.teamApprove")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
          search
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settings.teamSearch")}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface border border-outline-variant text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {!visible.length ? (
        <p className="text-sm text-on-surface-variant py-8 text-center">
          {query ? t("settings.teamEmptySearch") : t("settings.teamEmpty")}
        </p>
      ) : (
        <div className="rounded-xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm min-w-[640px]">
              <thead className="bg-surface-container-lowest/80 text-[11px] uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    {t("settings.teamMember")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("settings.teamContact")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("settings.teamRole")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("settings.teamStatus")}
                  </th>
                  <th className="px-4 py-3 font-medium w-12" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-white/5 hover:bg-white/[0.03] cursor-pointer"
                    onClick={() => openMember(row)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest shrink-0 flex items-center justify-center text-xs font-semibold">
                          {row.avatar_url ? (
                            <img
                              src={row.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            initials(row.name || "?")
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-on-surface truncate">
                            {row.name}
                            {row.id === myUserId ? (
                              <span className="ml-1.5 text-[10px] font-medium text-primary">
                                {t("settings.teamYou")}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-on-surface-variant truncate">
                            {row.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {row.phone?.trim() || "—"}
                    </td>
                    <td className="px-4 py-3">{roleLabel(row.role, t)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${statusTone(
                          row.status,
                        )}`}
                      >
                        {statusLabel(row.status, t)}
                        {row.approval_phase ? ` · ${row.approval_phase}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                        chevron_right
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Sheet open={sheetOpen} onClose={closeSheet} labelledBy="team-sheet-title">
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-3 p-5 border-b border-white/5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-surface-container-highest shrink-0 flex items-center justify-center text-lg font-semibold">
                  {selected.avatar_url ? (
                    <img
                      src={selected.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    initials(selected.name || "?")
                  )}
                </div>
                <div className="min-w-0">
                  <h2
                    id="team-sheet-title"
                    className="text-lg font-semibold text-on-surface truncate"
                  >
                    {selected.name}
                  </h2>
                  <p className="text-xs text-on-surface-variant truncate">
                    {selected.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-white/5"
                aria-label={t("settings.teamClose")}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              {savedFlash ? (
                <p className="text-sm text-primary">{t("settings.teamSavedFlash")}</p>
              ) : null}

              <div>
                <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                  {t("settings.displayName")}
                </label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                  {t("settings.teamPhone")}
                </label>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={t("settings.teamPhoneHint")}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                  {t("settings.teamEmail")}
                </label>
                <input
                  value={selected.email}
                  disabled
                  className="w-full bg-surface/50 border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface-variant opacity-80 cursor-not-allowed"
                />
                <p className="text-[11px] text-on-surface-variant mt-1.5">
                  {t("settings.teamEmailHint")}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                    {t("settings.teamRole")}
                  </label>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="admin">{t("settings.teamRoleAdmin")}</option>
                    <option value="producer">
                      {t("settings.teamRoleProducer")}
                    </option>
                    <option value="operator">
                      {t("settings.teamRoleMember")}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-on-surface-variant block mb-2 uppercase tracking-widest">
                    {t("settings.teamStatus")}
                  </label>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    disabled={selected.id === myUserId}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none disabled:opacity-60"
                  >
                    <option value="active">
                      {t("settings.teamStatusActive")}
                    </option>
                    <option value="pending">
                      {t("settings.teamStatusPending")}
                    </option>
                    <option value="disabled">
                      {t("settings.teamStatusDisabled")}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-white/5 space-y-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="w-full px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-60"
              >
                {saving ? t("common.saving") : t("settings.teamSaveChanges")}
              </button>
              {selected.id !== myUserId ? (
                <button
                  type="button"
                  disabled={saving || selected.status === "disabled"}
                  onClick={() => setConfirmBlock(true)}
                  className="w-full px-4 py-2.5 rounded-lg border border-[#ffb4ab]/30 text-[#ffb4ab] text-sm font-semibold hover:bg-[#ffb4ab]/10 disabled:opacity-50"
                >
                  {t("settings.teamBlock")}
                </button>
              ) : null}
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
