import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  panelClassName?: string;
  backdropClassName?: string;
  rootClassName?: string;
  bare?: boolean;
  captureEscape?: boolean;
};

export default function Modal({
  open,
  onClose,
  children,
  labelledBy,
  describedBy,
  panelClassName = "w-full max-w-lg rounded-2xl",
  backdropClassName = "bg-black/60 backdrop-blur-md",
  rootClassName = "z-[100]",
  bare = false,
  captureEscape = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };

    document.addEventListener("keydown", onKey, captureEscape);
    return () => document.removeEventListener("keydown", onKey, captureEscape);
  }, [captureEscape, open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${rootClassName} flex items-center justify-center p-4 backdrop-in ${backdropClassName}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={`relative overflow-hidden shadow-2xl modal-in ${bare ? "" : "glass-modal"} ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
