"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, MessageCircle, RotateCcw } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { FieldQuiz as FieldQuizData, FieldQuizResult, InterestQuizAnswers } from "@/types/cie";

import { ActivitiesPart, TradeoffsPart, TrainingPart, emptyAnswers } from "./InterestQuiz";

const PARTS = [
  { key: "activities", title: "Activities" },
  { key: "tradeoffs", title: "Trade-offs" },
  { key: "training", title: "Training" },
] as const;

type Part = (typeof PARTS)[number]["key"];

function dollars(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Stepper({ part }: { part: Part }) {
  const current = PARTS.findIndex((item) => item.key === part);

  return (
    <ol className="grid grid-cols-3 gap-1.5" aria-label="Quiz parts">
      {PARTS.map((item, index) => (
        <li key={item.key} aria-current={index === current ? "step" : undefined}>
          <div className={`h-1 rounded-full ${index <= current ? "bg-ink" : "bg-surface-3"}`} />
          <p className={`mt-2 hidden text-xs font-semibold sm:block ${index <= current ? "text-ink" : "text-ink-soft"}`}>
            {index + 1}. {item.title}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Results({ goal, result, onRetake }: { goal: string; result: FieldQuizResult; onRetake: () => void }) {
  const ask = `I took the quiz for ${goal}. My best fit was ${result.careers[0]?.title ?? ""}. Can you help me understand what that means?`;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-ink-muted">Your quiz for {goal}</p>
          <h1 className="font-display mt-1 text-[2rem] font-semibold leading-tight text-ink">
            Where you fit in {goal}
          </h1>
          <p className="mt-2 max-w-xl text-ink-muted">
            Ranked by how much you&apos;d enjoy the everyday work. Every career here is part of the same field.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onRetake} icon={<RotateCcw aria-hidden className="size-4" />}>
          Retake
        </Button>
      </header>

      <ol className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {result.careers.map((career, index) => (
          <li key={career.slug} className="grid gap-3 px-5 py-5 sm:grid-cols-[2.5rem_1fr_5rem] sm:gap-5">
            <span className="hidden text-sm font-semibold tabular-nums text-ink-soft sm:block">{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/explore/${career.slug}`} className="text-lg font-semibold text-ink hover:underline">
                  {career.title}
                </Link>
                {career.is_goal && <span className="text-sm text-ink-muted">your goal</span>}
              </div>
              <ul className="mt-2 space-y-1">
                {career.match_reasons.map((reason) => (
                  <li key={reason} className="flex gap-2 text-sm text-ink">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                    {reason}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-ink-muted">
                {career.pay_median ? `${dollars(career.pay_median)} typical pay a year` : null}
                {career.pay_median && career.education ? " · " : null}
                {career.education ? `To start: ${career.education}` : null}
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-ink sm:text-right">
              {career.match_score}
              <span className="text-base font-semibold text-ink-muted">%</span>
            </p>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-muted">Typical pay is the median from BLS data: half earn more, half earn less.</p>

      <section className="flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Talk it through</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Not sure about {goal} anymore?{" "}
            <Link href="/discover?mode=general" className="font-semibold text-primary hover:underline">
              Take the general quiz
            </Link>
            .
          </p>
        </div>
        <ButtonLink href={`/counselor?ask=${encodeURIComponent(ask)}`} variant="secondary" icon={<MessageCircle aria-hidden className="size-4" />}>
          Discuss my results
        </ButtonLink>
      </section>
    </div>
  );
}

/** The quiz for a student with a career goal: only that field's careers. */
export function FieldQuiz({ quiz }: { quiz: FieldQuizData }) {
  const toast = useToast();
  const goal = quiz.field.goal || quiz.field.anchor.title;
  const [result, setResult] = useState<FieldQuizResult | null>(quiz.result);
  const [part, setPart] = useState<Part | "intro" | "result">(quiz.result ? "result" : "intro");
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<InterestQuizAnswers>(emptyAnswers);
  const [submitting, setSubmitting] = useState(false);

  function go(next: typeof part) {
    setPart(next);
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    setSubmitting(true);

    try {
      setResult(await api.submitFieldQuiz({ activities: answers.activities, tradeoffs: answers.tradeoffs, training: answers.training }));
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
        goal={goal}
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
    return (
      <div className="mx-auto max-w-2xl space-y-8 py-4">
        <div>
          <p className="text-sm font-semibold text-ink-muted">Interest quiz for your goal · about 5 minutes</p>
          <h1 className="font-display mt-2 text-[2.25rem] font-semibold leading-tight text-ink sm:text-[2.75rem]">
            Find your fit in {goal}
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-ink-muted">
            There&apos;s more than one kind of work in {goal}. Rate real tasks from these careers, and see which ones suit you best.
          </p>
        </div>

        <ul className="flex flex-wrap gap-2">
          {quiz.field.careers.map((title) => (
            <li key={title} className="rounded-full border border-line-strong px-3 py-1 text-sm text-ink">
              {title}
            </li>
          ))}
        </ul>

        <p className="text-sm text-ink-muted">
          Every question is about this field.{" "}
          <Link href="/discover?mode=general" className="font-semibold text-primary hover:underline">
            Not sure about {goal}? Take the general quiz
          </Link>
          .
        </p>

        <Button size="lg" onClick={() => go("activities")} icon={<ArrowRight aria-hidden className="size-[18px]" />}>
          Start
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <Stepper part={part} />

      {part === "activities" && (
        <ActivitiesPart
          step={{ number: 1, total: 3 }}
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
          step={{ number: 2, total: 3 }}
          quiz={quiz}
          answers={answers}
          setAnswers={setAnswers}
          onDone={() => go("training")}
          onBack={() => {
            setPage(Math.ceil(quiz.activities.items.length / 6) - 1);
            go("activities");
          }}
        />
      )}

      {part === "training" && (
        <TrainingPart
          step={{ number: 3, total: 3 }}
          quiz={quiz}
          value={answers.training}
          onChange={(training) => setAnswers({ ...answers, training })}
          onBack={() => go("tradeoffs")}
          onSubmit={submit}
          submitting={submitting}
        />
      )}
    </div>
  );
}
