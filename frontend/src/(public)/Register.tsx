import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MailIcon, MinistryCastIcon, UpArrowIcon } from "../components/icons";
import { getSessionProfile, nextPathForProfile, registerAccount } from "../lib/auth";
import AuthFrame, { AUTH_EMAIL_KEY, isValidEmail } from "./AuthFrame";
import { useToast } from "../lib/ToastContext";

export default function Register() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setWorking(true);
    try {
      sessionStorage.setItem(AUTH_EMAIL_KEY, trimmed);
      await registerAccount(trimmed, password);
      const profile = await getSessionProfile();
      toast.success("Account created.");
      navigate(nextPathForProfile(profile), {
        replace: true,
        state: { email: trimmed },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create the account.";
      setError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <AuthFrame step={1}>
      <MinistryCastIcon />
      <h2 className="text-[clamp(1.75rem,4vw,3rem)] mt-8 text-[#E2E8F0] max-w-[479px] font-bold leading-tight">
        Create your account
      </h2>
      <p className="mt-4 text-white/60 max-w-[425px]">
        Create an email and password. You can sign in right away — no confirmation
        email.
      </p>

      <form
        className="mt-6 w-full max-w-[448px] border border-white/10 bg-[#191922] rounded-[8px] p-5 sm:p-8"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label className="block">
          <span className="sr-only">Email</span>
          <div className="bg-white/10 flex items-center min-h-[57px] pl-4 border border-white/10 rounded-[8px]">
            <MailIcon />
            <input
              className="text-[#E2E8F0] placeholder:text-white/20 bg-transparent text-[16px] w-full outline-none px-3"
              placeholder="Email address"
              type="email"
              autoComplete="email"
              data-testid="register-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </label>
        <label className="block mt-3">
          <span className="sr-only">Password</span>
          <input
            className="w-full min-h-[57px] bg-white/10 border border-white/10 rounded-[8px] px-4 text-[#E2E8F0] placeholder:text-white/20 outline-none"
            placeholder="Password (min 6 characters)"
            type="password"
            autoComplete="new-password"
            data-testid="register-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="block mt-3">
          <span className="sr-only">Confirm password</span>
          <input
            className="w-full min-h-[57px] bg-white/10 border border-white/10 rounded-[8px] px-4 text-[#E2E8F0] placeholder:text-white/20 outline-none"
            placeholder="Confirm password"
            type="password"
            autoComplete="new-password"
            data-testid="register-confirm"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        {error ? (
          <p className="mt-3 text-sm text-[#ffb4ab]">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={working}
          data-testid="register-submit"
          className="mt-4 w-full min-h-[56px] bg-[#4F46E5] rounded-[8px] flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <UpArrowIcon />
          <span className="text-white font-semibold">
            {working ? "Creating…" : "Create account"}
          </span>
        </button>
        <p className="mt-5 text-sm text-white/50">
          Already have an account?{" "}
          <Link className="text-[#818CF8] hover:underline" to="/">
            Sign in
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}
