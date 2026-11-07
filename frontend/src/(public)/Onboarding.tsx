import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import churchInterior from "../assets/images/church-interior.jpg";
import { completeOnboarding, getSessionProfile } from "../lib/auth";
import { useToast } from "../lib/ToastContext";
import Icon from "../components/Icon";
import { MinistryCastIcon } from "../components/icons";
import { Meter } from "../components/bento";

const STEPS = [
  { label: "Languages", detail: "English, Tagalog, Visayan" },
  { label: "Worship categories", detail: "Praise, Worship, Hymns, and more" },
  { label: "Output displays", detail: "Projector, NDI, and stage confidence" },
  { label: "Projection defaults", detail: "Dissolve transitions and serif lyrics" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const toast = useToast();
  const [churchName, setChurchName] = useState("your ministry");
  const [userName, setUserName] = useState("");
  const [phase, setPhase] = useState<"welcome" | "migrate" | "ready">("welcome");
  const [doneCount, setDoneCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getSessionProfile().then((profile) => {
      if (profile.church?.name) setChurchName(profile.church.name);
      if (profile.user?.name) setUserName(profile.user.name);
    });
  }, []);

  useEffect(() => {
    if (phase !== "migrate") return;
    setDoneCount(0);
    const timers: number[] = [];
    STEPS.forEach((_, index) => {
      timers.push(
        window.setTimeout(() => setDoneCount(index + 1), 450 * (index + 1)),
      );
    });
    timers.push(
      window.setTimeout(() => setPhase("ready"), 450 * STEPS.length + 500),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [phase]);

  const headline = useMemo(() => {
    if (phase === "welcome") return `Welcome to ${churchName}`;
    if (phase === "migrate") return "Migrating your workspace";
    return "Your sanctuary is ready";
  }, [phase, churchName]);

  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      await completeOnboarding();
      toast.success("Setup complete.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not finish setup.";
      setError(message);
      toast.error(message);
      setBusy(false);
    }
  };

  const stepIndex = phase === "welcome" ? 1 : phase === "migrate" ? 2 : 3;

  return (
    <div className="force-dark relative min-h-dvh w-full overflow-hidden bg-surface-container-lowest text-on-surface">
      <img
        src={churchInterior}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Solid scrim keeps text legible on any photo. */}
      <div className="absolute inset-0 bg-black/70" />

      <div className="relative z-10 min-h-dvh flex flex-col px-6 sm:px-12 lg:px-20 py-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <MinistryCastIcon width={28} height={28} />
            <span className="text-[14px] font-semibold text-on-surface">MinistryCast</span>
          </div>
          <p className="text-[12px] text-on-surface-variant tabular-nums">
            Step {stepIndex} of 3
          </p>
        </div>

        <div className="flex-1 flex items-center py-12">
          <div className="w-full max-w-[560px] page-enter">
            <p className="text-[12px] font-medium text-primary">First-run setup</p>
            <h1 className="mt-2 text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-on-surface">
              {headline}
            </h1>
            <p className="mt-4 text-[15px] text-on-surface-variant leading-relaxed">
              {phase === "welcome"
                ? `${userName ? `${userName}, this` : "This"} is a new MinistryCast workspace. We’ll seed the production defaults your live sessions need — then you can build songs, sermons, and setlists.`
                : phase === "migrate"
                  ? "Because this product is new, we’re migrating a starter library into your church so live, songs, and projection work immediately."
                  : "Categories, languages, and projector outputs are in place. Open the operator console, then send lyrics to the sanctuary display."}
            </p>

            <div className="mt-8 rounded-[14px] border border-white/10 bg-surface-container/80">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
                <p className="text-[13px] font-medium text-on-surface-variant">
                  {phase === "welcome" ? "What we’ll set up" : "Progress"}
                </p>
                <p className="text-[12px] text-on-surface-variant tabular-nums">
                  {doneCount}/{STEPS.length}
                </p>
              </div>
              <div className="px-5 pb-3">
                <Meter value={doneCount} max={STEPS.length} label="Setup progress" />
              </div>
              <ul className="border-t border-white/5">
                {STEPS.map((step, index) => {
                  const done = index < doneCount;
                  const running = phase === "migrate" && index === doneCount;
                  return (
                    <li
                      key={step.label}
                      className="flex items-center gap-3 px-5 h-12 border-t border-white/5 first:border-t-0"
                    >
                      <Icon
                        name={done ? "check_circle" : running ? "progress_activity" : "radio_button_unchecked"}
                        className={`text-[16px] shrink-0 ${
                          done ? "text-primary" : running ? "text-on-surface-variant animate-spin" : "text-outline"
                        }`}
                      />
                      <p className="text-[13px] font-medium text-on-surface">{step.label}</p>
                      <p className="ml-auto text-[12px] text-on-surface-variant truncate">{step.detail}</p>
                    </li>
                  );
                })}
              </ul>
            </div>

            {error ? (
              <p role="alert" className="mt-4 text-[13px] text-error">{error}</p>
            ) : null}

            {phase === "welcome" ? (
              <button
                type="button"
                onClick={() => setPhase("migrate")}
                className="ui-btn ui-btn-primary mt-6 h-10 px-5 text-[14px] font-medium"
              >
                Start migration
                <Icon name="arrow_forward" className="text-[15px]" />
              </button>
            ) : null}

            {phase === "ready" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void finish()}
                className="ui-btn ui-btn-primary mt-6 h-10 px-5 text-[14px] font-medium"
              >
                {busy ? "Opening workspace…" : "Enter production"}
                <Icon name="arrow_forward" className="text-[15px]" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
