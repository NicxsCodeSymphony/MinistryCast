import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { MailIcon, MinistryCastIcon, UpArrowIcon } from "../components/icons";
import { requestPasswordReset } from "../lib/auth";
import AuthFrame, { isValidEmail } from "./AuthFrame";
import { useToast } from "../lib/ToastContext";

export default function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [working, setWorking] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setWorking(true);
    try {
      await requestPasswordReset(trimmed);
      setSent(true);
      toast.success("Check your inbox for a reset link.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not send the reset email.";
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
        Forgot password
      </h2>
      <p className="mt-4 text-white/60 max-w-[425px]">
        We’ll email a reset link. After you open it, choose a new password and
        sign in.
      </p>

      <form
        className="mt-8 w-full max-w-md rounded-[8px] border border-white/10 bg-white/[0.03] p-5 sm:p-8"
        onSubmit={(event) => void handleSubmit(event)}
      >
        {sent ? (
          <p className="text-[#E2E8F0] text-sm leading-relaxed">
            If an account exists for <strong>{email.trim()}</strong>, a reset
            email is on the way.
          </p>
        ) : (
          <>
            <label className="block">
              <span className="sr-only">Email</span>
              <div className="bg-white/5 flex items-center min-h-[57px] pl-4 border border-white/10 rounded-[8px]">
                <MailIcon />
                <input
                  className="text-[#E2E8F0] placeholder:text-white/20 bg-transparent text-[16px] w-full outline-none px-3"
                  placeholder="Email Address"
                  type="email"
                  autoComplete="email"
                  data-testid="forgot-email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </label>
            {error ? (
              <p className="mt-3 text-sm text-[#ffb4ab]">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={working}
              data-testid="forgot-submit"
              className="mt-4 w-full min-h-[56px] bg-indigo-600 rounded-[8px] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <UpArrowIcon />
              <span className="text-white font-semibold">
                {working ? "Sending…" : "Send reset link"}
              </span>
            </button>
          </>
        )}
        <p className="mt-5 text-sm text-white/50">
          <Link className="text-[#818CF8] hover:underline" to="/">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}
