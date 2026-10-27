"use client";

import { useId, useState } from "react";
import { ChevronDown, ExternalLink, GraduationCap, Info } from "lucide-react";

import type { CollegeCard, CollegeFit, CollegeScholarships } from "@/types/cie";

const LABEL_TONE: Record<CollegeFit["label"], string> = {
  Reach: "bg-pink-soft text-pink",
  Match: "bg-primary-soft text-primary-ink",
  Likely: "bg-accent-soft text-accent-ink",
};

const RING_TONE: Record<CollegeFit["label"], string> = {
  Reach: "var(--color-pink)",
  Match: "var(--color-primary)",
  Likely: "var(--color-accent)",
};

/** The "i" next to a chance: hover, focus or tap shows how the number was made. */
export function InfoTip({ label, lines }: { label: string; lines: string[] }) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex size-5 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Info aria-hidden className="size-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute right-0 top-6 z-30 w-72 rounded-xl border border-line bg-surface p-3 text-left text-xs font-normal leading-relaxed text-ink shadow-[var(--shadow-raised)] sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
        >
          <span className="mb-1 block font-semibold">How we estimated this</span>
          {lines.map((line) => (
            <span key={line} className="mt-1 block text-ink-muted">
              {line}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** Chance ring + label + the "i" explanation. */
export function ChanceBadge({ fit, college }: { fit: CollegeFit; college: string }) {
  if (fit.chance == null) {
    return (
      <span className="flex items-center gap-1.5">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${LABEL_TONE[fit.label]}`}>Open admission</span>
        <InfoTip label={`About admission at ${college}`} lines={fit.explanation} />
      </span>
    );
  }

  const value = Math.max(0, Math.min(100, fit.chance));

  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="relative flex size-12 shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${RING_TONE[fit.label]} ${value * 3.6}deg, var(--color-surface-3) 0deg)` }}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-surface text-[13px] font-bold tabular-nums text-ink">
          {value}%
        </span>
      </span>
      <span className="flex flex-col items-start gap-0.5">
        <span className="flex items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LABEL_TONE[fit.label]}`}>{fit.label}</span>
          <InfoTip label={`How we estimated your chance at ${college}`} lines={fit.explanation} />
        </span>
        <span className="text-[11px] text-ink-soft">
          <span className="sr-only">Estimated admission chance {value}%. </span>est. chance
        </span>
      </span>
    </span>
  );
}

function money(value: number | null) {
  return value == null ? null : `$${Math.round(value).toLocaleString("en-US")}`;
}

export function ScholarshipsToggle({ scholarships }: { scholarships: CollegeScholarships }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full bg-sun-soft px-3 py-1 text-xs font-semibold text-sun-ink hover:brightness-95"
      >
        {scholarships.awards.length} scholarship{scholarships.awards.length === 1 ? "" : "s"} to look at
        <ChevronDown aria-hidden className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-line bg-surface-2/60 p-3 text-sm">
          <ul className="space-y-1.5">
            {scholarships.awards.map((award) => (
              <li key={award.name}>
                <span className="font-semibold text-ink">{award.name}</span>
                <span className="text-ink-muted"> · {award.for}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">How to be considered: {scholarships.how}</p>
          <a href={scholarships.page} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            Amounts and deadlines on the official page <ExternalLink aria-hidden className="size-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function CollegeRow({ college }: { college: CollegeCard }) {
  const admissions = college.admissions || {};
  const facts = [
    `${college.city}`,
    `${college.ownership} ${college.kind}`,
    admissions.admit_rate != null ? `admits ${admissions.admit_rate}%` : null,
    admissions.sat_25 && admissions.sat_75 ? `SAT ${admissions.sat_25}-${admissions.sat_75}` : null,
    admissions.act_25 && admissions.act_75 ? `ACT ${admissions.act_25}-${admissions.act_75}` : null,
    college.net_price != null ? `avg net price ${money(college.net_price)}/yr` : null,
    college.graduation_rate != null ? `${college.graduation_rate}% graduate` : null,
  ].filter(Boolean);

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <a href={college.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink hover:text-primary hover:underline">
            {college.name}
            <ExternalLink aria-hidden className="size-3.5 text-ink-soft" />
          </a>
          <p className="mt-0.5 text-xs text-ink-muted">{facts.join(" · ")}</p>
          {college.programs.length > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              <GraduationCap aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
              {college.programs.map((program) => `${program.credential} in ${program.title}`).join("; ")}
            </p>
          )}
          {college.why && <p className="mt-1.5 text-sm leading-relaxed text-ink">{college.why}</p>}
        </div>
        <ChanceBadge fit={college.fit} college={college.name} />
      </div>

      {college.scholarships && <ScholarshipsToggle scholarships={college.scholarships} />}
    </li>
  );
}

export function CollegeList({ colleges, note = true }: { colleges: CollegeCard[]; note?: boolean }) {
  if (colleges.length === 0) {
    return <p className="text-sm text-ink-muted">No Florida colleges with a bachelor&apos;s in this major were found.</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {colleges.map((college) => (
          <CollegeRow key={college.id} college={college} />
        ))}
      </ul>
      {note && (
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          Chances are rough estimates from College Scorecard admissions data, your SAT/ACT and the GPA from your transcript. Reach under 35%, match 35-69%, likely 70% and up. Scholarships were collected from each college&apos;s website.
        </p>
      )}
    </div>
  );
}
