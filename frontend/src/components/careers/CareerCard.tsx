"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  ChefHat,
  Cpu,
  DraftingCompass,
  FlaskConical,
  GraduationCap,
  HeartPulse,
  Leaf,
  Palette,
  Scale,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { CareerSummary } from "@/types/cie";

type FamilyStyle = { icon: LucideIcon; tile: string };

// Four calm tones shared across eleven families keeps the page from
// turning into a rainbow.
const FAMILY_STYLES: Record<string, FamilyStyle> = {
  technology: { icon: Cpu, tile: "bg-primary-soft text-primary" },
  engineering: { icon: DraftingCompass, tile: "bg-primary-soft text-primary" },
  science: { icon: FlaskConical, tile: "bg-accent-soft text-accent-ink" },
  environment: { icon: Leaf, tile: "bg-accent-soft text-accent-ink" },
  health: { icon: HeartPulse, tile: "bg-warm-soft text-warm-ink" },
  arts: { icon: Palette, tile: "bg-warm-soft text-warm-ink" },
  education: { icon: GraduationCap, tile: "bg-sun-soft text-sun-ink" },
  hospitality: { icon: ChefHat, tile: "bg-sun-soft text-sun-ink" },
  business: { icon: Briefcase, tile: "bg-surface-3 text-ink" },
  law: { icon: Scale, tile: "bg-surface-3 text-ink" },
  trades: { icon: Wrench, tile: "bg-surface-3 text-ink" },
};

export function familyStyle(family: string): FamilyStyle {
  return FAMILY_STYLES[family] ?? { icon: Briefcase, tile: "bg-surface-3 text-ink" };
}

export function FamilyIcon({ family, size = "md" }: { family: string; size?: "sm" | "md" | "lg" }) {
  const { icon: Icon, tile } = familyStyle(family);
  const box = size === "lg" ? "size-14 rounded-2xl" : size === "sm" ? "size-8 rounded-lg" : "size-10 rounded-xl";
  const glyph = size === "lg" ? "size-7" : size === "sm" ? "size-4" : "size-5";

  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center ${box} ${tile}`}>
      <Icon className={glyph} />
    </span>
  );
}

export function SaveCareerButton({
  slug,
  title,
  saved: initialSaved,
  onChange,
  variant = "icon",
}: {
  slug: string;
  title: string;
  saved: boolean;
  onChange?: (saved: boolean) => void;
  variant?: "icon" | "button";
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function toggle() {
    const next = !saved;
    setBusy(true);
    setSaved(next);

    try {
      await api.setCareerSaved(slug, next);
      onChange?.(next);
      toast(next ? `Saved ${title}` : `Removed ${title} from saved careers`);
    } catch (error) {
      setSaved(!next);
      toast(error instanceof Error ? error.message : "Couldn't update saved careers.", "error");
    } finally {
      setBusy(false);
    }
  }

  const Icon = saved ? BookmarkCheck : Bookmark;

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        className={`inline-flex h-11 items-center gap-2 rounded-full border px-5 text-[15px] font-semibold transition-colors disabled:opacity-60 ${
          saved
            ? "border-accent/30 bg-accent-softer text-accent-ink"
            : "border-line-strong bg-surface text-ink hover:bg-surface-2"
        }`}
      >
        <Icon aria-hidden className="size-4" />
        {saved ? "Saved" : "Save career"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from saved careers` : `Save ${title}`}
      title={saved ? "Saved" : "Save"}
      className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-60 ${
        saved ? "bg-accent-soft text-accent-ink" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
      }`}
    >
      <Icon aria-hidden className="size-[18px]" />
    </button>
  );
}

// Bold the words of `text` that start with any of the query's words.
function Highlight({ text, query }: { text: string; query?: string }) {
  const terms = (query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3)
    .map((term) => (term.length > 4 && term.endsWith("s") ? term.slice(0, -1) : term));

  if (!terms.length) {
    return <>{text}</>;
  }

  return (
    <>
      {text.split(/(\s+)/).map((word, index) => {
        const bare = word.toLowerCase().replace(/[^a-z0-9]/g, "");
        return bare && terms.some((term) => bare.startsWith(term)) ? (
          <mark key={index} className="rounded-sm bg-sun-soft px-0.5 text-ink">
            {word}
          </mark>
        ) : (
          word
        );
      })}
    </>
  );
}

export function CareerCard({
  career,
  reason,
  query,
  compareSelected,
  onCompareToggle,
}: {
  career: CareerSummary;
  reason?: string;
  query?: string;
  compareSelected?: boolean;
  onCompareToggle?: () => void;
}) {
  const hint = query ? career.match_hint : null;

  return (
    <article className="group relative flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-raised)]">
      <div className="flex items-start justify-between gap-3">
        <FamilyIcon family={career.family} />
        <SaveCareerButton slug={career.slug} title={career.title} saved={Boolean(career.saved)} />
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
        {career.family_label}
      </p>
      <h3 className="mt-1 text-[17px] font-bold leading-snug text-ink">
        <Link
          href={`/explore/${career.slug}`}
          className="after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none"
        >
          <Highlight text={career.title} query={query} />
        </Link>
      </h3>

      {reason ? (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">
          <span className="font-semibold text-accent-ink">Why it might fit: </span>
          {reason}
        </p>
      ) : (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{career.description}</p>
      )}

      {hint && (
        <p className="mt-3 line-clamp-2 border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">{hint.field}: </span>
          <Highlight text={hint.text} query={query} />
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div className="flex flex-wrap gap-1.5">
          {career.subjects.slice(0, 2).map((subject) => (
            <span key={subject} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-muted">
              {subject}
            </span>
          ))}
        </div>
        {onCompareToggle ? (
          <label className="relative z-10 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <input
              type="checkbox"
              checked={Boolean(compareSelected)}
              onChange={onCompareToggle}
              className="size-4 accent-[var(--color-primary)]"
            />
            Compare
          </label>
        ) : (
          <ArrowRight
            aria-hidden
            className="size-4 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          />
        )}
      </div>
    </article>
  );
}
