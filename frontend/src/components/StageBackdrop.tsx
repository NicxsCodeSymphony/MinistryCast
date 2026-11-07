import { useEffect, useState, type CSSProperties } from "react";
import churchInterior from "../assets/images/church-interior.jpg";
import { getBackgroundImageUrl } from "../lib/api";
import {
  imageBackgroundAssetId,
  stageBackgroundDef,
  type StageBackgroundId,
} from "../lib/stageBackgrounds";

type StageBackdropProps = {
  id?: string | null;
  className?: string;
};

/* Custom image backgrounds live in IndexedDB (media_assets). Cache resolved
 * data URLs per asset so slide changes never re-read the store. */
const imageCache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function resolveImage(assetId: string) {
  if (imageCache.has(assetId)) return Promise.resolve(imageCache.get(assetId) ?? null);
  let job = pending.get(assetId);
  if (!job) {
    job = getBackgroundImageUrl(assetId)
      .catch(() => null)
      .then((url) => {
        imageCache.set(assetId, url);
        pending.delete(assetId);
        return url;
      });
    pending.set(assetId, job);
  }
  return job;
}

/** Seed the cache right after an upload so the picker shows it instantly. */
export function primeBackgroundImage(assetId: string, url: string) {
  imageCache.set(assetId, url);
}

export function forgetBackgroundImage(assetId: string) {
  imageCache.delete(assetId);
}

export function useBackgroundImageUrl(id?: string | null) {
  const assetId = imageBackgroundAssetId(id);
  const [url, setUrl] = useState<string | null>(() =>
    assetId ? imageCache.get(assetId) ?? null : null,
  );
  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    let alive = true;
    setUrl(imageCache.get(assetId) ?? null);
    void resolveImage(assetId).then((next) => {
      if (alive) setUrl(next);
    });
    return () => {
      alive = false;
    };
  }, [assetId]);
  return url;
}

export default function StageBackdrop({
  id,
  className = "",
}: StageBackdropProps) {
  const bg = stageBackgroundDef(id);
  const imageUrl = useBackgroundImageUrl(bg.kind === "image" ? bg.id : null);
  if (bg.kind === "image") {
    return (
      <>
        <div className={`absolute inset-0 bg-black ${className}`} />
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            data-stage-background={bg.id}
            className={`absolute inset-0 h-full w-full object-cover ${className}`}
          />
        ) : null}
        <div className="absolute inset-0 bg-black/35" />
      </>
    );
  }
  if (bg.kind === "none") {
    return <div className={`absolute inset-0 bg-black ${className}`} />;
  }
  if (bg.id === "white") {
    return <div className={`absolute inset-0 bg-white ${className}`} />;
  }
  if (bg.kind === "photo") {
    return (
      <>
        <img
          src={churchInterior}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover ${className}`}
        />
        <div className="absolute inset-0 bg-black/45" />
      </>
    );
  }
  return (
    <>
      <div className={`absolute inset-0 ${className}`} style={bg.style} />
      <div className="absolute inset-0 bg-black/28" />
    </>
  );
}

export function stageBackgroundThumbStyle(id: StageBackgroundId, imageUrl?: string | null): CSSProperties {
  const bg = stageBackgroundDef(id);
  if (bg.kind === "image") {
    return imageUrl
      ? { backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { background: "#111" };
  }
  if (bg.kind === "none") return { background: "#000" };
  if (bg.id === "white") return { background: "#fff" };
  if (bg.kind === "photo") {
    return {
      backgroundImage: `url(${churchInterior})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return bg.style ?? { background: "#111" };
}

/** Small preview tile for any background id (built-in or custom image). */
export function StageBackgroundThumb({
  id,
  className = "",
}: {
  id: StageBackgroundId;
  className?: string;
}) {
  const url = useBackgroundImageUrl(id);
  return <span className={className} style={stageBackgroundThumbStyle(id, url)} />;
}
