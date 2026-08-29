import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GoogleIcon,
  MailIcon,
  MinistryCastIcon,
  UpArrowIcon,
} from "../components/icons";
import {
  getSessionProfile,
  nextPathForProfile,
  sendEmailOtp,
  verifyEmailOtp,
} from "../lib/auth";
import AuthFrame, { AUTH_EMAIL_KEY, isValidEmail } from "./AuthFrame";
import OtpModal from "./OtpModal";
import { useToast } from "../lib/ToastContext";

const WelcomePage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);
  const [sending, setSending] = useState(false);

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

  const requestCode = async (address: string) => {
    await sendEmailOtp(address);
    sessionStorage.setItem(AUTH_EMAIL_KEY, address);
  };

  const openOtp = async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address to continue.");
      toast.warning("Enter a valid email address to continue.");
      return;
    }
    setError("");
    setSending(true);
    try {
      await requestCode(trimmed);
      setOtpOpen(true);
      toast.success("Code sent. Check your inbox.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not send the code.";
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void openOtp();
  };

  return (
    <AuthFrame>
      <MinistryCastIcon />

      <h5 className="bg-[#4FACFE]/10 font-bold text-[10px] text-[#4FACFE] w-fit px-3 text-center rounded-full mt-5">
        NEXT-GEN WORSHIP
      </h5>

      <h2 className="text-[clamp(1.75rem,4vw,3rem)] mt-8 xl:mt-11 text-[#E2E8F0] max-w-[479px] font-bold leading-tight">
        Welcome to the MinistryCast Suite
      </h2>

      <div className="max-w-[425px]">
        <p className="mt-6 text-white/60 text-[clamp(0.875rem,1.5vw,1rem)] leading-relaxed">
          Elevate your spiritual experience with cinematic presentation
          technology. Built for modern worship environments.
        </p>
      </div>

      <form
        className="mt-6 w-full max-w-[448px] border border-white/10 bg-[#191922] rounded-[8px] p-5 sm:p-8"
        onSubmit={handleSubmit}
      >
        <h5 className="text-white/40 font-bold text-[12px]">CONNECT YOUR MINISTRY</h5>

        <label className="mt-6 block">
          <span className="sr-only">Email address</span>
          <div className="bg-white/10 flex items-center min-h-[57px] pl-4 border border-white/10 rounded-[8px] focus-within:border-[#4F46E5]/60">
            <MailIcon />
            <input
              className="text-[#E2E8F0] placeholder:text-white/20 bg-transparent text-[16px] w-full min-w-0 outline-none px-3"
              placeholder="Enter email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError("");
              }}
            />
          </div>
        </label>

        {error ? (
          <p className="mt-3 text-sm text-[#ffb4ab]">{error}</p>
        ) : null}

        <div className="mt-4 flex flex-row items-center gap-3">
          <button
            type="submit"
            disabled={sending}
            className="flex-1 min-h-[56px] sm:min-h-[65px] bg-[#4F46E5] rounded-[8px] flex items-center justify-center gap-2 focus:outline-none hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-60"
          >
            <UpArrowIcon />
            <h5 className="text-white font-semibold text-[16px]">
              {sending ? "Sending code…" : "Continue"}
            </h5>
          </button>
          <button
            type="button"
            className="w-[56px] sm:w-[62px] h-[56px] sm:h-[65px] shrink-0 bg-white/10 border border-white/10 rounded-[8px] flex items-center justify-center"
            aria-label="Continue with Google"
          >
            <GoogleIcon />
          </button>
        </div>
      </form>

      <OtpModal
        open={otpOpen}
        email={email.trim()}
        busy={sending}
        onClose={() => setOtpOpen(false)}
        onVerify={async (code) => {
          const trimmed = email.trim();
          await verifyEmailOtp(trimmed, code);
          const profile = await getSessionProfile();
          setOtpOpen(false);
          navigate(nextPathForProfile(profile), { state: { email: trimmed } });
        }}
        onResend={async () => {
          await requestCode(email.trim());
        }}
      />
    </AuthFrame>
  );
};

export default WelcomePage;
