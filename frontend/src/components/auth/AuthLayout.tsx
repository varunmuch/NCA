import { signInWithGoogle } from "@/app/auth-actions";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function AuthLayout({
  title,
  subtitle,
  children,
}: AuthLayoutProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-canvas px-4 py-10 sm:justify-center">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/neocity-knight-mark.png" alt="" width={40} height={40} className="dark:rounded-full dark:bg-[#f7f7f5] dark:p-0.5 size-10 object-contain" />
          <div className="leading-tight">
            <p className="text-xs font-medium text-ink-muted">NeoCity Academy</p>
            <p className="font-display text-lg font-semibold text-ink">Career Explorer</p>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-7 sm:p-8">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight text-ink">{title}</h1>
          <p className="mt-2 leading-relaxed text-ink-muted">{subtitle}</p>
          {children}
        </div>

        <p className="mt-6 text-center text-sm leading-relaxed text-ink-muted">
          Explore careers, talk with an AI counselor, and make a plan for this year.
        </p>
      </div>
    </main>
  );
}


export function GoogleButton({
  label,
}: {
  label: string;
}) {
  return (
    <form
      className="mt-7"
      action={signInWithGoogle}
    >
      <button
        type="submit"
        className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-surface px-5 text-base font-semibold text-ink transition-colors hover:bg-surface-2"
      >
        <GoogleIcon />

        {label}
      </button>
    </form>
  );
}


export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-sm font-medium text-ink-soft">
      <span className="h-px flex-1 bg-line" />
      or use your email
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}


function GoogleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.31 2.98-7.37Z"
      />

      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.89 6.62-2.4l-3.23-2.51c-.9.6-2.04.95-3.39.95-2.61 0-4.82-1.76-5.61-4.13H3.05v2.59A10 10 0 0 0 12 22Z"
      />

      <path
        fill="#FBBC05"
        d="M6.39 13.91A6.04 6.04 0 0 1 6.08 12c0-.66.11-1.31.31-1.91V7.5H3.05A10 10 0 0 0 2 12c0 1.61.38 3.14 1.05 4.5l3.34-2.59Z"
      />

      <path
        fill="#EA4335"
        d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.96 2.97 14.7 2 12 2a10 10 0 0 0-8.95 5.5l3.34 2.59C7.18 7.72 9.39 5.96 12 5.96Z"
      />
    </svg>
  );
}
