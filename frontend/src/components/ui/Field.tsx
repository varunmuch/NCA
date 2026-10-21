"use client";

import { useId, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";

const inputBase =
  "w-full rounded-[var(--radius-input)] border border-line-strong bg-surface px-3.5 text-ink placeholder:text-ink-soft transition-[border-color,box-shadow] duration-150 hover:border-ink-soft focus:border-primary focus:outline-none focus:shadow-[var(--shadow-focus)] disabled:bg-surface-2";

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${inputBase} h-11 ${className}`} {...props} />;
}

export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`${inputBase} py-2.5 leading-relaxed ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }: ComponentProps<"select">) {
  return (
    <select className={`${inputBase} h-11 pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

/**
 * Free-text list input: type and press Enter (or comma) to add a chip.
 */
export function ChipInput({
  id,
  value,
  onChange,
  placeholder,
  suggestions = [],
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const generatedId = useId();
  const inputId = id ?? generatedId;

  function add(raw: string) {
    const item = raw.trim().replace(/,$/, "");

    if (item && !value.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
      onChange([...value, item]);
    }

    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
    }

    if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const remaining = suggestions.filter(
    (item) => !value.some((existing) => existing.toLowerCase() === item.toLowerCase())
  );

  return (
    <div>
      <div
        className={`${inputBase} flex min-h-11 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-primary focus-within:shadow-[var(--shadow-focus)]`}
      >
        {value.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pl-3 pr-1.5 text-sm font-medium text-primary-ink"
          >
            {item}
            <button
              type="button"
              onClick={() => onChange(value.filter((existing) => existing !== item))}
              aria-label={`Remove ${item}`}
              className="rounded-full p-0.5 hover:bg-white/60"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "Add another…" : placeholder}
          className="h-8 min-w-[8rem] flex-1 bg-transparent px-1.5 text-ink placeholder:text-ink-soft focus:outline-none"
        />
      </div>
      {remaining.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => add(item)}
              className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-muted transition-colors hover:border-primary/40 hover:bg-primary-softer hover:text-primary-ink"
            >
              + {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
