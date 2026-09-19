import { useEffect, useState } from "react";
import Modal from "./Modal";

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  highlight?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

function progressiveLabel(label: string) {
  const words = label.trim().split(/\s+/);
  if (!words[0]) return label;
  const verb = words[0];
  if (/ing$/i.test(verb)) return label;
  const stem = /e$/i.test(verb) && !/ee$/i.test(verb) ? verb.slice(0, -1) : verb;
  words[0] = `${stem}ing`;
  return words.join(" ");
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  highlight,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const close = () => {
    if (busy) return;
    onClose();
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      labelledBy="confirm-dialog-title"
      describedBy="confirm-dialog-description"
      panelClassName="w-full max-w-md rounded-2xl p-8"
      backdropClassName="bg-black/40 backdrop-blur-[2px]"
    >
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-error/20 rounded-full blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-full bg-error-container flex items-center justify-center text-error border border-error/30">
            <span className="material-symbols-outlined text-4xl">warning</span>
          </div>
        </div>

        <h2
          id="confirm-dialog-title"
          className="text-2xl font-semibold text-on-surface mb-2"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-description"
          className="text-base leading-relaxed text-on-surface-variant mb-10 px-4"
        >
          {highlight && description.includes(highlight) ? (
            <>
              {description.slice(0, description.indexOf(highlight))}
              <span className="text-on-surface font-semibold">{highlight}</span>
              {description.slice(
                description.indexOf(highlight) + highlight.length,
              )}
            </>
          ) : (
            description
          )}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            type="button"
            disabled={busy}
            onClick={close}
            className="flex-1 px-6 py-3.5 rounded-xl text-xs font-medium bg-white/5 text-on-surface hover:bg-white/10 transition-all border border-white/10 order-2 sm:order-1 active:scale-[0.98] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="flex-1 px-6 py-3.5 rounded-xl text-xs font-bold bg-error text-on-error shadow-lg shadow-error/20 hover:opacity-90 transition-all destructive-glow order-1 sm:order-2 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
          >
            {busy ? (
              <span className="w-4 h-4 rounded-full border-2 border-on-error/30 border-t-on-error animate-spin" />
            ) : null}
            {busy ? progressiveLabel(confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
