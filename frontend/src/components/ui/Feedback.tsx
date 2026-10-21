import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, RotateCcw } from "lucide-react";

import { Button } from "./Button";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="rounded-[var(--radius-card)] border border-line bg-surface p-5"
    >
      <Skeleton className="h-5 w-2/5" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton
            key={index}
            className={`h-3.5 ${index === lines - 1 ? "w-3/5" : "w-full"}`}
          />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center ${className}`}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-softer text-primary">
        {icon}
      </span>
      <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNotice({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 rounded-[var(--radius-card)] border border-danger/20 bg-danger-soft/60 p-4 text-sm text-ink sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
        <p>{message}</p>
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          icon={<RotateCcw aria-hidden className="size-3.5" />}
        >
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineNote({
  tone = "info",
  children,
  className = "",
}: {
  tone?: "info" | "success";
  children: ReactNode;
  className?: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : Info;

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-relaxed ${
        tone === "success" ? "bg-accent-softer text-accent-ink" : "bg-primary-softer text-primary-ink"
      } ${className}`}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function ThinkingDots({ label = "Thinking" }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden
          className="thinking-dot size-1.5 rounded-full bg-primary"
          style={{ animationDelay: `${index * 0.16}s` }}
        />
      ))}
    </span>
  );
}
