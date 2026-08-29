import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  GoogleIcon,
  LockIcon,
  MailIcon,
  MinistryCastIcon,
  UpArrowIcon,
} from "../components/icons";
import {
  getSessionProfile,
  nextPathForProfile,
  signInWithEmailPassword,
} from "../lib/auth";
import AuthFrame, { AUTH_EMAIL_KEY, isValidEmail } from "./AuthFrame";
import { useToast } from "../lib/ToastContext";

const WelcomePage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const profile = await getSessionProfile();
        const next = nextPathForProfile(profile);
        if (next !== "/") navigate(next, { replace: true });
      } catch {
        // stay on welcome if supabase is down
      }
    })();
  }, [navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address to continue.");
      toast.warning("Enter a valid email address to continue.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      toast.warning("Enter your password.");
      return;
    }
    setError("");
    setSigningIn(true);
    try {
      sessionStorage.setItem(AUTH_EMAIL_KEY, trimmed);
      await signInWithEmailPassword(trimmed, password);
      const profile = await getSessionProfile();
      navigate(nextPathForProfile(profile), { replace: true, state: { email: trimmed } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sign in.";
      setError(message);
      toast.error(message);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <AuthFrame step={1}>
      <MinistryCastIcon />

      <h5 className="bg-[#4FACFE]/10 font-bold text-[10px] text-[#4FACFE] w-fit px-3 py-1 text-center rounded-full mt-6 tracking-widest uppercase">
        Next-Gen Worship
      </h5>

      <h2 className="text-[clamp(1.75rem,4vw,3rem)] mt-8 text-[#E2E8F0] max-w-[479px] font-bold leading-tight">
        Welcome to the
        <br />
        MinistryCast Suite
      </h2>

      <p className="mt-6 text-white/60 text-[clamp(0.875rem,1.5vw,1.125rem)] leading-relaxed max-w-md">
        Elevate your spiritual experience with cinematic presentation
        technology. Built for modern worship environments.
      </p>

      <form
        className="mt-10 w-full max-w-md rounded-[8px] border border-white/10 bg-white/[0.03] p-5 sm:p-8"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <h5 className="text-white/40 font-bold text-xs tracking-widest uppercase">
          Connect Your Ministry
        </h5>

        <label className="mt-6 block">
          <span className="sr-only">Email address</span>
          <div className="bg-white/5 flex items-center min-h-[57px] pl-4 border border-white/10 rounded-[8px] focus-within:border-[#4FACFE]/60">
            <MailIcon />
            <input
              className="text-[#E2E8F0] placeholder:text-white/20 bg-transparent text-[16px] w-full min-w-0 outline-none px-3"
              placeholder="Email Address"
              type="email"
              autoComplete="email"
              data-testid="welcome-email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError("");
              }}
            />
          </div>
        </label>

        <label className="mt-4 block">
          <span className="sr-only">Password</span>
          <div className="bg-white/5 flex items-center min-h-[57px] pl-4 border border-white/10 rounded-[8px] focus-within:border-[#4FACFE]/60">
            <LockIcon />
            <input
              className="text-[#E2E8F0] placeholder:text-white/20 bg-transparent text-[16px] w-full min-w-0 outline-none px-3"
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              data-testid="welcome-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError("");
              }}
            />
          </div>
        </label>

        <div className="mt-2 flex justify-end">
          <Link
            className="text-[11px] font-semibold text-[#4FACFE] hover:text-white uppercase tracking-wider"
            to="/forgot-password"
            data-testid="welcome-forgot"
          >
            Forgot Password?
          </Link>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-[#ffb4ab]">{error}</p>
        ) : null}

        <div className="mt-4 flex flex-row items-center gap-3">
          <button
            type="submit"
            disabled={signingIn}
            data-testid="welcome-continue"
            className="flex-1 min-h-[56px] bg-indigo-600 hover:bg-indigo-500 rounded-[8px] flex items-center justify-center gap-2 text-white font-semibold disabled:opacity-60"
          >
            <UpArrowIcon />
            {signingIn ? "Signing in…" : "Continue"}
          </button>
          <button
            type="button"
            className="w-[56px] h-[56px] shrink-0 bg-white/5 border border-white/10 rounded-[8px] flex items-center justify-center text-white/60"
            aria-label="Continue with Google"
          >
            <GoogleIcon />
          </button>
        </div>

        <p className="mt-5 text-sm text-white/50">
          New here?{" "}
          <Link className="text-[#818CF8] hover:underline" to="/register">
            Create an account
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
};

export default WelcomePage;
