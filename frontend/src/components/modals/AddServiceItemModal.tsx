import { useCallback, useEffect, useId, useRef, useState } from "react";
import Modal from "./Modal";
import MediaSelectPanel from "./MediaSelectPanel";
import RosterFormPanel from "./RosterFormPanel";
import ScriptureSelectPanel from "./ScriptureSelectPanel";
import SermonSelectPanel from "./SermonSelectPanel";
import SongSelectPanel from "./SongSelectPanel";
import type { ServiceItem, ServiceItemKind } from "./serviceItem";

type Step = "picker" | ServiceItemKind;

const OPTIONS: {
  kind: ServiceItemKind;
  title: string;
  description: string;
  icon: string;
  iconClass: string;
}[] = [
  {
    kind: "song",
    title: "Song",
    description: "Add a song from the library.",
    icon: "music_note",
    iconClass: "bg-primary/10 text-primary group-hover:bg-primary/20",
  },
  {
    kind: "sermon",
    title: "Sermon",
    description: "Create or attach a sermon.",
    icon: "record_voice_over",
    iconClass: "bg-tertiary/10 text-tertiary group-hover:bg-tertiary/20",
  },
  {
    kind: "scripture",
    title: "Scripture",
    description: "Add a scripture reading or passage.",
    icon: "auto_stories",
    iconClass: "bg-secondary/10 text-secondary group-hover:bg-secondary/20",
  },
  {
    kind: "media",
    title: "Media",
    description: "Add a video, image, or announcement loop.",
    icon: "movie",
    iconClass: "bg-error/10 text-error group-hover:bg-error/20",
  },
  {
    kind: "roster",
    title: "Assignments",
    description: "Next week’s readers, prayers, and worship leader.",
    icon: "assignment_ind",
    iconClass: "bg-secondary/10 text-secondary group-hover:bg-secondary/20",
  },
];

type AddServiceItemModalProps = {
  open: boolean;
  onClose: () => void;
  setlistName: string;
  serviceAt?: string | null;
  existingSongNumbers?: Record<string, number>;
  onAdd: (item: ServiceItem) => void | Promise<void>;
  onAddSongs?: (items: ServiceItem[]) => void | Promise<void>;
  onRemoveSongs?: (songIds: string[]) => void | Promise<void>;
};

export default function AddServiceItemModal({
  open,
  onClose,
  setlistName,
  serviceAt,
  existingSongNumbers,
  onAdd,
  onAddSongs,
  onRemoveSongs,
}: AddServiceItemModalProps) {
  const titleId = useId();
  const [step, setStep] = useState<Step>("picker");
  const requestCloseRef = useRef(onClose);
  const bindSongClose = useCallback((fn: () => void) => {
    requestCloseRef.current = fn;
  }, []);

  useEffect(() => {
    if (open) setStep("picker");
  }, [open]);

  useEffect(() => {
    if (step !== "song") requestCloseRef.current = onClose;
  }, [onClose, step]);

  const compact = step === "picker" || step === "roster";

  return (
    <Modal
      open={open}
      onClose={() => requestCloseRef.current()}
      labelledBy={step === "picker" ? titleId : undefined}
      bare={!compact}
      panelClassName={
        compact
          ? "w-full max-w-2xl rounded-xl flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          : "w-full max-w-none h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] rounded-2xl flex flex-col bg-surface-container/70 backdrop-blur-2xl border border-white/10"
      }
      backdropClassName={
        compact
          ? "bg-black/60 backdrop-blur-sm"
          : "bg-black/60 backdrop-blur-xl"
      }
    >
      {step === "picker" ? (
        <>
          <div className="flex items-center justify-between p-6 border-b border-white/5">
            <h2
              id={titleId}
              className="text-2xl leading-8 font-semibold text-on-surface"
            >
              Add Service Item
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-on-surface-variant hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-full p-1"
              aria-label="Close"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => setStep(option.kind)}
                  className="service-option-card rounded-lg p-6 text-left flex flex-col items-start gap-4 focus:outline-none focus:ring-2 focus:ring-primary/50 w-full group"
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${option.iconClass}`}
                  >
                    <span className="material-symbols-outlined filled text-[24px]">
                      {option.icon}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-[18px] font-semibold text-on-surface mb-1">
                      {option.title}
                    </h3>
                    <p className="text-sm text-on-surface-variant">
                      {option.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 sm:p-6 pt-0 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="ghost-btn px-6 py-2.5 rounded text-on-surface text-[12px] font-medium tracking-wide focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}

      {step === "song" ? (
        <SongSelectPanel
          setlistName={setlistName}
          onBack={() => setStep("picker")}
          onClose={onClose}
          onAdd={onAdd}
          onAddMany={onAddSongs}
          existingSongNumbers={existingSongNumbers}
          onRemoveSongs={onRemoveSongs}
          registerRequestClose={bindSongClose}
        />
      ) : null}

      {step === "sermon" ? (
        <SermonSelectPanel
          setlistName={setlistName}
          onBack={() => setStep("picker")}
          onClose={onClose}
          onAdd={onAdd}
        />
      ) : null}

      {step === "scripture" ? (
        <ScriptureSelectPanel
          setlistName={setlistName}
          onBack={() => setStep("picker")}
          onClose={onClose}
          onAdd={onAdd}
        />
      ) : null}

      {step === "media" ? (
        <MediaSelectPanel
          setlistName={setlistName}
          onBack={() => setStep("picker")}
          onClose={onClose}
          onAdd={onAdd}
        />
      ) : null}

      {step === "roster" ? (
        <RosterFormPanel
          setlistName={setlistName}
          serviceAt={serviceAt}
          onBack={() => setStep("picker")}
          onClose={onClose}
          onAdd={onAdd}
        />
      ) : null}
    </Modal>
  );
}
