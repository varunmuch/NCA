"use client";

import { useActionState, useState } from "react";

import {
  type AuthFormState,
  linkGoogleWithPassword,
  requestPasswordReset,
  resetPassword,
  signInWithPassword,
  signUpWithPassword,
} from "@/app/auth-actions";


const inputClass =
  "mt-1.5 h-12 w-full rounded-[var(--radius-input)] border border-line-strong bg-surface px-4 text-ink placeholder:text-ink-soft transition-[border-color,box-shadow] hover:border-ink-soft focus:border-primary focus:outline-none focus:shadow-[var(--shadow-focus)]";

const labelClass = "text-sm font-semibold text-ink";

const submitClass =
  "h-12 w-full rounded-full bg-primary px-5 text-base font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60";


function FormError({
  message,
}: {
  message?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="alert"
      className="rounded-xl border border-danger/20 bg-danger-soft/60 px-4 py-3 text-sm font-medium text-ink"
    >
      {message}
    </p>
  );
}


function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className={labelClass}
        >
          {label}
        </label>

        <button
          type="button"
          onClick={() => setVisible((previous) => !previous)}
          className="text-xs font-semibold text-primary hover:underline"
          aria-controls={id}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>

      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        className={inputClass}
      />

      {hint && (
        <p className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}


export function LoginForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signInWithPassword,
    {}
  );

  return (
    <form
      action={formAction}
      className="space-y-4"
    >
      <FormError message={state.error} />

      <div>
        <label
          htmlFor="login-email"
          className={labelClass}
        >
          Email
        </label>

        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>

      <PasswordInput
        id="login-password"
        name="password"
        label="Password"
        autoComplete="current-password"
      />

      <p className="-mt-1 text-right text-sm">
        <a href="/forgot-password" className="font-semibold text-primary hover:underline">
          Forgot your password?
        </a>
      </p>

      <button
        type="submit"
        disabled={pending}
        className={submitClass}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}


export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signUpWithPassword,
    {}
  );

  return (
    <form
      action={formAction}
      className="space-y-4"
    >
      <FormError message={state.error} />

      <div>
        <label
          htmlFor="signup-name"
          className={labelClass}
        >
          Your name
        </label>

        <input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={100}
          defaultValue={state.name}
          placeholder="What should we call you?"
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="signup-email"
          className={labelClass}
        >
          Email
        </label>

        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>

      <PasswordInput
        id="signup-password"
        name="password"
        label="Create a password"
        autoComplete="new-password"
        hint="At least 8 characters. Pick something you'll remember!"
      />

      <PasswordInput
        id="signup-confirm"
        name="confirmPassword"
        label="Type it again"
        autoComplete="new-password"
      />

      <button
        type="submit"
        disabled={pending}
        className={submitClass}
      >
        {pending ? "Creating your account…" : "Create my account"}
      </button>
    </form>
  );
}


export function LinkAccountForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    linkGoogleWithPassword,
    {}
  );

  return (
    <form
      action={formAction}
      className="space-y-4"
    >
      <FormError message={state.error} />

      <div>
        <p className={labelClass}>Email</p>
        <p className="mt-1.5 rounded-[var(--radius-input)] bg-surface-2 px-4 py-3 text-ink">{email}</p>
        {/* Lets password managers fill the right saved password. */}
        <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      </div>

      <PasswordInput
        id="link-password"
        name="password"
        label="Your password for this account"
        autoComplete="current-password"
      />

      <button
        type="submit"
        disabled={pending}
        className={submitClass}
      >
        {pending ? "Connecting…" : "Connect and continue"}
      </button>
    </form>
  );
}


export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    {}
  );

  if (state.done) {
    return (
      <p
        role="status"
        className="rounded-xl bg-accent-softer px-4 py-3 text-sm leading-relaxed text-accent-ink"
      >
        If <strong>{state.email}</strong> has an account, we just sent it a link to choose a new password. It works for 30
        minutes. Check your spam folder if you don&apos;t see it.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4"
    >
      <FormError message={state.error} />

      <div>
        <label
          htmlFor="forgot-email"
          className={labelClass}
        >
          Email
        </label>

        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className={submitClass}
      >
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}


export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    resetPassword,
    {}
  );

  return (
    <form
      action={formAction}
      className="space-y-4"
    >
      <FormError message={state.error} />

      <input type="hidden" name="token" value={token} />

      <PasswordInput
        id="reset-password"
        name="password"
        label="New password"
        autoComplete="new-password"
        hint="At least 8 characters."
      />

      <PasswordInput
        id="reset-confirm"
        name="confirmPassword"
        label="Type it again"
        autoComplete="new-password"
      />

      <button
        type="submit"
        disabled={pending}
        className={submitClass}
      >
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
