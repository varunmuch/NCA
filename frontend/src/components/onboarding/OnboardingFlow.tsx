"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Map as MapIcon,
  MessageCircle,
  Target,
} from "lucide-react";

import { QuickPathCard } from "@/components/careers/QuickPathCard";

import { BrandMark } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ChipInput, TextInput } from "@/components/ui/Field";
import { ErrorNotice } from "@/components/ui/Feedback";
import { api } from "@/lib/api";
import type { CareerSummary, StudentProfile } from "@/types/cie";

const GRADES = ["9th grade", "10th grade", "11th grade", "12th grade"];

const INTERESTS = [
  "Building things",
  "Helping people",
  "Drawing & design",
  "Video games",
  "Animals",
  "Nature & outdoors",
  "Writing",
  "Coding",
  "Cooking",
  "Leading teams",
  "Science experiments",
  "Making videos",
];

const TOTAL_STEPS = 3;

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-4 py-2.5 text-[15px] font-semibold transition-colors ${
        selected
          ? "border-primary bg-primary text-on-primary"
          : "border-line-strong bg-surface text-ink hover:border-primary/40 hover:bg-primary-softer"
      }`}
    >
      {children}
    </button>
  );
}

/** Type a career and pick its official title (new valid titles get a page). */
function GoalSearch({ value, onPick }: { value: CareerSummary | null; onPick: (career: CareerSummary | null) => void }) {
  const [query, setQuery] = useState(value?.title ?? "");
  const [results, setResults] = useState<CareerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState("");

  useEffect(() => {
    const phrase = query.trim();

    if (phrase.length < 3 || phrase === value?.title) {
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);

      try {
        const found = await api.careers({ q: phrase });

        if (active) {
          setResults(found.careers.slice(0, 5));
          setSearched(phrase);
        }
      } catch {
        if (active) {
          setResults([]);
        }
      } finally {
        if (active) {
          setSearching(false);
        }
      }
    }, 450);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, value?.title]);

  return (
    <div className="mt-5">
      <label htmlFor="career-goal" className="text-sm font-semibold">
        What career are you thinking about?
      </label>
      <TextInput
        id="career-goal"
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          onPick(null);
        }}
        placeholder="For example: software engineer, nurse, electrician"
        className="mt-1.5"
      />
      {searching && <p className="mt-2 text-sm text-ink-muted" role="status">Checking official job titles…</p>}
      {!searching && results.length > 0 && !value && (
        <ul className="mt-3 space-y-2" aria-label="Matching careers">
          {results.map((career) => (
            <li key={career.slug}>
              <button
                type="button"
                onClick={() => {
                  onPick(career);
                  setQuery(career.title);
                }}
                className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left hover:border-primary/40 hover:bg-primary-softer"
              >
                <span className="font-semibold text-ink">{career.title}</span>
                <span className="block text-sm text-ink-muted">{career.family_label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!searching && searched && results.length === 0 && !value && (
        <p className="mt-2 text-sm text-ink-muted">We couldn&apos;t find that as an official job title. Try another name for it.</p>
      )}
      {value && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-softer px-3 py-1 text-sm font-semibold text-accent-ink">
          <Target aria-hidden className="size-4" /> Goal: {value.title}
        </p>
      )}
    </div>
  );
}

export function OnboardingFlow({ profile }: { profile: StudentProfile }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [preferredName, setPreferredName] = useState(
    profile.preferred_name || (profile.name || "").split(" ")[0] || ""
  );
  const [grade, setGrade] = useState(profile.grade_level || "");
  const [customGrade, setCustomGrade] = useState(
    profile.grade_level && !GRADES.includes(profile.grade_level) ? profile.grade_level : ""
  );
  const [interests, setInterests] = useState<string[]>(profile.interests || []);
  const [careerStatus, setCareerStatus] = useState<StudentProfile["career_status"]>(
    profile.career_status || ""
  );
  const [goal, setGoal] = useState<CareerSummary | null>(null);

  async function save(updates: Partial<StudentProfile>) {
    setSaving(true);
    setError("");

    try {
      await api.updateProfile(updates);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't save that. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updatesForStep(current: number): Partial<StudentProfile> {
    switch (current) {
      case 1:
        return {
          preferred_name: preferredName.trim(),
          grade_level: (grade === "other" ? customGrade : grade).trim(),
        };
      case 2:
        return {
          career_status: careerStatus,
          interests,
          ...(careerStatus === "have_goal" && goal ? { career_aspiration: goal.title } : {}),
        };
      default:
        return {};
    }
  }

  async function next(skip = false) {
    if (!skip && !(await save(updatesForStep(step)))) {
      return;
    }

    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  }

  async function finish(destination: string) {
    if (await save({ onboarding_completed: true })) {
      router.push(destination);
      router.refresh();
    }
  }

  const canContinue = step !== 2 || careerStatus === "exploring" || (careerStatus === "have_goal" && goal !== null);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <BrandMark />
        <button
          type="button"
          onClick={() => finish("/")}
          className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          Skip for now
        </button>
      </header>

      <main className={`mx-auto flex w-full flex-1 flex-col px-5 pb-10 pt-4 ${step === 3 && goal ? "max-w-3xl" : "max-w-xl"}`}>
        <div
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step}
          className="flex gap-1.5"
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                index < step ? "bg-primary" : "bg-line"
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-sm font-medium text-ink-muted">
          Step {step} of {TOTAL_STEPS}
        </p>

        <div key={step} className="mt-6 flex-1 animate-[var(--animate-fade-up)]">
          {step === 1 && (
            <section>
              <h1 className="font-display text-[2.25rem] font-semibold leading-tight">Hi! Let&apos;s get you started.</h1>
              <p className="mt-3 text-lg text-ink-muted">Two quick questions, then you&apos;ll see your first result.</p>
              <label htmlFor="preferred-name" className="mt-8 block text-sm font-semibold">
                What should we call you?
              </label>
              <TextInput
                id="preferred-name"
                autoFocus
                value={preferredName}
                onChange={(event) => setPreferredName(event.target.value)}
                placeholder="Your first name or nickname"
                className="mt-1.5 h-12 text-lg"
                maxLength={80}
              />
              <p className="mt-6 text-sm font-semibold">What grade are you in?</p>
              <div className="mt-2 flex flex-wrap gap-2.5">
                {GRADES.map((item) => (
                  <Choice key={item} selected={grade === item} onClick={() => setGrade(item)}>
                    {item}
                  </Choice>
                ))}
                <Choice selected={grade === "other"} onClick={() => setGrade("other")}>
                  Something else
                </Choice>
              </div>
              {grade === "other" && (
                <TextInput
                  aria-label="Your grade or year"
                  value={customGrade}
                  onChange={(event) => setCustomGrade(event.target.value)}
                  placeholder="For example: 8th grade, or gap year"
                  className="mt-4"
                />
              )}
            </section>
          )}

          {step === 2 && (
            <section>
              <h1 className="font-display text-[2.25rem] font-semibold leading-tight">Do you have a career in mind?</h1>
              <p className="mt-3 text-lg text-ink-muted">Either answer is a great place to start.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  { value: "have_goal" as const, icon: Target, title: "I have a career in mind", body: "See how to get there, right away." },
                  { value: "exploring" as const, icon: Compass, title: "I'm still figuring it out", body: "Totally normal. Let's find what fits." },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={careerStatus === option.value}
                    onClick={() => setCareerStatus(option.value)}
                    className={`rounded-[var(--radius-card)] border-2 p-5 text-left transition-colors ${
                      careerStatus === option.value ? "border-primary bg-primary-softer" : "border-line bg-surface hover:border-primary/40"
                    }`}
                  >
                    <option.icon aria-hidden className="size-6 text-primary" />
                    <p className="mt-3 font-bold text-ink">{option.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">{option.body}</p>
                  </button>
                ))}
              </div>
              {careerStatus === "have_goal" && <GoalSearch value={goal} onPick={setGoal} />}
              {careerStatus === "exploring" && (
                <div className="mt-6">
                  <h2 className="text-sm font-bold text-ink-muted">Pick a few things you enjoy (optional)</h2>
                  <div className="mt-3">
                    <ChipInput value={interests} onChange={setInterests} placeholder="Type an interest" suggestions={INTERESTS} />
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 3 && goal && (
            <section>
              <h1 className="font-display text-[2rem] font-semibold leading-tight">
                {preferredName ? `${preferredName}, here's` : "Here's"} your path to {goal.title}
              </h1>
              <p className="mt-2 text-lg text-ink-muted">Real numbers, real Florida colleges. Your counselor can build the full plan next.</p>
              <div className="mt-6">
                <QuickPathCard slug={goal.slug} title="Your path in 30 seconds" />
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" loading={saving} onClick={() => finish("/plan?start=1")} icon={<MapIcon aria-hidden className="size-[18px]" />}>
                  Build my full plan
                </Button>
                <Button size="lg" variant="secondary" disabled={saving} onClick={() => finish("/counselor?start=have_goal")} icon={<MessageCircle aria-hidden className="size-[18px]" />}>
                  Talk to my counselor
                </Button>
              </div>
            </section>
          )}

          {step === 3 && !goal && (
            <section className="text-center">
              <h1 className="font-display mt-4 text-[2.25rem] font-semibold leading-tight">
                Let&apos;s find what fits{preferredName ? `, ${preferredName}` : ""}.
              </h1>
              <p className="mx-auto mt-3 max-w-md text-lg text-ink-muted">
                The interest quiz takes about 5 minutes and shows careers that match you, with real pay and schools.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" loading={saving} onClick={() => finish("/discover")} icon={<Compass aria-hidden className="size-[18px]" />}>
                  Take the quiz
                </Button>
                <Button size="lg" variant="secondary" disabled={saving} onClick={() => finish("/counselor?start=exploring")} icon={<MessageCircle aria-hidden className="size-[18px]" />}>
                  Just talk to my counselor
                </Button>
              </div>
            </section>
          )}
        </div>

        {error && <ErrorNotice className="mt-6" message={error} />}

        {step < TOTAL_STEPS && (
          <div className="mt-10 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              disabled={step === 1 || saving}
              icon={<ArrowLeft aria-hidden className="size-4" />}
            >
              Back
            </Button>
            <Button onClick={() => next()} loading={saving} disabled={!canContinue}>
              {step === 2 ? "Show me" : "Continue"}
              <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
