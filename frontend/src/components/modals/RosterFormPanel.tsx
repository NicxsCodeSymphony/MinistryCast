import { useMemo, useState } from "react";
import { emptyRoster, type RosterPayload } from "../../lib/roster";
import { newServiceItem, type ServiceItem } from "./serviceItem";

type RosterFormPanelProps = {
  setlistName: string;
  serviceAt?: string | null;
  onBack: () => void;
  onClose: () => void;
  onAdd: (item: ServiceItem) => void;
};

export default function RosterFormPanel({
  setlistName,
  serviceAt,
  onBack,
  onClose,
  onAdd,
}: RosterFormPanelProps) {
  const initial = useMemo(() => emptyRoster(serviceAt), [serviceAt]);
  const [draft, setDraft] = useState<RosterPayload>(initial);

  const add = () => {
    const heading = draft.heading.trim() || "Next Week";
    const roles = draft.roles.filter((row) => row.role.trim());
    onAdd(
      newServiceItem({
        itemType: "roster",
        title: heading,
        subtitle: draft.date,
        duration: "",
        label: "Assignments",
        icon: "assignment_ind",
        accent: "secondary",
        payload: {
          heading,
          date: draft.date,
          roles: roles.length ? roles : emptyRoster(serviceAt).roles,
        },
      }),
    );
  };

  const updateRole = (index: number, patch: Partial<{ role: string; name: string }>) => {
    setDraft((prev) => ({
      ...prev,
      roles: prev.roles.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  return (
    <>
      <div className="flex items-center justify-between p-6 border-b border-white/5">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-[12px] text-on-surface-variant hover:text-on-surface"
          >
            {setlistName}
          </button>
          <h2 className="text-2xl leading-8 font-semibold text-on-surface mt-1">
            Assignments
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Names and roles for next week’s service.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-on-surface-variant hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-full p-1"
          aria-label="Close"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="p-6 space-y-5 max-h-[min(70vh,560px)] overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-widest">
              Heading
            </span>
            <input
              value={draft.heading}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, heading: event.target.value }))
              }
              className="w-full bg-surface-container border border-white/10 rounded-lg px-3 py-2.5 text-sm"
              placeholder="Next Week"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-widest">
              Date
            </span>
            <input
              type="date"
              value={draft.date}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, date: event.target.value }))
              }
              className="w-full bg-surface-container border border-white/10 rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-widest">
              Roles
            </span>
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  roles: [...prev.roles, { role: "", name: "" }],
                }))
              }
              className="text-xs font-semibold text-primary hover:underline"
            >
              Add role
            </button>
          </div>
          {draft.roles.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={row.role}
                onChange={(event) => updateRole(index, { role: event.target.value })}
                className="flex-1 bg-surface-container border border-white/10 rounded-lg px-3 py-2 text-sm"
                placeholder="Role"
              />
              <input
                value={row.name}
                onChange={(event) => updateRole(index, { name: event.target.value })}
                className="flex-1 bg-surface-container border border-white/10 rounded-lg px-3 py-2 text-sm"
                placeholder="Name"
              />
              <button
                type="button"
                disabled={draft.roles.length <= 1}
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    roles: prev.roles.filter((_, i) => i !== index),
                  }))
                }
                className="p-2 rounded-lg text-on-surface-variant hover:text-error disabled:opacity-30"
                aria-label="Remove role"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4 sm:p-6 pt-0 flex justify-end gap-3">
        <button
          type="button"
          onClick={onBack}
          className="ghost-btn px-6 py-2.5 rounded text-on-surface text-[12px] font-medium tracking-wide"
        >
          Back
        </button>
        <button
          type="button"
          onClick={add}
          className="px-6 py-2.5 rounded bg-primary text-on-primary text-[12px] font-semibold"
        >
          Add to setlist
        </button>
      </div>
    </>
  );
}
