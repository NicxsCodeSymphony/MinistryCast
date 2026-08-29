import Modal from "./Modal";

type UnsavedDialogProps = {
  open: boolean;
  busy?: boolean;
  title?: string;
  description?: string;
  showSave?: boolean;
  onStay: () => void;
  onDiscard: () => void;
  onSave?: () => void;
};

export default function UnsavedDialog({
  open,
  busy = false,
  title = "Unsaved draft",
  description = "Your draft is not saved. Save it before you leave, or you’ll lose what you typed.",
  showSave = true,
  onStay,
  onDiscard,
  onSave,
}: UnsavedDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onStay}
      labelledBy="unsaved-dialog-title"
      describedBy="unsaved-dialog-description"
      panelClassName="w-full max-w-md rounded-2xl p-8"
      backdropClassName="bg-black/50 backdrop-blur-[2px]"
      rootClassName="z-[180]"
      captureEscape
    >
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-amber-400/20 rounded-full blur-xl" />
          <div className="relative w-16 h-16 rounded-full bg-amber-400/15 flex items-center justify-center text-amber-300 border border-amber-400/30">
            <span className="material-symbols-outlined text-4xl">edit_note</span>
          </div>
        </div>

        <h2
          id="unsaved-dialog-title"
          className="text-2xl font-semibold text-on-surface mb-2"
        >
          {title}
        </h2>
        <p
          id="unsaved-dialog-description"
          className="text-base leading-relaxed text-on-surface-variant mb-10 px-4"
        >
          {description}
        </p>

        <div className="flex flex-col gap-3 w-full">
          {showSave && onSave ? (
            <button
              type="button"
              disabled={busy}
              onClick={onSave}
              className="w-full px-6 py-3.5 rounded-xl text-xs font-bold bg-gradient-to-r from-primary-container to-secondary-container text-white shadow-lg hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save draft"}
            </button>
          ) : null}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onStay}
              className="flex-1 px-6 py-3.5 rounded-xl text-xs font-medium bg-white/5 text-on-surface hover:bg-white/10 transition-all border border-white/10 active:scale-[0.98] disabled:opacity-60"
            >
              Keep editing
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDiscard}
              className="flex-1 px-6 py-3.5 rounded-xl text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all border border-white/10 active:scale-[0.98] disabled:opacity-60"
            >
              Leave without saving
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
