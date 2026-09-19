import { useEffect, useMemo, useState } from "react";
import { createMediaAsset, listMedia } from "../../lib/api";
import { formatDuration } from "../../lib/helpers";
import type { MediaAsset } from "../../lib/types";
import { CardGridSkeleton } from "../Skeleton";
import { newServiceItem, type ServiceItem } from "./serviceItem";

type MediaSelectPanelProps = {
  setlistName: string;
  onBack: () => void;
  onClose: () => void;
  onAdd: (item: ServiceItem) => void;
};

export default function MediaSelectPanel({
  setlistName,
  onBack,
  onClose,
  onAdd,
}: MediaSelectPanelProps) {
  const [tab, setTab] = useState<"all" | "video" | "image">("all");
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const page = await listMedia({
          kind: tab === "all" ? null : tab,
          limit: 40,
        });
        setItems(page.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load media.");
      } finally {
        setLoading(false);
      }
    })();
  }, [tab]);

  const selected = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  );

  const addSelected = () => {
    selected.forEach((item) => {
      onAdd(
        newServiceItem({
          itemType: "media",
          mediaAssetId: item.id,
          title: item.name,
          subtitle: item.kind,
          duration: formatDuration(item.duration_seconds),
          label: item.kind === "video" ? "Media" : "Announcement",
          icon: item.kind === "video" ? "movie" : "image",
          accent: "tertiary",
        }),
      );
    });
  };

  const uploadUrl = async () => {
    if (!url.trim() || !name.trim()) return;
    setError("");
    try {
      const asset = await createMediaAsset({
        name: name.trim(),
        url: url.trim(),
        kind: url.match(/\.(mp4|mov|webm)$/i) ? "video" : "image",
      });
      setItems((prev) => [asset, ...prev]);
      setSelectedIds((prev) => [...prev, asset.id]);
      setUrl("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add media.");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 z-10"
        aria-label="Close"
      >
        <span className="material-symbols-outlined">close</span>
      </button>
      <div className="p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar pb-28">
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] text-on-surface-variant"
        >
          {setlistName}
        </button>
        <h2 className="text-[32px] font-bold text-on-surface mt-2">Media Library</h2>
        {error ? <p className="mt-3 text-sm text-[#ffb4ab]">{error}</p> : null}

        <div className="mt-6 flex gap-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="flex-1 bg-surface-container border border-white/10 rounded-lg px-3 py-2 text-sm"
            placeholder="Asset name"
          />
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="flex-[2] bg-surface-container border border-white/10 rounded-lg px-3 py-2 text-sm"
            placeholder="https://… image or video URL"
          />
          <button
            type="button"
            onClick={() => void uploadUrl()}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold"
          >
            Add URL
          </button>
        </div>

        <div className="flex border-b border-white/10 my-6">
          {(["all", "image", "video"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-6 py-3 text-sm capitalize ${
                tab === id ? "text-primary border-b-2 border-primary" : "text-on-surface-variant"
              }`}
            >
              {id}
            </button>
          ))}
        </div>

        {loading ? <CardGridSkeleton cards={4} /> : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setSelectedIds((prev) =>
                      prev.includes(item.id)
                        ? prev.filter((id) => id !== item.id)
                        : [...prev, item.id],
                    )
                  }
                  className={`rounded-xl overflow-hidden text-left border ${
                    isSelected ? "ring-2 ring-primary border-primary/40" : "border-white/10"
                  }`}
                >
                  <div className="aspect-video bg-gradient-to-br from-slate-800 to-black" />
                  <div className="p-3">
                    <h3 className="text-sm font-medium truncate">{item.name}</h3>
                    <p className="text-[12px] text-on-surface-variant">{item.kind}</p>
                  </div>
                </button>
              );
            })}
            {items.length === 0 ? (
              <p className="col-span-4 text-sm text-on-surface-variant">
                No media yet. Add a public image or video URL.
              </p>
            ) : null}
          </div>
        )}
      </div>
      <div className="absolute bottom-0 inset-x-0 p-6 flex justify-end">
        <button
          type="button"
          onClick={addSelected}
          disabled={!selected.length}
          className="primary-btn-gradient text-white px-6 py-2 rounded-lg disabled:opacity-40"
        >
          Add {selected.length} to setlist
        </button>
      </div>
    </div>
  );
}
