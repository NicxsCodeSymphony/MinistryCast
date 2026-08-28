import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Modal from "../components/modals/Modal";

const LENGTH = 6;

type OtpModalProps = {
  open: boolean;
  email: string;
  onClose: () => void;
  onVerified: () => void;
};

export default function OtpModal({
  open,
  email,
  onClose,
  onVerified,
}: OtpModalProps) {
  const titleId = useId();
  const descId = useId();
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(""));
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    setDigits(Array(LENGTH).fill(""));
    setError("");
    setResent(false);
    const id = window.setTimeout(() => inputs.current[0]?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  const applyValue = (next: string[]) => {
    setDigits(next);
    setError("");
    if (next.every((d) => d !== "")) {
      onVerified();
    }
  };

  const handleChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      applyValue(digits.map((d, i) => (i === index ? "" : d)));
      return;
    }
    if (cleaned.length > 1) {
      const next = [...digits];
      cleaned
        .slice(0, LENGTH - index)
        .split("")
        .forEach((char, offset) => {
          next[index + offset] = char;
        });
      applyValue(next);
      const focusAt = Math.min(index + cleaned.length, LENGTH - 1);
      inputs.current[focusAt]?.focus();
      return;
    }
    const next = digits.map((d, i) => (i === index ? cleaned : d));
    applyValue(next);
    if (index < LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const next = digits.map((d, i) => (i === index - 1 ? "" : d));
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < LENGTH - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (digits.every((d) => d !== "")) onVerified();
      else setError("Enter all 6 digits to continue.");
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    const next = Array(LENGTH)
      .fill("")
      .map((_, i) => pasted[i] ?? "");
    applyValue(next);
    inputs.current[Math.min(pasted.length, LENGTH) - 1]?.focus();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descId}
      panelClassName="w-full max-w-md rounded-2xl"
      backdropClassName="bg-black/70 backdrop-blur-md"
    >
      <div className="p-8">
        <p className="text-[10px] font-bold tracking-[0.2em] text-[#4FACFE]">
          VERIFY EMAIL
        </p>
        <h2
          id={titleId}
          className="mt-3 text-2xl font-bold tracking-tight text-[#E2E8F0]"
        >
          Enter the 6-digit code
        </h2>
        <p id={descId} className="mt-2 text-sm text-white/50 leading-relaxed">
          We sent a code to{" "}
          <span className="text-[#E2E8F0] font-medium">{email}</span>
        </p>

        <div className="mt-8 flex justify-between gap-2">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(node) => {
                inputs.current[index] = node;
              }}
              value={digit}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              onFocus={(event) => event.target.select()}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={1}
              aria-label={`Digit ${index + 1}`}
              className="w-11 h-14 sm:w-12 sm:h-16 rounded-[8px] border border-white/10 bg-white/10 text-center text-xl font-semibold text-[#E2E8F0] outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]/40"
            />
          ))}
        </div>

        {error ? (
          <p className="mt-4 text-sm text-[#ffb4ab]">{error}</p>
        ) : null}

        <button
          type="button"
          onClick={() => {
            if (digits.some((d) => !d)) {
              setError("Enter all 6 digits to continue.");
              return;
            }
            onVerified();
          }}
          className="mt-8 w-full min-h-[56px] bg-[#4F46E5] rounded-[8px] text-white font-semibold text-[16px] hover:brightness-110 active:scale-[0.99] transition-all"
        >
          Verify code
        </button>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white/70 transition-colors"
          >
            Use a different email
          </button>
          <button
            type="button"
            onClick={() => {
              setDigits(Array(LENGTH).fill(""));
              setError("");
              setResent(true);
              inputs.current[0]?.focus();
            }}
            className="text-[#4FACFE] hover:underline"
          >
            {resent ? "Code resent" : "Resend code"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
