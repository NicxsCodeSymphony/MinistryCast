import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BuildingIcon,
  MinistryCastIcon,
  PersonIcon,
  UpArrowIcon,
} from "../components/icons";
import {
  completeSignup,
  getSessionProfile,
  nextPathForProfile,
  signOut,
  suggestChurches,
  type ChurchSuggestion,
  type SessionProfile,
} from "../lib/auth";
import { supabase } from "../lib/supabase";
import AuthFrame, { AUTH_EMAIL_KEY } from "./AuthFrame";
import { useToast } from "../lib/ToastContext";

type SignUpState = {
  email?: string;
};

export default function SignUp() {
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const passedEmail = (location.state as SignUpState | null)?.email;
  const [email, setEmail] = useState(
    passedEmail?.trim() || sessionStorage.getItem(AUTH_EMAIL_KEY) || "",
  );

  const [name, setName] = useState("");
  const [churchName, setChurchName] = useState("");
  const [selectedChurchId, setSelectedChurchId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ChurchSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<SessionProfile | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/", { replace: true });
        return;
      }
      const sessionEmail = data.session.user.email?.trim();
      if (sessionEmail) setEmail(sessionEmail);
      try {
        const next = await getSessionProfile();
        const dest = nextPathForProfile(next);
        if (dest === "/dashboard" || dest === "/admin") {
          navigate(dest, { replace: true });
          return;
        }
        setProfile(next);
        if (next.user) setName(next.user.name);
        if (next.church) setChurchName(next.church.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load account.");
      }
    })();
  }, [navigate]);

  useEffect(() => {
    const q = churchName.trim();
    if (q.length < 1 || selectedChurchId) {
      setSuggestions([]);
      setSuggestError("");
      setSuggesting(false);
      return;
    }
    let cancelled = false;
    setSuggesting(true);
    const timer = window.setTimeout(() => {
      void suggestChurches(q)
        .then((rows) => {
          if (cancelled) return;
          setSuggestions(rows);
          setSuggestError("");
        })
        .catch((err) => {
          if (cancelled) return;
          setSuggestions([]);
          setSuggestError(
            err instanceof Error
              ? err.message
              : "Could not load church suggestions.",
          );
        })
        .finally(() => {
          if (!cancelled) setSuggesting(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [churchName, selectedChurchId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !churchName.trim()) {
      setError("Enter your name and church name to continue.");
      toast.warning("Enter your name and church name to continue.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const next = await completeSignup(
        name.trim(),
        churchName.trim(),
        selectedChurchId,
      );
      setProfile(next);
      toast.success(
        selectedChurchId
          ? "Join request sent. Your church admin will review first, then platform."
          : "Account created. Waiting for platform approval.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not submit.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!email && !profile?.authenticated) return null;

  const submitted = Boolean(profile?.user);
  const joiningExisting = Boolean(
    profile?.user?.role === "operator" || selectedChurchId,
  );

  return (
    <AuthFrame step={2}>
      <MinistryCastIcon />

      {submitted ? (
        <>
          <h5 className="bg-[#4FACFE]/10 font-bold text-[10px] text-[#4FACFE] w-fit px-3 text-center rounded-full mt-5">
            PENDING REVIEW
          </h5>
          <h2 className="text-[clamp(1.75rem,4vw,3rem)] mt-8 xl:mt-11 text-[#E2E8F0] max-w-[479px] font-bold leading-tight">
            Submitted for approval
          </h2>
          <div className="max-w-[425px]">
            <p className="mt-6 text-white/60 text-[clamp(0.875rem,1.5vw,1rem)] leading-relaxed">
              Thanks {profile?.user?.name}.{" "}
              {joiningExisting || profile?.user?.role === "operator" ? (
                <>
                  Your request to join {profile?.church?.name} as a church member
                  is waiting for a church admin, then platform approval. We’ll
                  email {profile?.user?.email || email} when you’re activated.
                </>
              ) : (
                <>
                  {profile?.church?.name} is in the platform review queue. We’ll
                  email {profile?.user?.email || email} when your ministry is
                  approved.
                </>
              )}
            </p>
          </div>
          <div className="mt-6 w-full max-w-[448px] border border-white/10 bg-[#191922] rounded-[8px] p-5 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#E9C349] animate-pulse" />
              <p className="text-sm text-[#E2E8F0] font-medium">
                {joiningExisting || profile?.user?.role === "operator"
                  ? "Awaiting church admin → platform"
                  : "Awaiting platform approval"}
              </p>
            </div>
            <p className="mt-3 text-xs text-white/40 leading-relaxed">
              You can close this window. Production tools stay locked until your
              church is activated.
            </p>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  await signOut();
                  navigate("/", { replace: true });
                })();
              }}
              className="mt-6 inline-flex min-h-[48px] items-center text-sm text-[#4FACFE] hover:underline"
            >
              Back to sign in
            </button>
          </div>
        </>
      ) : (
        <>
          <h5 className="bg-[#4FACFE]/10 font-bold text-[10px] text-[#4FACFE] w-fit px-3 text-center rounded-full mt-5">
            ALMOST THERE
          </h5>
          <h2 className="text-[clamp(1.75rem,4vw,3rem)] mt-8 xl:mt-11 text-[#E2E8F0] max-w-[479px] font-bold leading-tight">
            Finish setting up your ministry
          </h2>
          <div className="max-w-[425px]">
            <p className="mt-6 text-white/60 text-[clamp(0.875rem,1.5vw,1rem)] leading-relaxed">
              Verified as {email}. Pick an <span className="text-white/80">active</span> church
              to join as a member (their admins approve first), or type a new
              name to create a church for platform review.
            </p>
          </div>

          <form
            className="mt-6 w-full max-w-[448px] border border-white/10 bg-[#191922] rounded-[8px] p-5 sm:p-8"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <h5 className="text-white/40 font-bold text-[12px]">
              CREATE YOUR ACCOUNT
            </h5>

            <label className="mt-6 block">
              <span className="sr-only">Full name</span>
              <div className="bg-white/10 flex items-center min-h-[57px] pl-4 border border-white/10 rounded-[8px] focus-within:border-[#4F46E5]/60">
                <PersonIcon />
                <input
                  className="text-[#E2E8F0] placeholder:text-white/20 bg-transparent text-[16px] w-full min-w-0 outline-none px-3"
                  placeholder="Enter your name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (error) setError("");
                  }}
                />
              </div>
            </label>

            <label className="mt-4 block">
              <span className="sr-only">Church name</span>
              <div className="bg-white/10 flex items-center min-h-[57px] pl-4 border border-white/10 rounded-[8px] focus-within:border-[#4F46E5]/60">
                <BuildingIcon />
                <input
                  className="text-[#E2E8F0] placeholder:text-white/20 bg-transparent text-[16px] w-full min-w-0 outline-none px-3"
                  placeholder="Enter church name"
                  autoComplete="organization"
                  value={churchName}
                  onChange={(event) => {
                    setChurchName(event.target.value);
                    setSelectedChurchId(null);
                    if (error) setError("");
                  }}
                />
              </div>
              {selectedChurchId ? (
                <p className="mt-2 text-xs text-[#4FACFE]">
                  Joining existing church. Edit the name to create a new one
                  instead.
                </p>
              ) : null}
              {suggesting && !selectedChurchId ? (
                <p className="mt-2 text-xs text-white/40">Searching churches…</p>
              ) : null}
              {suggestError && !selectedChurchId ? (
                <p className="mt-2 text-xs text-[#ffb4ab]">{suggestError}</p>
              ) : null}
              {!selectedChurchId && suggestions.length > 0 ? (
                <ul className="mt-2 max-h-48 overflow-auto rounded-lg border border-white/10 bg-[#0f0f18]">
                  {suggestions.map((row) => (
                    <li key={row.id} className="border-b border-white/5 last:border-b-0">
                      <button
                        type="button"
                        disabled={row.status !== "active"}
                        className="w-full px-3 py-2.5 text-left text-sm text-[#E2E8F0] hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
                        onClick={() => {
                          if (row.status !== "active") return;
                          setChurchName(row.name);
                          setSelectedChurchId(row.id);
                          setSuggestions([]);
                        }}
                      >
                        <span className="font-medium">{row.name}</span>
                        <span className="ml-2 text-[11px] uppercase tracking-wide text-white/40">
                          {row.status === "active" ? "join" : row.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!selectedChurchId &&
              !suggesting &&
              !suggestError &&
              churchName.trim().length >= 1 &&
              suggestions.length === 0 ? (
                <p className="mt-2 text-xs text-white/40">
                  No matching church yet — submit to create a new one.
                </p>
              ) : null}
            </label>

            {error ? (
              <p className="mt-3 text-sm text-[#ffb4ab]">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full min-h-[56px] sm:min-h-[65px] bg-[#4F46E5] rounded-[8px] flex items-center justify-center gap-2 focus:outline-none hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-60"
            >
              <UpArrowIcon />
              <h5 className="text-white font-semibold text-[16px]">
                {submitting
                  ? "Submitting…"
                  : selectedChurchId
                    ? "Request to join church"
                    : "Submit for approval"}
              </h5>
            </button>

            <p className="mt-4 text-center text-xs text-white/40">
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    await signOut();
                    navigate("/", { replace: true });
                  })();
                }}
                className="text-[#4FACFE] hover:underline"
              >
                Use a different email
              </button>
            </p>
          </form>
        </>
      )}
    </AuthFrame>
  );
}
