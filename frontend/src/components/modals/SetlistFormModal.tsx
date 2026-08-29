import { useEffect, useId, useRef, useState } from "react";
import Modal from "./Modal";
import { useUnsavedDraft } from "../../lib/useUnsavedDraft";

export type SetlistFormValues = {
  name: string;
  date: string;
  duration: string;
  serviceType: string;
  churchIds: string[];
};

const SERVICE_TYPES = [
  "Sunday Morning Service",
  "Youth Night",
  "Mid-Week Prayer",
  "Special Event / Concert",
  "Wedding / Funeral",
];

const emptyValues: SetlistFormValues = {
  name: "",
  date: "",
  duration: "",
  serviceType: SERVICE_TYPES[0],
  churchIds: [],
};

type SetlistFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: SetlistFormValues) => void | Promise<void>;
  initialValues?: Partial<SetlistFormValues>;
  mode?: "create" | "edit";
  churches?: { id: string; name: string }[];
};

export default function SetlistFormModal({
  open,
  onClose,
  onSubmit,
  initialValues,
  mode = "create",
  churches,
}: SetlistFormModalProps) {
  const titleId = useId();
  const descId = useId();
  const [values, setValues] = useState<SetlistFormValues>(emptyValues);
  const originKey = useRef("");
  const persistSave = useRef(onSubmit);
  persistSave.current = onSubmit;
  const persistValues = useRef(values);
  persistValues.current = values;

  useEffect(() => {
    if (!open) return;
    const next = { ...emptyValues, ...initialValues };
    setValues(next);
    originKey.current = JSON.stringify(next);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when opened

  const isEdit = mode === "edit";
  const dirty = open && JSON.stringify(values) !== originKey.current;
  const draft = useUnsavedDraft(dirty, {
    enabled: open,
    title: isEdit ? "Unsaved setlist" : "Unsaved setlist draft",
    description:
      "This setlist is not saved. Save it before you leave, or you’ll lose what you typed.",
    onSave: async () => {
      if (!persistValues.current.name.trim()) return false;
      if (churches?.length && persistValues.current.churchIds.length === 0) return false;
      await persistSave.current(persistValues.current);
    },
  });
  const requestClose = () => draft.guard(onClose);

  return (
    <>
    {draft.dialog}
    <Modal
      open={open}
      onClose={requestClose}
      labelledBy={titleId}
      describedBy={descId}
      panelClassName="w-full max-w-lg rounded-2xl"
      backdropClassName="bg-black/60 backdrop-blur-md"
    >
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-secondary/20 blur-[80px] rounded-full pointer-events-none" />

      <div className="relative p-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2
              id={titleId}
              className="text-2xl font-bold tracking-tight text-on-surface"
            >
              {isEdit ? "Edit Setlist" : "New Setlist"}
            </h2>
            <p id={descId} className="text-sm text-on-surface-variant mt-1">
              Configure your production flow for the next service.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="p-2 text-on-surface-variant hover:text-white transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!values.name.trim()) return;
            if (churches?.length && values.churchIds.length === 0) return;
            onSubmit(values);
          }}
        >
          <div className="space-y-2 group">
            <label
              htmlFor="setlist-name"
              className="block text-xs font-medium text-on-surface-variant ml-1 group-focus-within:text-primary transition-colors"
            >
              Setlist Name
            </label>
            <input
              id="setlist-name"
              value={values.name}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, name: event.target.value }))
              }
              className="w-full bg-surface-container border border-white/10 rounded-xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
              placeholder="e.g. Sunday Morning Worship"
              type="text"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 group">
              <label
                htmlFor="setlist-date"
                className="block text-xs font-medium text-on-surface-variant ml-1 group-focus-within:text-primary transition-colors"
              >
                Date
              </label>
              <div className="relative">
                <input
                  id="setlist-date"
                  value={values.date}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, date: event.target.value }))
                  }
                  className="w-full bg-surface-container border border-white/10 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all appearance-none"
                  type="date"
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-sm">
                  calendar_today
                </span>
              </div>
            </div>
            <div className="space-y-2 group">
              <label
                htmlFor="setlist-duration"
                className="block text-xs font-medium text-on-surface-variant ml-1 group-focus-within:text-primary transition-colors"
              >
                Estimated Duration
              </label>
              <div className="relative">
                <input
                  id="setlist-duration"
                  value={values.duration}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      duration: event.target.value,
                    }))
                  }
                  className="w-full bg-surface-container border border-white/10 rounded-xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
                  placeholder="75 min"
                  type="text"
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-sm">
                  timer
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 group">
            <label
              htmlFor="setlist-type"
              className="block text-xs font-medium text-on-surface-variant ml-1 group-focus-within:text-primary transition-colors"
            >
              Service Type
            </label>
            <div className="relative">
              <select
                id="setlist-type"
                value={values.serviceType}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    serviceType: event.target.value,
                  }))
                }
                className="w-full bg-surface-container border border-white/10 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all appearance-none cursor-pointer"
              >
                {SERVICE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none group-hover:text-primary transition-colors">
                expand_more
              </span>
            </div>
          </div>

          {churches?.length ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-on-surface-variant ml-1">
                Churches that can view and run this setlist
              </p>
              <p className="text-[11px] text-on-surface-variant ml-1">
                Select one or more. Those churches can keep editing this setlist after you save it.
              </p>
              <div className="max-h-44 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-surface-container divide-y divide-white/5">
                {churches.map((church) => {
                  const checked = values.churchIds.includes(church.id);
                  return (
                    <label
                      key={church.id}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setValues((prev) => ({
                            ...prev,
                            churchIds: checked
                              ? prev.churchIds.filter((id) => id !== church.id)
                              : [...prev.churchIds, church.id],
                          }))
                        }
                        className="accent-primary"
                      />
                      <span className="truncate">{church.name}</span>
                    </label>
                  );
                })}
              </div>
              {values.churchIds.length === 0 ? (
                <p className="text-[11px] text-[#ffb4ab] ml-1">
                  Choose at least one church.
                </p>
              ) : (
                <p className="text-[11px] text-on-surface-variant ml-1">
                  {values.churchIds.length} selected
                </p>
              )}
            </div>
          ) : null}

          <div className="pt-6 flex items-center gap-4">
            <button
              className="flex-1 py-3 px-6 rounded-xl border border-white/10 text-on-surface-variant text-xs font-medium hover:bg-white/5 hover:text-on-surface transition-all"
              onClick={requestClose}
              type="button"
            >
              Cancel
            </button>
            <button
              disabled={
                !values.name.trim() || Boolean(churches?.length && values.churchIds.length === 0)
              }
              className="flex-[1.5] py-3 px-6 rounded-xl glow-button text-white text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
              type="submit"
            >
              {isEdit ? "Save Setlist" : "Create Setlist"}
              <span className="material-symbols-outlined text-sm">
                arrow_forward
              </span>
            </button>
          </div>
        </form>
      </div>
    </Modal>
    </>
  );
}
