import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MinistryCastIcon, UpArrowIcon } from "../components/icons";
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
      <MinistryCastIcon />
      <h2 className="text-[clamp(1.75rem,4vw,3rem)] mt-8 text-[#E2E8F0] max-w-[479px] font-bold leading-tight">
        Choose a new password
      </h2>
      <p className="mt-4 text-white/60 max-w-[425px]">
        {ready
          ? "Enter a new password for this account."
          : "Open the reset link from your email to continue."}
      </p>

      <form
        className="mt-8 w-full max-w-md rounded-[8px] border border-white/10 bg-white/[0.03] p-5 sm:p-8"
        onSubmit={(event) => void handleSubmit(event)}
      >
        {ready ? (
          <>
            <input
              className="w-full min-h-[57px] bg-white/5 border border-white/10 rounded-[8px] px-4 text-[#E2E8F0] placeholder:text-white/20 outline-none"
              placeholder="New password"
              type="password"
              autoComplete="new-password"
              data-testid="reset-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <input
              className="mt-3 w-full min-h-[57px] bg-white/5 border border-white/10 rounded-[8px] px-4 text-[#E2E8F0] placeholder:text-white/20 outline-none"
              placeholder="Confirm password"
              type="password"
              autoComplete="new-password"
              data-testid="reset-confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            {error ? (
              <p className="mt-3 text-sm text-[#ffb4ab]">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={working}
              data-testid="reset-submit"
              className="mt-4 w-full min-h-[56px] bg-indigo-600 rounded-[8px] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <UpArrowIcon />
              <span className="text-white font-semibold">
                {working ? "Saving…" : "Save password"}
              </span>
            </button>
          </>
        ) : (
          <p className="text-sm text-white/60">Waiting for the reset link…</p>
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
