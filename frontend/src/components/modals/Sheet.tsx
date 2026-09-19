import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  side?: "right" | "left";
  widthClassName?: string;
};

/** Side sheet for detail/edit flows (team member, etc.). */
export default function Sheet({
  open,
  onClose,
  children,
  labelledBy,
  side = "right",
  widthClassName = "w-full max-w-md",
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex" role="presentation">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm backdrop-in"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative ml-auto h-full ${widthClassName} bg-surface-container-low border-l border-white/10 shadow-2xl flex flex-col modal-in ${
          side === "left" ? "mr-auto ml-0 border-l-0 border-r" : ""
        }`}
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
}
