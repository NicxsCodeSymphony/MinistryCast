import { useEffect, useId, useState } from "react";
import Modal from "./Modal";

export type CategoryFormValues = {
  name: string;
  description: string;
  icon: string;
  color: CategoryColor;
};

export type CategoryColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "error"
  | "accent";

const ICONS = [
  "auto_awesome",
  "music_note",
  "groups",
  "favorite",
  "notifications_active",
  "queue_music",
  "bolt",
  "brightness_high",
] as const;

const COLORS: { id: CategoryColor; className: string }[] = [
  { id: "primary", className: "bg-primary" },
  { id: "secondary", className: "bg-secondary" },
  { id: "tertiary", className: "bg-tertiary" },
  { id: "error", className: "bg-error" },
  { id: "accent", className: "bg-primary-container" },
];

const colorPreview: Record<CategoryColor, string> = {
  primary: "bg-primary text-on-primary",
  secondary: "bg-secondary text-on-secondary",
  tertiary: "bg-tertiary text-on-tertiary",
  error: "bg-error text-on-error",
  accent: "bg-primary-container text-on-primary-container",
};

const emptyValues: CategoryFormValues = {
  name: "",
  description: "",
  icon: "auto_awesome",
  color: "primary",
};

type CategoryFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: CategoryFormValues) => void;
  initialValues?: Partial<CategoryFormValues>;
  mode?: "create" | "edit";
};

export default function CategoryFormModal({
  open,
  onClose,
  onSubmit,
  initialValues,
  mode = "create",
}: CategoryFormModalProps) {
  const titleId = useId();
  const descId = useId();
  const [values, setValues] = useState<CategoryFormValues>(emptyValues);

  useEffect(() => {
    if (!open) return;
    setValues({ ...emptyValues, ...initialValues });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when opened

  const isEdit = mode === "edit";

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descId}
      panelClassName="w-full max-w-lg rounded-3xl"
      backdropClassName="bg-black/40 backdrop-blur-sm"
    >
      <div className="px-8 pt-8 pb-4 flex justify-between items-start">
        <div>
          <h2 id={titleId} className="text-2xl font-extrabold text-on-surface">
            {isEdit ? "Edit Category" : "New Category"}
          </h2>
          <p id={descId} className="text-sm text-on-surface-variant mt-1">
            {isEdit
              ? "Update the visual identity and details of this category."
              : "Define the visual identity and details of this category."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-on-surface-variant"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <form
        className="px-8 py-4 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!values.name.trim()) return;
          onSubmit(values);
        }}
      >
        <div className="space-y-2">
          <label
            htmlFor="category-name"
            className="block text-xs font-medium text-primary tracking-wide"
          >
            Category Name
          </label>
          <input
            id="category-name"
            value={values.name}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, name: event.target.value }))
            }
            className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-base font-medium text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all"
            type="text"
            placeholder="e.g. Worship"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="category-description"
            className="block text-xs font-medium text-primary tracking-wide"
          >
            Description
          </label>
          <textarea
            id="category-description"
            value={values.description}
            onChange={(event) =>
              setValues((prev) => ({
                ...prev,
                description: event.target.value,
              }))
            }
            className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-base text-on-surface-variant focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all resize-none"
            rows={3}
            placeholder="How this category is used in a service."
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs font-medium text-primary tracking-wide">
              Representative Icon
            </p>
            <div className="grid grid-cols-4 gap-2">
              {ICONS.map((icon) => {
                const selected = values.icon === icon;
                return (
                  <button
                    key={icon}
                    type="button"
                    onClick={() =>
                      setValues((prev) => ({ ...prev, icon }))
                    }
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                      selected
                        ? "bg-primary/20 text-primary border-2 border-primary"
                        : "bg-surface-container-high text-on-surface-variant hover:bg-white/5"
                    }`}
                    aria-label={icon.replace(/_/g, " ")}
                    aria-pressed={selected}
                  >
                    <span
                      className={`material-symbols-outlined text-[20px] ${
                        selected ? "filled" : ""
                      }`}
                    >
                      {icon}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-primary tracking-wide">
              Brand Color
            </p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => {
                const selected = values.color === color.id;
                return (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() =>
                      setValues((prev) => ({ ...prev, color: color.id }))
                    }
                    className={`w-6 h-6 rounded-full ${color.className} ${
                      selected
                        ? "border-2 border-white ring-2 ring-primary/20"
                        : "hover:scale-110 transition-transform"
                    }`}
                    aria-label={color.id}
                    aria-pressed={selected}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorPreview[values.color]}`}
          >
            <span className="material-symbols-outlined text-[20px] filled">
              {values.icon}
            </span>
          </div>
          <div>
            <p className="text-[12px] font-semibold tracking-[0.05em] text-primary uppercase opacity-60">
              Preview
            </p>
            <h4 className="text-lg font-bold text-on-surface">
              {values.name.trim() || "Untitled"}
            </h4>
          </div>
        </div>
      </form>

      <div className="px-8 pb-8 pt-4 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 bg-surface-container-highest text-on-surface text-xs font-bold py-3 rounded-xl hover:bg-white/10 transition-all"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (!values.name.trim()) return;
            onSubmit(values);
          }}
          className="flex-[2] bg-gradient-to-b from-primary-container to-on-primary-fixed-variant text-on-primary text-xs font-bold py-3 rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all"
        >
          {isEdit ? "Save Changes" : "Create Category"}
        </button>
      </div>
    </Modal>
  );
}
