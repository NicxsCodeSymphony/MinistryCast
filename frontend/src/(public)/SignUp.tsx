import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BuildingIcon,
  MinistryCastIcon,
  PersonIcon,
  UpArrowIcon,
} from "../components/icons";
import AuthFrame, { AUTH_EMAIL_KEY } from "./AuthFrame";

type SignUpState = {
  email?: string;
};

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const passedEmail = (location.state as SignUpState | null)?.email;
  const email =
    passedEmail?.trim() || sessionStorage.getItem(AUTH_EMAIL_KEY) || "";

  const [name, setName] = useState("");
  const [churchName, setChurchName] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!email) navigate("/", { replace: true });
  }, [email, navigate]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !churchName.trim()) {
      setError("Enter your name and church name to continue.");
      return;
    }
    setError("");
    setSubmitted(true);
  };

  if (!email) return null;

  return (
    <AuthFrame>
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
              Thanks {name.trim()}. {churchName.trim()} is in the review queue.
              We’ll email {email} when your ministry is approved.
            </p>
          </div>
          <div className="mt-6 w-full max-w-[448px] border border-white/10 bg-[#191922] rounded-[8px] p-5 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#E9C349] animate-pulse" />
              <p className="text-sm text-[#E2E8F0] font-medium">
                Awaiting admin approval
              </p>
            </div>
            <p className="mt-3 text-xs text-white/40 leading-relaxed">
              You can close this window. Production tools stay locked until your
              church is activated.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex min-h-[48px] items-center text-sm text-[#4FACFE] hover:underline"
            >
              Back to sign in
            </Link>
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
              Verified as {email}. Enter your name and church so we can review
              your workspace.
            </p>
          </div>

          <form
            className="mt-6 w-full max-w-[448px] border border-white/10 bg-[#191922] rounded-[8px] p-5 sm:p-8"
            onSubmit={handleSubmit}
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
                    if (error) setError("");
                  }}
                />
              </div>
            </label>

            {error ? (
              <p className="mt-3 text-sm text-[#ffb4ab]">{error}</p>
            ) : null}

            <button
              type="submit"
              className="mt-6 w-full min-h-[56px] sm:min-h-[65px] bg-[#4F46E5] rounded-[8px] flex items-center justify-center gap-2 focus:outline-none hover:brightness-110 active:scale-[0.99] transition-all"
            >
              <UpArrowIcon />
              <h5 className="text-white font-semibold text-[16px]">
                Submit for approval
              </h5>
            </button>

            <p className="mt-4 text-center text-xs text-white/40">
              <Link to="/" className="text-[#4FACFE] hover:underline">
                Use a different email
              </Link>
            </p>
          </form>
        </>
      )}
    </AuthFrame>
  );
}
