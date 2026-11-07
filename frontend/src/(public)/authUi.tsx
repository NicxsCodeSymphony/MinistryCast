/**
 * Shared auth form primitives: one heading block, one field style, one
 * submit button, so Welcome / Register / Forgot / Reset / Sign-up read as
 * a single system in light and dark.
 */
import type { FormHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import Icon from "../components/Icon";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function AuthHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      {eyebrow ? (
        <p className="text-[12px] font-medium text-primary">{eyebrow}</p>
      ) : null}
      <h2 className="mt-1.5 text-[28px] sm:text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] text-on-surface">
        {title}
      </h2>
      {children ? (
        <p className="mt-3 text-[14px] leading-relaxed text-on-surface-variant max-w-[420px]">
          {children}
        </p>
      ) : null}
    </div>
  );
}

/** Bordered form surface (one per screen). */
export function AuthCard({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      noValidate
      className={cx(
        "mt-8 w-full",
        className,
      )}
      {...rest}
    >
      {children}
    </form>
  );
}

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: string;
  /** Right side of the label row (e.g. a "Forgot password?" link). */
  aside?: ReactNode;
};

/** Labeled input with an optional leading icon. */
export function AuthField({ label, icon, aside, className, id, ...input }: AuthFieldProps) {
  const fieldId = id ?? `auth-${String(input.name || label).toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className={cx("block", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={fieldId} className="text-[12px] font-medium text-on-surface-variant">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        {icon ? (
          <Icon
            name={icon}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-outline"
          />
        ) : null}
        <input
          id={fieldId}
          className={cx(
            "ui-input w-full !h-11 !rounded-[10px] !px-3 text-[14px]",
            icon ? "!pl-9" : "",
          )}
          {...input}
        />
      </div>
    </div>
  );
}

/** Inline error slot; reserves its line so the form never jumps. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[20px] mt-2" aria-live="polite">
      {children ? (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] leading-5 text-error">
          <Icon name="error" className="mt-[3px] text-[14px] shrink-0" />
          <span>{children}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Hairline "or" divider between primary and alternative sign-in. */
export function AuthDivider({ children = "or" }: { children?: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[12px] text-outline" role="separator">
      <span className="h-px flex-1 bg-white/10" />
      {children}
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

export function AuthSubmit({
  children,
  disabled,
  testId,
  icon = "arrow_forward",
}: {
  children: ReactNode;
  disabled?: boolean;
  testId?: string;
  icon?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      data-testid={testId}
      className="ui-btn ui-btn-primary w-full !h-11 !rounded-[10px] justify-center text-[14px] font-medium"
    >
      {children}
      <Icon name={icon} className="text-[15px]" />
    </button>
  );
}

export function AuthFootnote({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-[13px] text-on-surface-variant">{children}</p>;
}
