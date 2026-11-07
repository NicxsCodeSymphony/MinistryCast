import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthCard, AuthError, AuthField, AuthFootnote, AuthHeading, AuthSubmit } from "./authUi";
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
      const profile = await getSessionProfile({ fresh: true });
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
      <AuthHeading eyebrow="Get started" title="Create your account">
        Create an email and password. You can sign in right away — no confirmation
        email.
      </AuthHeading>

      <AuthCard onSubmit={(event) => void handleSubmit(event)}>
        <AuthField
          label="Email"
          placeholder="Email address"
          type="email"
          name="email"
          autoComplete="email"
          data-testid="register-email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <AuthField
          className="mt-4"
          label="Password"
          placeholder="Password (min 6 characters)"
          type="password"
          name="password"
          autoComplete="new-password"
          data-testid="register-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <AuthField
          className="mt-4"
          label="Confirm password"
          placeholder="Confirm password"
          type="password"
          name="confirm"
          autoComplete="new-password"
          data-testid="register-confirm"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <AuthError>{error}</AuthError>
        <div className="mt-3">
          <AuthSubmit disabled={working} testId="register-submit">
            {working ? "Creating…" : "Create account"}
          </AuthSubmit>
        </div>
        <AuthFootnote>
          Already have an account?{" "}
          <Link className="text-primary hover:underline" to="/">
            Sign in
          </Link>
        </AuthFootnote>
      </AuthCard>
    </AuthFrame>
  );
}
