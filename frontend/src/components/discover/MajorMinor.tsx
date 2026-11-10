"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Loader2, Map as MapIcon, Sparkle, Star } from "lucide-react";

import { BrightFuturesCard } from "@/components/college/BrightFuturesCard";
import { CollegeList } from "@/components/college/CollegeList";
import { Button, ButtonLink } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { AcademicAnswers, MajorMinorResult, QuizField, QuizFollowUps } from "@/types/cie";

const OPTION_TONES = ["bg-primary", "bg-pink", "bg-teal"];

/** Three major + minor sets, each with its colleges and scholarships. */
export function MajorMinorResults({ result }: { result: MajorMinorResult }) {
  const [active, setActive] = useState(0);
  const option = result.options[active];

  if (!option) {
    return null;
  }

  const sources = [
    result.based_on.transcript && "your transcript",
    result.based_on.resume && "your resume",
    result.based_on.quiz && "your quiz",
    result.based_on.tests && "your test scores",
    result.based_on.preference && `your choice (${result.based_on.preference})`,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {result.summary && <p className="max-w-3xl leading-relaxed text-ink">{result.summary}</p>}
      {sources.length > 0 && <p className="text-xs text-ink-muted">Based on {sources.join(", ")}.</p>}

      <div role="tablist" aria-label="Major and minor options" className="grid gap-3 md:grid-cols-3">
        {result.options.map((item, index) => (
          <button
            key={`${item.major.cip4}-${item.minor.cip4}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            className={`relative overflow-hidden rounded-[var(--radius-card)] border p-4 text-left transition-[box-shadow,border-color,transform] ${
              index === active ? "border-transparent shadow-[var(--shadow-raised)] ring-2 ring-primary/40" : "border-line bg-surface hover:-translate-y-0.5 hover:border-primary/25"
            }`}
          >
            <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${OPTION_TONES[index % OPTION_TONES.length]}`} />
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              Option {index + 1}
              {item.preferred && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sun-soft px-2 py-0.5 text-sun-ink">
                  <Star aria-hidden className="size-3" /> Your choice
                </span>
              )}
            </span>
            <span className="mt-2 block text-xs text-ink-muted">Major</span>
            <span className="block font-semibold leading-snug text-ink">{item.major.title}</span>
            <span className="mt-2 block text-xs text-ink-muted">Minor</span>
            <span className="block font-semibold leading-snug text-pink">{item.minor.title}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="space-y-4">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <BookOpen aria-hidden className="size-4" /> Why this major
            </p>
            <p className="mt-1.5 leading-relaxed text-ink">{option.why_major}</p>
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-pink">
              <Sparkle aria-hidden className="size-4" /> Why this minor
            </p>
            <p className="mt-1.5 leading-relaxed text-ink">{option.why_minor}</p>
          </div>

          {option.careers.length > 0 && (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <p className="text-sm font-semibold text-ink">Where this major can lead</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {option.careers.map((career) => (
                  <Link
                    key={career.slug}
                    href={`/explore/${career.slug}`}
                    className="rounded-full border border-teal/30 bg-teal-soft px-3 py-1 text-sm font-medium text-teal hover:border-teal"
                  >
                    {career.title}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <ButtonLink href="/plan?generate=1" icon={<MapIcon aria-hidden className="size-4" />}>
            Build My Path from this
          </ButtonLink>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <p className="font-semibold text-ink">Florida colleges with a bachelor&apos;s in {option.major.title}</p>
          <p className="text-xs text-ink-muted">Your estimated chance at each, and scholarships to look at.</p>
          <div className="mt-1">
            <CollegeList colleges={option.colleges ?? []} />
          </div>
        </div>
      </div>

      {result.bright_futures && <BrightFuturesCard data={result.bright_futures} />}
    </div>
  );
}

function FieldInput({
  field,
  answers,
  setAnswers,
  followUps,
  setFollowUps,
}: {
  field: QuizField;
  answers: AcademicAnswers;
  setAnswers: (next: AcademicAnswers) => void;
  followUps: Record<string, string>;
  setFollowUps: (next: Record<string, string>) => void;
}) {
  const input =
    "w-full rounded-[var(--radius-input)] border border-line-strong bg-surface px-3.5 py-2.5 text-ink placeholder:text-ink-soft focus:border-primary focus:outline-none";

  if (field.kind === "tests") {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="font-medium text-ink">SAT (400-1600)</span>
          <input
            inputMode="numeric"
            className={`${input} mt-1`}
            value={answers.sat ?? ""}
            onChange={(event) => setAnswers({ ...answers, sat: event.target.value.replace(/\D/g, "").slice(0, 4) })}
            placeholder="e.g. 1250"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">ACT (1-36)</span>
          <input
            inputMode="numeric"
            className={`${input} mt-1`}
            value={answers.act ?? ""}
            onChange={(event) => setAnswers({ ...answers, act: event.target.value.replace(/\D/g, "").slice(0, 2) })}
            placeholder="e.g. 27"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">Not yet? When will you take one?</span>
          <select className={`${input} mt-1`} value={answers.test_plan ?? ""} onChange={(event) => setAnswers({ ...answers, test_plan: event.target.value })}>
            <option value="">Choose…</option>
            <option>PSAT this year</option>
            <option>SAT or ACT next year</option>
            <option>Not sure yet</option>
          </select>
        </label>
      </div>
    );
  }

  if (field.kind === "choice") {
    return (
      <div role="radiogroup" aria-label={field.label} className="flex flex-wrap gap-2">
        {field.options.map((option) => {
          const selected = followUps[field.label] === option;

          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setFollowUps({ ...followUps, [field.label]: option })}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                selected ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-surface text-ink hover:border-primary/50 hover:bg-primary-softer"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    );
  }

  const key = field.id as "intended_major" | "service_hours" | "interests";

  return (
    <input
      id={`field-${field.id}`}
      inputMode={field.kind === "number" ? "numeric" : undefined}
      className={input}
      value={(answers[key] as string | undefined) ?? ""}
      onChange={(event) =>
        setAnswers({ ...answers, [key]: field.kind === "number" ? event.target.value.replace(/\D/g, "").slice(0, 4) : event.target.value })
      }
      placeholder={field.id === "intended_major" ? "e.g. Computer Science, Nursing, Business" : field.kind === "number" ? "e.g. 40" : ""}
    />
  );
}

/** Part 6: the quiz looks at the student's records and asks only what's missing. */
export function AboutYouPart({ onBack, onDone }: { onBack: () => void; onDone: (answers: AcademicAnswers) => Promise<void> }) {
  const [data, setData] = useState<QuizFollowUps | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<AcademicAnswers>({});
  const [followUps, setFollowUps] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .quizFollowUps()
      .then((loaded) => {
        setData(loaded);
        const major = loaded.fields.find((field) => field.id === "intended_major");

        if (major && "value" in major && major.value) {
          setAnswers((current) => ({ ...current, intended_major: major.value }));
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Couldn't load the last questions."));
  }, []);

  const knows = data?.knows;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-ink-muted">Part 6 of 6</p>
        <h1 className="font-display mt-1 text-[1.75rem] font-semibold leading-tight text-ink sm:text-[2rem]">A few questions about you</h1>
        <p className="mt-1.5 text-ink-muted">We read your records first, so we only ask what they don&apos;t show. Every question is optional.</p>
      </div>

      {knows && (
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`rounded-full px-3 py-1 ${knows.transcript ? "bg-accent-soft text-accent-ink" : "bg-surface-2 text-ink-muted"}`}>
            {knows.transcript ? `Transcript read${knows.gpa != null ? ` · GPA ${knows.gpa.toFixed(2)}` : ""}` : "No transcript yet"}
          </span>
          <span className={`rounded-full px-3 py-1 ${knows.resume ? "bg-accent-soft text-accent-ink" : "bg-surface-2 text-ink-muted"}`}>
            {knows.resume ? `Resume read${knows.service_hours != null ? ` · ${knows.service_hours} service hours` : ""}` : "No resume yet"}
          </span>
          {(knows.tests.sat || knows.tests.act) && (
            <span className="rounded-full bg-accent-soft px-3 py-1 text-accent-ink">
              {[knows.tests.sat && `SAT ${knows.tests.sat}`, knows.tests.act && `ACT ${knows.tests.act}`].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {!data && !error && (
        <p className="flex items-center gap-2 text-ink-muted" role="status">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Reading your transcript, resume and answers…
        </p>
      )}

      {data && (
        <ol className="space-y-4">
          {data.fields.map((field) => (
            <li key={field.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <label htmlFor={`field-${field.id}`} className="font-semibold text-ink">
                {field.label}
              </label>
              {"hint" in field && field.hint && <p className="mt-0.5 text-sm text-ink-muted">{field.hint}</p>}
              <div className="mt-3">
                <FieldInput field={field} answers={answers} setAnswers={setAnswers} followUps={followUps} setFollowUps={setFollowUps} />
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button
          size="lg"
          loading={busy}
          disabled={!data}
          onClick={async () => {
            setBusy(true);

            try {
              await onDone({ ...answers, follow_ups: followUps });
            } finally {
              setBusy(false);
            }
          }}
          icon={<ArrowRight aria-hidden className="size-[18px]" />}
        >
          {busy ? "Picking your major and minor…" : "See my major and minor"}
        </Button>
      </div>
    </section>
  );
}
