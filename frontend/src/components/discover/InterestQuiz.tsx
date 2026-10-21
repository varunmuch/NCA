"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, MessageCircle, RotateCcw } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { CardSkeleton, ErrorNotice } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { CareerSummary, InterestQuiz as Quiz, InterestQuizAnswers, InterestQuizResult } from "@/types/cie";

// Holland's hexagon order: neighbors are similar, opposites are not.
const HEXAGON = ["Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"];

const PARTS = [
  { key: "activities", title: "Activities", minutes: 3 },
  { key: "tradeoffs", title: "Trade-offs", minutes: 2 },
  { key: "settings", title: "Work setting", minutes: 1 },
  { key: "subjects", title: "Subjects", minutes: 1 },
  { key: "training", title: "Training", minutes: 1 },
] as const;

type Part = (typeof PARTS)[number]["key"];

const ACTIVITIES_PER_PAGE = 6;

const PART_LABELS: Record<string, string> = {
  interests: "Interests",
  setting: "Setting",
  subjects: "Subjects",
  training: "Training",
};

function emptyAnswers(): InterestQuizAnswers {
  return { activities: {}, tradeoffs: {}, settings: [], subjects: [], training: "" };
}

/* ------------------------------------------------------------------ taking */

function Stepper({ part }: { part: Part }) {
  const current = PARTS.findIndex((item) => item.key === part);

  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Quiz parts">
      {PARTS.map((item, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";

        return (
          <li key={item.key} aria-current={state === "current" ? "step" : undefined}>
            <div className={`h-1 rounded-full ${state === "todo" ? "bg-surface-3" : "bg-ink"}`} />
            <p className={`mt-2 hidden text-xs font-semibold sm:block ${state === "todo" ? "text-ink-soft" : "text-ink"}`}>
              {index + 1}. {item.title}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function PartHeader({ number, title, hint }: { number: number; title: string; hint: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink-muted">Part {number} of 5</p>
      <h1 className="font-display mt-1 text-[1.75rem] font-semibold leading-tight text-ink sm:text-[2rem]">{title}</h1>
      <p className="mt-1.5 text-ink-muted">{hint}</p>
    </div>
  );
}

function RatingRow({
  text,
  value,
  scale,
  onChange,
}: {
  text: string;
  value: number | undefined;
  scale: string[];
  onChange: (value: number) => void;
}) {
  return (
    <li className="grid gap-3 border-b border-line py-4 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
      <p className="text-[15px] font-medium leading-snug text-ink">{text}</p>
      <div role="radiogroup" aria-label={text} className="flex items-center gap-1.5">
        {scale.map((label, index) => {
          const option = index + 1;
          const selected = value === option;
          // Bigger at the ends so the direction reads without words.
          const size = ["size-9", "size-8", "size-7", "size-8", "size-9"][index];

          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              onClick={() => onChange(option)}
              className="flex size-10 items-center justify-center rounded-full"
            >
              <span
                className={`${size} rounded-full border-2 transition-colors ${
                  selected
                    ? index < 2
                      ? "border-warm-ink bg-warm-ink"
                      : index === 2
                        ? "border-ink-muted bg-ink-muted"
                        : "border-accent bg-accent"
                    : index < 2
                      ? "border-warm/50 hover:bg-warm-soft"
                      : index === 2
                        ? "border-line-strong hover:bg-surface-2"
                        : "border-accent/50 hover:bg-accent-soft"
                }`}
              />
            </button>
          );
        })}
      </div>
    </li>
  );
}

function ActivitiesPart({
  quiz,
  answers,
  setAnswers,
  page,
  setPage,
  onDone,
  onExit,
}: {
  quiz: Quiz;
  answers: InterestQuizAnswers;
  setAnswers: (next: InterestQuizAnswers) => void;
  page: number;
  setPage: (page: number) => void;
  onDone: () => void;
  onExit: () => void;
}) {
  const items = quiz.activities.items;
  const pages = Math.ceil(items.length / ACTIVITIES_PER_PAGE);
  const shown = items.slice(page * ACTIVITIES_PER_PAGE, (page + 1) * ACTIVITIES_PER_PAGE);
  const complete = shown.every((item) => answers.activities[item.id]);
  const answered = Object.keys(answers.activities).length;

  return (
    <section className="space-y-5">
      <PartHeader number={1} title="How would you feel doing these?" hint="Don't think about whether you're good at it or what it pays. Just: would you enjoy it?" />

      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-5 sm:px-6">
        <div className="hidden justify-end gap-6 border-b border-line py-2.5 text-xs font-semibold text-ink-muted sm:flex">
          <span className="flex w-[230px] justify-between">
            <span>Dislike</span>
            <span>Like</span>
          </span>
        </div>
        <ul>
          {shown.map((item) => (
            <RatingRow
              key={item.id}
              text={item.text}
              value={answers.activities[item.id]}
              scale={quiz.activities.scale}
              onChange={(value) => setAnswers({ ...answers, activities: { ...answers.activities, [item.id]: value } })}
            />
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => (page === 0 ? onExit() : setPage(page - 1))} icon={<ArrowLeft aria-hidden className="size-4" />}>
          Back
        </Button>
        <span className="text-sm text-ink-muted">
          {answered} of {items.length} rated
        </span>
        <Button
          disabled={!complete}
          onClick={() => {
            if (page < pages - 1) {
              setPage(page + 1);
              window.scrollTo({ top: 0 });
            } else {
              onDone();
            }
          }}
          icon={<ArrowRight aria-hidden className="size-4" />}
        >
          Next
        </Button>
      </div>
    </section>
  );
}

function TradeoffsPart({
  quiz,
  answers,
  setAnswers,
  onDone,
  onBack,
}: {
  quiz: Quiz;
  answers: InterestQuizAnswers;
  setAnswers: (next: InterestQuizAnswers) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const firstOpen = quiz.tradeoffs.findIndex((item) => !answers.tradeoffs[item.id]);
  const [index, setIndex] = useState(firstOpen === -1 ? quiz.tradeoffs.length - 1 : firstOpen);
  const item = quiz.tradeoffs[index];
  const chosen = answers.tradeoffs[item.id];

  function choose(key: "a" | "b") {
    setAnswers({ ...answers, tradeoffs: { ...answers.tradeoffs, [item.id]: key } });

    window.setTimeout(() => {
      if (index < quiz.tradeoffs.length - 1) {
        setIndex(index + 1);
      } else {
        onDone();
      }
    }, 180);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        choose("a");
      } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "b") {
        choose("b");
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section className="space-y-5">
      <PartHeader number={2} title="Which would you rather do?" hint="Both might sound good, or neither. Pick the one you'd choose if you had to." />

      <div key={item.id} className="grid items-stretch gap-3 animate-[var(--animate-fade-in)] sm:grid-cols-[1fr_auto_1fr]">
        {(["a", "b"] as const).map((key, position) => (
          <div key={key} className={`contents`}>
            {position === 1 && (
              <span aria-hidden className="flex items-center justify-center text-sm font-semibold text-ink-soft">
                or
              </span>
            )}
            <button
              type="button"
              onClick={() => choose(key)}
              aria-pressed={chosen === key}
              className={`flex min-h-36 flex-col justify-between rounded-[var(--radius-card)] border-2 p-5 text-left transition-colors ${
                chosen === key ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:border-ink-soft"
              }`}
            >
              <span className={`text-xs font-semibold uppercase tracking-[0.12em] ${chosen === key ? "text-white/60" : "text-ink-soft"}`}>
                {key === "a" ? "Option A" : "Option B"}
              </span>
              <span className="mt-4 text-xl font-semibold leading-snug">{item[key].text}</span>
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => (index === 0 ? onBack() : setIndex(index - 1))} icon={<ArrowLeft aria-hidden className="size-4" />}>
          Back
        </Button>
        <span className="text-sm text-ink-muted" aria-live="polite">
          {index + 1} of {quiz.tradeoffs.length}
          <span className="ml-2 hidden text-ink-soft sm:inline">· Use ← or → keys</span>
        </span>
        <span className="w-[72px]" />
      </div>
    </section>
  );
}

function ChoicePart({
  number,
  title,
  hint,
  options,
  selected,
  max,
  onChange,
  onNext,
  onBack,
  layout,
}: {
  number: number;
  title: string;
  hint: string;
  options: { key: string; label: string }[];
  selected: string[];
  max: number;
  onChange: (next: string[]) => void;
  onNext: () => void;
  onBack: () => void;
  layout: "tiles" | "chips";
}) {
  function toggle(key: string) {
    if (selected.includes(key)) {
      onChange(selected.filter((item) => item !== key));
    } else if (selected.length < max) {
      onChange([...selected, key]);
    }
  }

  return (
    <section className="space-y-5">
      <PartHeader number={number} title={title} hint={hint} />

      <div className={layout === "tiles" ? "grid gap-2 sm:grid-cols-2" : "flex flex-wrap gap-2"}>
        {options.map((option) => {
          const on = selected.includes(option.key);
          const full = !on && selected.length >= max;

          return (
            <button
              key={option.key}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={full}
              onClick={() => toggle(option.key)}
              className={`flex items-center gap-3 border text-left transition-colors disabled:opacity-40 ${
                layout === "tiles" ? "rounded-xl px-4 py-3.5 text-[15px]" : "rounded-full px-4 py-2 text-sm"
              } ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:border-ink-soft"}`}
            >
              {layout === "tiles" && (
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${
                    on ? "border-white bg-white text-ink" : "border-line-strong"
                  }`}
                >
                  {on && <Check aria-hidden className="size-3.5" />}
                </span>
              )}
              <span className="font-medium">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft aria-hidden className="size-4" />}>
          Back
        </Button>
        <span className="text-sm text-ink-muted">
          {selected.length} of {max} picked
        </span>
        <Button onClick={onNext} variant={selected.length ? "primary" : "secondary"} icon={<ArrowRight aria-hidden className="size-4" />}>
          {selected.length ? "Next" : "Skip"}
        </Button>
      </div>
    </section>
  );
}

function TrainingPart({
  quiz,
  value,
  onChange,
  onBack,
  onSubmit,
  submitting,
}: {
  quiz: Quiz;
  value: string;
  onChange: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <section className="space-y-5">
      <PartHeader number={5} title="How long would you like to train after high school?" hint="This changes which careers rise to the top. It doesn't hide any." />

      <div role="radiogroup" aria-label="Training after high school" className="space-y-2">
        {quiz.training.map((option) => {
          const on = value === option.key;

          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(option.key)}
              className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors ${
                on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:border-ink-soft"
              }`}
            >
              <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-white" : "border-line-strong"}`}>
                {on && <span className="size-2 rounded-full bg-white" />}
              </span>
              <span>
                <span className="block font-semibold">{option.label}</span>
                <span className={`block text-sm ${on ? "text-white/70" : "text-ink-muted"}`}>{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft aria-hidden className="size-4" />}>
          Back
        </Button>
        <Button disabled={!value} loading={submitting} onClick={onSubmit} icon={<Check aria-hidden className="size-4" />}>
          See my results
        </Button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- results */

function vertex(index: number, radius: number, center = 150) {
  const angle = (Math.PI / 3) * index - Math.PI / 2;
  return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)] as const;
}

function Hexagon({
  scores,
  active,
  onActive,
}: {
  scores: Record<string, number>;
  active: string;
  onActive: (kind: string) => void;
}) {
  const radius = 90;
  const points = HEXAGON.map((kind, index) => vertex(index, (radius * (scores[kind] ?? 0)) / 100));

  return (
    <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[340px]" role="img" aria-label="Your six interest scores on the interest hexagon">
      {[25, 50, 75, 100].map((ring) => (
        <polygon
          key={ring}
          points={HEXAGON.map((_, index) => vertex(index, (radius * ring) / 100).join(",")).join(" ")}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={1}
        />
      ))}
      {HEXAGON.map((kind, index) => {
        const [x, y] = vertex(index, radius);
        return <line key={kind} x1={150} y1={150} x2={x} y2={y} stroke="var(--color-line)" strokeWidth={1} />;
      })}

      <polygon
        points={points.map((point) => point.join(",")).join(" ")}
        fill="var(--color-primary)"
        fillOpacity={0.12}
        stroke="var(--color-primary)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {HEXAGON.map((kind, index) => {
        const [x, y] = points[index];
        const [labelX, labelY] = vertex(index, radius + 26);
        const on = active === kind;

        return (
          <g key={kind} onMouseEnter={() => onActive(kind)} onMouseLeave={() => onActive("")} className="cursor-default">
            <circle cx={x} cy={y} r={14} fill="transparent" />
            <circle cx={x} cy={y} r={on ? 6 : 4.5} fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth={2} />
            <text
              x={labelX}
              y={labelY - 5}
              textAnchor="middle"
              className={`text-[12px] font-semibold ${on ? "fill-ink" : "fill-ink-muted"}`}
            >
              {kind}
            </text>
            <text x={labelX} y={labelY + 10} textAnchor="middle" className="fill-ink text-[12px] font-bold tabular-nums">
              {scores[kind] ?? 0}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function FitBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-ink-muted">{label}</span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full bg-ink" style={{ width: `${value}%` }} />
      </span>
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-muted">{value}</span>
    </div>
  );
}

function MatchRow({ career, rank }: { career: CareerSummary; rank: number }) {
  const parts = Object.entries(career.match_parts ?? {});

  return (
    <li className="grid gap-4 border-b border-line py-5 last:border-b-0 sm:grid-cols-[2.5rem_1fr_220px] sm:gap-6">
      <span className="hidden text-sm font-semibold tabular-nums text-ink-soft sm:block">{String(rank).padStart(2, "0")}</span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3 sm:block">
          <Link href={`/explore/${career.slug}`} className="text-lg font-semibold text-ink hover:underline">
            {career.title}
          </Link>
          <span className="text-lg font-bold tabular-nums text-ink sm:hidden">{career.match_score}%</span>
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">{career.family_label}</p>
        <ul className="mt-2.5 space-y-1">
          {(career.match_reasons ?? []).map((reason) => (
            <li key={reason} className="flex gap-2 text-sm text-ink">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
              {reason}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="hidden text-right text-2xl font-bold tabular-nums text-ink sm:block">
          {career.match_score}
          <span className="text-base font-semibold text-ink-muted">%</span>
        </p>
        <div className="mt-2 space-y-1.5">
          {parts.map(([name, value]) => (
            <FitBar key={name} label={PART_LABELS[name] ?? name} value={value ?? 0} />
          ))}
        </div>
      </div>
    </li>
  );
}

function Results({ result, onRetake }: { result: InterestQuizResult; onRetake: () => void }) {
  const [active, setActive] = useState("");
  const [showAll, setShowAll] = useState(false);
  const ranked = Object.entries(result.scores).sort((a, b) => b[1] - a[1]);
  const preferences = result.preferences;
  const careers = showAll ? result.careers : result.careers.slice(0, 6);

  return (
    <div className="space-y-10 pb-10">
      <header className="flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-muted">
            Your interest code{result.taken_at ? ` · ${formatDate(result.taken_at)}` : ""}
          </p>
          <div className="mt-3 flex gap-2">
            {result.code.split("").map((letter, index) => (
              <span
                key={letter}
                className={`flex size-16 items-center justify-center rounded-2xl text-3xl font-bold sm:size-20 sm:text-4xl ${
                  index === 0 ? "bg-ink text-white" : "border-2 border-ink text-ink"
                }`}
              >
                {letter}
              </span>
            ))}
          </div>
          <p className="mt-3 text-ink-muted">
            {result.top.map((item) => item.type).join(" · ")}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onRetake} icon={<RotateCcw aria-hidden className="size-4" />}>
          Retake
        </Button>
      </header>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-12">
        <Hexagon scores={result.scores} active={active} onActive={setActive} />

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">What it means</h2>
            <dl className="mt-3 space-y-3">
              {result.top.map((item) => (
                <div key={item.type}>
                  <dt className="font-semibold text-ink">{item.type}</dt>
                  <dd className="text-sm leading-relaxed text-ink-muted">{item.description}</dd>
                </div>
              ))}
            </dl>
          </div>

          <ul className="space-y-1.5" aria-label="All six scores">
            {ranked.map(([kind, value]) => (
              <li
                key={kind}
                onMouseEnter={() => setActive(kind)}
                onMouseLeave={() => setActive("")}
                className={`grid grid-cols-[110px_1fr_2rem] items-center gap-3 rounded-lg px-2 py-1 text-sm ${
                  active === kind ? "bg-surface-2" : ""
                }`}
              >
                <span className="font-medium text-ink">{kind}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(value, 2)}%` }} />
                </span>
                <span className="text-right font-semibold tabular-nums text-ink">{value}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {result.shape && result.shape.length > 0 && (
        <section aria-labelledby="shape-title">
          <h2 id="shape-title" className="text-lg font-semibold">
            The shape of your profile
          </h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {result.shape.map((note) => (
              <div key={note.key} className="border-l-2 border-ink pl-4">
                <p className="font-semibold text-ink">{note.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{note.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="matches-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="matches-title" className="font-display text-2xl font-semibold">
              Careers that fit
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Ranked by fit: interests count most, then work setting, subjects, and training.
            </p>
          </div>
        </div>

        {preferences && (preferences.settings.length > 0 || preferences.subjects.length > 0 || preferences.training) && (
          <p className="mt-3 text-sm text-ink-muted">
            Using your picks:{" "}
            {[...preferences.settings, ...preferences.subjects, preferences.training].filter(Boolean).join(" · ")}
          </p>
        )}

        <ol className="mt-4 rounded-[var(--radius-card)] border border-line bg-surface px-5 sm:px-6">
          {careers.map((career, index) => (
            <MatchRow key={career.slug} career={career} rank={index + 1} />
          ))}
        </ol>

        {!showAll && result.careers.length > 6 && (
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAll(true)}>
            Show {result.careers.length - 6} more
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Talk it through</h2>
          <p className="mt-1 text-sm text-ink-muted">Your counselor can see these results and help you narrow things down.</p>
        </div>
        <ButtonLink
          href={`/counselor?ask=${encodeURIComponent(`My interest code is ${result.code}. Can you help me understand what that means and which careers to look at first?`)}`}
          variant="secondary"
          icon={<MessageCircle aria-hidden className="size-4" />}
        >
          Discuss my results
        </ButtonLink>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------- page */

function Intro({ onStart, hasResult, onCancel }: { onStart: () => void; hasResult: boolean; onCancel: () => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <div>
        <p className="text-sm font-semibold text-ink-muted">Interest quiz · about 8 minutes</p>
        <h1 className="font-display mt-2 text-[2.25rem] font-semibold leading-tight text-ink sm:text-[2.75rem]">
          Find the kinds of work that fit you
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-muted">
          Five short parts. You&apos;ll get a three-letter interest code, the same model used to describe every career in Explore, and careers ranked by how well they fit.
        </p>
      </div>

      <ol className="divide-y divide-line border-y border-line">
        {PARTS.map((part, index) => (
          <li key={part.key} className="flex items-center justify-between py-3">
            <span className="flex items-center gap-4">
              <span className="w-5 text-sm font-semibold tabular-nums text-ink-soft">{index + 1}</span>
              <span className="font-medium text-ink">{part.title}</span>
            </span>
            <span className="text-sm text-ink-muted">~{part.minutes} min</span>
          </li>
        ))}
      </ol>

      <p className="text-sm text-ink-muted">There are no right or wrong answers. Go with your first reaction.</p>

      <div className="flex gap-2">
        <Button size="lg" onClick={onStart} icon={<ArrowRight aria-hidden className="size-[18px]" />}>
          Start
        </Button>
        {hasResult && (
          <Button size="lg" variant="ghost" onClick={onCancel}>
            Back to my results
          </Button>
        )}
      </div>
    </div>
  );
}

export function InterestQuiz() {
  const toast = useToast();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<InterestQuizResult | null>(null);
  const [part, setPart] = useState<Part | "intro" | "result">("intro");
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<InterestQuizAnswers>(emptyAnswers);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .interestQuiz()
      .then((loaded) => {
        if (!cancelled) {
          setQuiz(loaded);
          setResult(loaded.result);
          setPart(loaded.result ? "result" : "intro");
          setError("");
        }
      })
      .catch((caught) => !cancelled && setError(caught instanceof Error ? caught.message : "Couldn't load the quiz."));

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return <ErrorNotice message={error} onRetry={() => setAttempt((value) => value + 1)} />;
  }

  if (!quiz) {
    return <CardSkeleton lines={4} />;
  }

  function go(next: typeof part) {
    setPart(next);
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    setSubmitting(true);

    try {
      setResult(await api.submitInterestQuiz(answers));
      go("result");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Couldn't save your answers.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (part === "result" && result) {
    return (
      <Results
        result={result}
        onRetake={() => {
          setAnswers(emptyAnswers());
          setPage(0);
          go("intro");
        }}
      />
    );
  }

  if (part === "intro" || part === "result") {
    return <Intro onStart={() => go("activities")} hasResult={Boolean(result)} onCancel={() => go("result")} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <Stepper part={part} />

      {part === "activities" && (
        <ActivitiesPart
          quiz={quiz}
          answers={answers}
          setAnswers={setAnswers}
          page={page}
          setPage={setPage}
          onDone={() => go("tradeoffs")}
          onExit={() => go(result ? "result" : "intro")}
        />
      )}

      {part === "tradeoffs" && (
        <TradeoffsPart
          quiz={quiz}
          answers={answers}
          setAnswers={setAnswers}
          onDone={() => go("settings")}
          onBack={() => {
            setPage(Math.ceil(quiz.activities.items.length / ACTIVITIES_PER_PAGE) - 1);
            go("activities");
          }}
        />
      )}

      {part === "settings" && (
        <ChoicePart
          number={3}
          title="Where would you like to work?"
          hint={`Pick up to ${quiz.settings.max}. Skip if you're not sure.`}
          options={quiz.settings.options}
          selected={answers.settings}
          max={quiz.settings.max}
          onChange={(settings) => setAnswers({ ...answers, settings })}
          onNext={() => go("subjects")}
          onBack={() => go("tradeoffs")}
          layout="tiles"
        />
      )}

      {part === "subjects" && (
        <ChoicePart
          number={4}
          title="Which school subjects do you enjoy most?"
          hint={`Pick up to ${quiz.subjects.max}.`}
          options={quiz.subjects.options.map((subject) => ({ key: subject, label: subject }))}
          selected={answers.subjects}
          max={quiz.subjects.max}
          onChange={(subjects) => setAnswers({ ...answers, subjects })}
          onNext={() => go("training")}
          onBack={() => go("settings")}
          layout="chips"
        />
      )}

      {part === "training" && (
        <TrainingPart
          quiz={quiz}
          value={answers.training}
          onChange={(training) => setAnswers({ ...answers, training })}
          onBack={() => go("subjects")}
          onSubmit={submit}
          submitting={submitting}
        />
      )}
    </div>
  );
}
