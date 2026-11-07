import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { AuthCard, AuthError, AuthField, AuthFootnote, AuthHeading, AuthSubmit } from "./authUi";
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
      <AuthHeading eyebrow="Account recovery" title="Forgot password">
        We’ll email a reset link. After you open it, choose a new password and
        sign in.
      </AuthHeading>

      <AuthCard onSubmit={(event) => void handleSubmit(event)}>
        {sent ? (
          <div className="flex items-start gap-3">
            <span className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="check_circle" className="text-[16px]" />
            </span>
            <p className="text-on-surface text-[14px] leading-relaxed">
              If an account exists for <strong>{email.trim()}</strong>, a reset
              email is on the way.
            </p>
          </div>
        ) : (
          <>
            <AuthField
              label="Email"
              placeholder="Email Address"
              type="email"
              name="email"
              autoComplete="email"
              data-testid="forgot-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <AuthError>{error}</AuthError>
            <div className="mt-3">
              <AuthSubmit disabled={working} testId="forgot-submit" icon="send">
                {working ? "Sending…" : "Send reset link"}
              </AuthSubmit>
            </div>
          </>
        )}
        <AuthFootnote>
          <Link className="text-primary hover:underline inline-flex items-center gap-1" to="/">
            <Icon name="arrow_back" className="text-[14px]" />
            Back to sign in
          </Link>
        </AuthFootnote>
      </AuthCard>
    </AuthFrame>
  );
}
