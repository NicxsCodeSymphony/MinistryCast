import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_STAGE_BACKGROUND,
  STAGE_BACKGROUNDS,
  imageBackgroundAssetId,
  imageBackgroundId,
  type StageBackgroundId,
} from "../lib/stageBackgrounds";
import {
  deleteBackgroundImage,
  listBackgroundImages,
  uploadBackgroundImage,
} from "../lib/api";
import type { MediaAsset } from "../lib/types";
import {
  StageBackgroundThumb,
  forgetBackgroundImage,
  primeBackgroundImage,
  stageBackgroundThumbStyle,
} from "./StageBackdrop";
import Icon from "./Icon";
import ConfirmDialog from "./modals/ConfirmDialog";
import { useToast } from "../lib/ToastContext";

type StageBackgroundPickerProps = {
  value: StageBackgroundId;
  onChange: (id: StageBackgroundId) => void;
  compact?: boolean;
  disabled?: boolean;
  /** Show the "Your images" row with upload. Default true. */
  allowImages?: boolean;
};

/* Other pickers (deck, settings, setlist) refresh when images change. */
const listeners = new Set<() => void>();
function announceImagesChanged() {
  for (const listener of listeners) listener();
}

function Tile({
  selected,
  disabled,
  label,
  compact,
  onClick,
  children,
  style,
  id,
}: {
  selected: boolean;
  disabled: boolean;
  label: string;
  compact: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  id?: StageBackgroundId;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex flex-col gap-1.5 text-left focus:outline-none disabled:opacity-40 disabled:pointer-events-none"
      aria-pressed={selected}
      aria-label={label}
      title={label}
    >
      <span
        className={`relative block w-full overflow-hidden rounded-lg border-2 transition-colors ${
          compact ? "aspect-[16/10]" : "aspect-video"
        } ${selected ? "border-primary" : "border-white/10 hover:border-white/30"}`}
        style={style}
      >
        {id ? <StageBackgroundThumb id={id} className="absolute inset-0" /> : null}
        {children}
      </span>
      <span
        className={`truncate text-[10px] leading-tight ${
          selected ? "text-primary font-semibold" : "text-on-surface-variant"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

export default function StageBackgroundPicker({
  value,
  onChange,
  compact = false,
  disabled = false,
  allowImages = true,
}: StageBackgroundPickerProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<MediaAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<MediaAsset | null>(null);

  const refresh = useCallback(() => {
    if (!allowImages) return;
    void listBackgroundImages()
      .then((rows) => {
        for (const row of rows) primeBackgroundImage(row.id, row.url);
        setImages(rows);
      })
      .catch(() => setImages([]));
  }, [allowImages]);

  useEffect(() => {
    refresh();
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, [refresh]);

  const grid = compact ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-6 lg:grid-cols-12";

  const onFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadBackgroundImage(file);
      primeBackgroundImage(asset.id, asset.url);
      announceImagesChanged();
      onChange(imageBackgroundId(asset.id));
      toast.success("Background added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add that image.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className={`grid gap-2 ${grid}`}>
        {STAGE_BACKGROUNDS.map((bg) => (
          <Tile
            key={bg.id}
            selected={value === bg.id}
            disabled={disabled}
            label={bg.label}
            compact={compact}
            onClick={() => onChange(bg.id)}
            style={stageBackgroundThumbStyle(bg.id)}
          >
            {bg.id === "none" ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <Icon name="hide_image" className="text-white/50 text-[18px]" />
              </span>
            ) : null}
            {bg.id === "white" ? (
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-black/70">
                Aa
              </span>
            ) : null}
          </Tile>
        ))}
      </div>

      {allowImages ? (
        <div>
          <p className="text-[11px] font-medium text-on-surface-variant mb-2">Your images</p>
          <div className={`grid gap-2 ${grid}`}>
            {images.map((image) => {
              const id = imageBackgroundId(image.id);
              return (
                <div key={image.id} className="relative group/img">
                  <Tile
                    id={id}
                    selected={value === id}
                    disabled={disabled}
                    label={image.name}
                    compact={compact}
                    onClick={() => onChange(id)}
                  />
                  {!disabled ? (
                    <button
                      type="button"
                      onClick={() => setRemoving(image)}
                      aria-label={`Remove background ${image.name}`}
                      title="Remove image"
                      className="absolute top-1 right-1 w-5 h-5 rounded-md bg-black/60 text-white/80 hover:text-white hidden group-hover/img:flex group-focus-within/img:flex items-center justify-center"
                    >
                      <Icon name="close" className="text-[12px]" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col gap-1.5 text-left disabled:opacity-40"
              aria-label="Upload background image"
              title="Upload an image (JPG, PNG, WebP)"
            >
              <span
                className={`flex w-full items-center justify-center rounded-lg border-2 border-dashed border-white/15 hover:border-primary/60 text-on-surface-variant hover:text-primary transition-colors ${
                  compact ? "aspect-[16/10]" : "aspect-video"
                }`}
              >
                {uploading ? (
                  <span className="skeleton block w-3/4 h-3" />
                ) : (
                  <Icon name="add" className="text-[18px]" />
                )}
              </span>
              <span className="truncate text-[10px] leading-tight text-on-surface-variant">
                {uploading ? "Adding…" : "Upload"}
              </span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="background-upload-input"
            onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove background image?"
        description={`"${removing?.name ?? ""}" will be removed from your church's backgrounds. Slides using it fall back to the default background.`}
        confirmLabel="Remove"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          const id = removing.id;
          await deleteBackgroundImage(id);
          forgetBackgroundImage(id);
          setRemoving(null);
          announceImagesChanged();
          if (imageBackgroundAssetId(value) === id) onChange(DEFAULT_STAGE_BACKGROUND);
          toast.success("Background removed.");
        }}
      />
    </div>
  );
}
