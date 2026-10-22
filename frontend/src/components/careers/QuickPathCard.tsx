"use client";

import { useEffect, useState } from "react";
import { Award, BookOpen, Check, Clock, GraduationCap, School, Wallet, X } from "lucide-react";

import { Skeleton } from "@/components/ui/Feedback";
import { api } from "@/lib/api";
import { surveyNote } from "@/lib/education";
import type { QuickPath, QuickPathCollege } from "@/types/cie";

function dollars(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function CollegeLine({ label, college }: { label: string; college: QuickPathCollege }) {
  const facts = [college.city, college.net_price ? `${dollars(college.net_price)}/yr after aid` : "", college.graduation_rate != null ? `${college.graduation_rate}% graduate` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      <p className="font-semibold text-ink">
        {college.url ? (
          <a href={college.url} target="_blank" rel="noreferrer" className="hover:underline">
            {college.name}
          </a>
        ) : (
          college.name
        )}
      </p>
      <p className="text-sm text-ink-muted">{facts}</p>
    </li>
  );
}

/**
 * "This career in 30 seconds": pay, schooling, what you'd do, and the first
 * class, college and certification. Built by code from official data, so it
 * appears instantly. "Is this you?" lets a student react to real tasks.
 */
export function QuickPathCard({ slug, initial, title = "In 30 seconds" }: { slug: string; initial?: QuickPath | null; title?: string }) {
  const [quick, setQuick] = useState<QuickPath | null>(initial ?? null);
  const [failed, setFailed] = useState(false);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (initial) {
      return;
    }

    let active = true;
    api
      .careerQuickPath(slug)
      .then((data) => active && setQuick(data))
      .catch(() => active && setFailed(true));

    return () => {
      active = false;
    };
  }, [slug, initial]);

  if (failed) {
    return null;
  }

  if (!quick) {
    return (
      <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-6" role="status" aria-label="Loading">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const note = surveyNote(quick.education, quick.education_survey?.levels, quick.education_survey?.small_sample);
  const yes = Object.values(answers).filter(Boolean).length;
  const answered = Object.keys(answers).length;

  return (
    <section aria-labelledby={`quick-${slug}`} className="rounded-[var(--radius-card)] border border-primary/25 bg-surface p-6 shadow-[var(--shadow-card)] sm:p-7">
      <div className="flex items-center gap-2 text-primary">
        <Clock aria-hidden className="size-4" />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <h2 id={`quick-${slug}`} className="mt-1 text-xl font-bold text-ink">
        {quick.title}
      </h2>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        {quick.pay_median ? (
          <div className="flex gap-3">
            <Wallet aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Typical pay</dt>
              <dd className="font-semibold text-ink">
                {dollars(quick.pay_median)} a year
                {quick.pay_median_florida ? <span className="font-normal text-ink-muted"> ({dollars(quick.pay_median_florida)} in Florida)</span> : null}
              </dd>
            </div>
          </div>
        ) : null}
        {quick.education && (
          <div className="flex gap-3">
            <GraduationCap aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">School to start</dt>
              <dd className="font-semibold text-ink">{quick.education}</dd>
              {note && <dd className="text-sm text-ink-muted">{note}</dd>}
            </div>
          </div>
        )}
      </dl>

      {quick.tasks.length > 0 && (
        <div className="mt-6 rounded-2xl bg-surface-2 p-4">
          <h3 className="font-semibold text-ink">Is this you? You&apos;d spend time doing things like:</h3>
          <ul className="mt-3 space-y-2.5">
            {quick.tasks.map((task, index) => (
              <li key={task} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[15px] text-ink">{task}</span>
                <span className="flex gap-1.5">
                  {[
                    { value: true, label: "Sounds like me", icon: Check },
                    { value: false, label: "Not for me", icon: X },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={answers[index] === option.value}
                      onClick={() => setAnswers((current) => ({ ...current, [index]: option.value }))}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                        answers[index] === option.value
                          ? option.value
                            ? "border-accent bg-accent text-on-accent"
                            : "border-ink-soft bg-ink-soft text-surface"
                          : "border-line-strong bg-surface text-ink-muted hover:text-ink"
                      }`}
                    >
                      <option.icon aria-hidden className="size-3.5" />
                      {option.label}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {answered === quick.tasks.length && (
            <p className="mt-3 text-sm font-semibold text-ink" role="status">
              {yes === answered
                ? "All of these sound like you. This career is worth a close look."
                : yes === 0
                  ? "None of these clicked. That's useful to know. Try a related career."
                  : `${yes} of ${answered} sound like you. Worth exploring more.`}
            </p>
          )}
        </div>
      )}

      <ul className="mt-6 grid gap-5 sm:grid-cols-2">
        {quick.courses.length > 0 && (
          <li className="flex gap-3">
            <BookOpen aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Classes to take</span>
              <p className="text-ink">{quick.courses.join(", ")}</p>
            </div>
          </li>
        )}
        {quick.certification && (
          <li className="flex gap-3">
            <Award aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">A first certification</span>
              <p className="font-semibold text-ink">
                {quick.certification.url ? (
                  <a href={quick.certification.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {quick.certification.name}
                  </a>
                ) : (
                  quick.certification.name
                )}
              </p>
              <p className="text-sm text-ink-muted">
                {quick.certification.organization}
                {quick.certification.beginner_friendly ? " · no degree needed" : ""}
              </p>
            </div>
          </li>
        )}
        {(quick.university || quick.state_college) && (
          <li className="flex gap-3 sm:col-span-2">
            <School aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
            <ul className="grid flex-1 gap-4 sm:grid-cols-2">
              {quick.university && <CollegeLine label="University near you" college={quick.university} />}
              {quick.state_college && <CollegeLine label="Or start at a state college" college={quick.state_college} />}
            </ul>
          </li>
        )}
      </ul>

      <p className="mt-6 text-xs text-ink-muted">
        From the Bureau of Labor Statistics, O*NET, the College Board, College Scorecard and CareerOneStop.
      </p>
    </section>
  );
}
