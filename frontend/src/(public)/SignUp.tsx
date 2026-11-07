import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge } from "../components/ui";
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
import { AuthCard, AuthError, AuthField, AuthFootnote, AuthHeading, AuthSubmit } from "./authUi";

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
        const next = await getSessionProfile({ fresh: true });
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

  const backToSignIn = () => {
    void (async () => {
      await signOut();
      navigate("/", { replace: true });
    })();
  };

  return (
    <AuthFrame step={2}>
      {submitted ? (
        <>
          <AuthHeading eyebrow="Pending review" title="Submitted for approval">
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
          </AuthHeading>
          <div className="mt-8 w-full border-t border-white/10 pt-6">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <p className="text-[14px] text-on-surface font-medium">
                {joiningExisting || profile?.user?.role === "operator"
                  ? "Awaiting church admin → platform"
                  : "Awaiting platform approval"}
              </p>
            </div>
            <p className="mt-2 text-[13px] text-on-surface-variant leading-relaxed">
              You can close this window. Production tools stay locked until your
              church is activated.
            </p>
            <button
              type="button"
              onClick={backToSignIn}
              className="ui-btn ui-btn-secondary mt-5"
            >
              <Icon name="arrow_back" className="text-[14px]" />
              Back to sign in
            </button>
          </div>
        </>
      ) : (
        <>
          <AuthHeading eyebrow="Almost there" title="Finish setting up your ministry">
            Verified as {email}. Pick an <span className="text-on-surface">active</span> church
            to join as a member (their admins approve first), or type a new
            name to create a church for platform review.
          </AuthHeading>

          <AuthCard onSubmit={(event) => void handleSubmit(event)}>
            <AuthField
              label="Full name"
              icon="person"
              placeholder="Enter your name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError("");
              }}
            />

            <div className="mt-4">
              <AuthField
                label="Church name"
                icon="church"
                placeholder="Enter church name"
                name="church"
                autoComplete="organization"
                value={churchName}
                onChange={(event) => {
                  setChurchName(event.target.value);
                  setSelectedChurchId(null);
                  if (error) setError("");
                }}
              />
              {selectedChurchId ? (
                <p className="mt-2 text-[12px] text-primary">
                  Joining existing church. Edit the name to create a new one
                  instead.
                </p>
              ) : null}
              {suggesting && !selectedChurchId ? (
                <p className="mt-2 text-[12px] text-on-surface-variant">Searching churches…</p>
              ) : null}
              {suggestError && !selectedChurchId ? (
                <p className="mt-2 text-[12px] text-error">{suggestError}</p>
              ) : null}
              {!selectedChurchId && suggestions.length > 0 ? (
                <ul className="mt-2 max-h-48 overflow-auto rounded-lg border border-white/10 bg-surface-container-low custom-scrollbar">
                  {suggestions.map((row) => (
                    <li key={row.id} className="border-b border-white/5 last:border-b-0">
                      <button
                        type="button"
                        disabled={row.status !== "active"}
                        className="w-full px-3 h-10 flex items-center gap-2.5 text-left text-[13px] text-on-surface hover:bg-white/[0.03] disabled:opacity-40 disabled:hover:bg-transparent"
                        onClick={() => {
                          if (row.status !== "active") return;
                          setChurchName(row.name);
                          setSelectedChurchId(row.id);
                          setSuggestions([]);
                        }}
                      >
                        <Icon name="church" className="text-[14px] text-outline shrink-0" />
                        <span className="font-medium truncate flex-1">{row.name}</span>
                        <Badge tone={row.status === "active" ? "accent" : "neutral"}>
                          {row.status === "active" ? "join" : row.status}
                        </Badge>
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
                <p className="mt-2 text-[12px] text-on-surface-variant">
                  No matching church yet — submit to create a new one.
                </p>
              ) : null}
            </div>

            <AuthError>{error}</AuthError>

            <div className="mt-3">
              <AuthSubmit disabled={submitting}>
                {submitting
                  ? "Submitting…"
                  : selectedChurchId
                    ? "Request to join church"
                    : "Submit for approval"}
              </AuthSubmit>
            </div>

            <AuthFootnote>
              <button type="button" onClick={backToSignIn} className="text-primary hover:underline">
                Use a different email
              </button>
            </AuthFootnote>
          </AuthCard>
        </>
      )}
    </AuthFrame>
  );
}
