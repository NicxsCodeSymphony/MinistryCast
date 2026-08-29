import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import churchInterior from "../assets/images/church-interior.png";
import { completeOnboarding, getSessionProfile } from "../lib/auth";
import { useToast } from "../lib/ToastContext";

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

  return (
    <div className="relative min-h-full w-full overflow-hidden bg-surface-container-lowest text-on-surface">
      <img
        src={churchInterior}
        alt=""
        className="absolute inset-0 h-full w-full object-cover scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/35" />
      <div className="absolute inset-0 bg-black/20" />

      <div className="relative z-10 min-h-full flex items-center px-6 sm:px-12 lg:px-20 py-12">
        <div className="max-w-xl page-enter">
          <p className="text-[10px] font-bold tracking-[0.28em] text-[#E9C349] uppercase">
            First-run migration
          </p>
          <h1 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-tight text-white">
            {headline}
          </h1>
          <p className="mt-4 text-white/70 leading-relaxed">
            {phase === "welcome"
              ? `${userName ? `${userName}, this` : "This"} is a new MinistryCast workspace. We’ll seed the production defaults your live sessions need — then you can build songs, sermons, and setlists.`
              : phase === "migrate"
                ? "Because this product is new, we’re migrating a starter library into your church so live, songs, and projection work immediately."
                : "Categories, languages, and projector outputs are in place. Open the operator console, then send lyrics to the sanctuary display."}
          </p>

          {phase === "welcome" ? (
            <button
              type="button"
              onClick={() => setPhase("migrate")}
              className="mt-8 min-h-14 px-8 rounded-xl bg-primary text-on-primary font-semibold hover:brightness-110 active:scale-[0.99] transition-all"
            >
              Start migration
            </button>
          ) : null}

          {phase !== "welcome" ? (
            <ul className="mt-8 space-y-3">
              {STEPS.map((step, index) => {
                const done = index < doneCount;
                return (
                  <li
                    key={step.label}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-all duration-500 ${
                      done
                        ? "border-primary/30 bg-primary/10"
                        : "border-white/10 bg-black/30"
                    }`}
                  >
                    <span
                      className={`mt-0.5 material-symbols-outlined text-[20px] ${
                        done ? "text-primary" : "text-white/30"
                      }`}
                    >
                      {done ? "check_circle" : "radio_button_unchecked"}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{step.label}</p>
                      <p className="text-xs text-white/50">{step.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {phase === "ready" ? (
            <div className="mt-8">
              {error ? (
                <p className="mb-4 text-sm text-[#ffb4ab]">{error}</p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void finish()}
                className="min-h-14 px-8 rounded-xl bg-primary text-on-primary font-semibold hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-60"
              >
                {busy ? "Opening workspace…" : "Enter production"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
