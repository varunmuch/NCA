import type { ComponentProps, ReactNode } from "react";

export function Card({
  className = "",
  children,
  ...props
}: ComponentProps<"div">) {
  // Let callers override the default surface and border colors.
  const background = /(^|\s)bg-/.test(className) ? "" : "bg-surface";
  const border = /(^|\s)border-(?!0|2|t|b|l|r|x|y|dashed)[a-z]/.test(className) ? "" : "border-line";

  return (
    <div
      className={`rounded-[var(--radius-card)] border ${border} ${background} shadow-[var(--shadow-card)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  action,
  icon,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-softer text-primary">
            {icon}
          </span>
        )}
        <div>
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {eyebrow}
            </p>
          )}
          <h2 className="text-lg font-bold leading-snug text-ink">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display mt-1 text-[2rem] font-semibold leading-[1.15] text-ink sm:text-[2.5rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-base leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

type Tone = "neutral" | "primary" | "accent" | "warm" | "sun";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-muted",
  primary: "bg-primary-soft text-primary-ink",
  accent: "bg-accent-soft text-accent-ink",
  warm: "bg-warm-soft text-warm-ink",
  sun: "bg-sun-soft text-sun-ink",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
