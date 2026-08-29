import churchInterior from "../assets/images/church-interior.png";
import {
  stageBackgroundDef,
  type StageBackgroundId,
} from "../lib/stageBackgrounds";

type StageBackdropProps = {
  id?: string | null;
  className?: string;
};

export default function StageBackdrop({
  id,
  className = "",
}: StageBackdropProps) {
  const bg = stageBackgroundDef(id);
  if (bg.kind === "none") {
    return <div className={`absolute inset-0 bg-black ${className}`} />;
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

export function stageBackgroundThumbStyle(id: StageBackgroundId) {
  const bg = stageBackgroundDef(id);
  if (bg.kind === "none") return { background: "#000" };
  if (bg.kind === "photo") {
    return {
      backgroundImage: `url(${churchInterior})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return bg.style ?? { background: "#111" };
}
