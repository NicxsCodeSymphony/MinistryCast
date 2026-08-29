import { useEffect, useId, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { useUnsavedDraft } from "../../lib/useUnsavedDraft";
import {
  CATEGORY_COLOR_IDS,
  CATEGORY_ICONS,
  categoryTone,
  categoryVisual,
  presetForCategoryName,
  presetForIcon,
  type PickerCategoryColor,
} from "../../lib/categoryColor";
import type { CategoryColor } from "../../lib/types";

export type CategoryFormValues = {
  name: string;
  description: string;
  icon: string;
  color: CategoryColor;
};

export type { CategoryColor };

const emptyValues: CategoryFormValues = {
  name: "",
  description: "",
  icon: "campaign",
  color: "sky",
};

type CategoryFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: CategoryFormValues) => void | Promise<void>;
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
    title: isEdit ? "Unsaved category" : "Unsaved category draft",
    description:
      "This category is not saved. Save it before you leave, or you’ll lose what you typed.",
    onSave: async () => {
      if (!persistValues.current.name.trim()) return false;
      await persistSave.current(persistValues.current);
    },
  });
  const requestClose = () => draft.guard(onClose);
  const icons = useMemo(() => {
    if (CATEGORY_ICONS.some((icon) => icon.id === values.icon)) return CATEGORY_ICONS;
    return [...CATEGORY_ICONS, { id: values.icon, label: "Custom" }];
  }, [values.icon]);
  const preview = categoryVisual[categoryTone(values.color)];

  return (
    <>
    {draft.dialog}
    <Modal
      open={open}
      onClose={requestClose}
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
          onClick={requestClose}
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
            onChange={(event) => {
              const name = event.target.value;
              const preset = !isEdit ? presetForCategoryName(name) : null;
              setValues((prev) => ({
                ...prev,
                name,
                ...(preset
                  ? { icon: preset.icon, color: preset.color }
                  : {}),
              }));
            }}
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

        <div className="space-y-3">
          <p className="text-xs font-medium text-primary tracking-wide">
            Representative Icon
          </p>
          <div className="grid grid-cols-5 gap-2">
            {icons.map((icon) => {
              const selected = values.icon === icon.id;
              return (
                <button
                  key={icon.id}
                  type="button"
                  onClick={() => {
                    const preset = !isEdit ? presetForIcon(icon.id) : null;
                    setValues((prev) => ({
                      ...prev,
                      icon: icon.id,
                      ...(preset ? { color: preset.color } : {}),
                    }));
                  }}
                  className={`flex flex-col items-center justify-center gap-1 min-h-[4.5rem] px-1 py-2 rounded-xl transition-colors ${
                    selected
                      ? "bg-primary/20 text-primary border-2 border-primary"
                      : "bg-surface-container-high text-on-surface-variant hover:bg-white/5 border-2 border-transparent"
                  }`}
                  aria-label={icon.label}
                  aria-pressed={selected}
                >
                  <span
                    className={`material-symbols-outlined text-[22px] ${
                      selected ? "filled" : ""
                    }`}
                  >
                    {icon.id}
                  </span>
                  <span className="text-[9px] leading-tight text-center font-medium">
                    {icon.label}
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
          <div className="flex flex-wrap gap-2.5">
            {CATEGORY_COLOR_IDS.map((id) => {
              const selected = categoryTone(values.color) === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setValues((prev) => ({
                      ...prev,
                      color: id as PickerCategoryColor,
                    }))
                  }
                  className={`w-7 h-7 rounded-full ${
                    selected
                      ? "ring-2 ring-white ring-offset-2 ring-offset-surface scale-110"
                      : "hover:scale-110 transition-transform"
                  }`}
                  style={{ backgroundColor: categoryVisual[id].hex }}
                  aria-label={id}
                  aria-pressed={selected}
                />
              );
            })}
          </div>
        </div>

        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${preview.icon}`}
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
          onClick={requestClose}
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
    </>
  );
}
