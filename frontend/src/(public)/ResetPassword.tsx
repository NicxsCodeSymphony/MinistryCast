import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { AuthCard, AuthError, AuthField, AuthFootnote, AuthHeading, AuthSubmit } from "./authUi";
import { updatePassword } from "../lib/auth";
import { supabase } from "../lib/supabase";
import AuthFrame from "./AuthFrame";
import { useToast } from "../lib/ToastContext";

export default function ResetPassword() {
  const navigate = useNavigate();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
      await updatePassword(password);
      toast.success("Password updated. Sign in with the new password.");
      await supabase.auth.signOut({ scope: "global" });
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update your password.";
      setError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <AuthFrame step={1}>
      <AuthHeading eyebrow="Account recovery" title="Choose a new password">
        {ready
          ? "Enter a new password for this account."
          : "Open the reset link from your email to continue."}
      </AuthHeading>

      <AuthCard onSubmit={(event) => void handleSubmit(event)}>
        {ready ? (
          <>
            <AuthField
              label="New password"
              placeholder="New password"
              type="password"
              name="password"
              autoComplete="new-password"
              data-testid="reset-password"
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
              data-testid="reset-confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            <AuthError>{error}</AuthError>
            <div className="mt-3">
              <AuthSubmit disabled={working} testId="reset-submit" icon="check">
                {working ? "Saving…" : "Save password"}
              </AuthSubmit>
            </div>
          </>
        ) : (
          <p className="flex items-center gap-2 text-[14px] text-on-surface-variant">
            <Icon name="progress_activity" className="text-[15px] animate-spin" />
            Waiting for the reset link…
          </p>
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
