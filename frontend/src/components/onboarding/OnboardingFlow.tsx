"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  MessageCircle,
  Target,
} from "lucide-react";

import { BrandMark } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ChipInput, TextInput } from "@/components/ui/Field";
import { ErrorNotice } from "@/components/ui/Feedback";
import { api } from "@/lib/api";
import type { StudentProfile } from "@/types/cie";

const GRADES = ["9th grade", "10th grade", "11th grade", "12th grade"];

const SUBJECTS = [
  "Math",
  "Biology",
  "Chemistry",
  "Physics",
  "English",
  "History",
  "Art",
  "Music",
  "Computer Science",
  "Psychology",
  "World Languages",
  "Business",
  "Health",
  "PE & Sports",
];

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

const TOTAL_STEPS = 5;

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
  const [subjects, setSubjects] = useState<string[]>(profile.favorite_subjects || []);
  const [interests, setInterests] = useState<string[]>(profile.interests || []);
  const [careerStatus, setCareerStatus] = useState<StudentProfile["career_status"]>(
    profile.career_status || ""
  );
  const [careerGoal, setCareerGoal] = useState(profile.career_aspiration || "");

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
        return { preferred_name: preferredName.trim() };
      case 2:
        return { grade_level: (grade === "other" ? customGrade : grade).trim() };
      case 3:
        return { favorite_subjects: subjects, interests };
      case 4:
        return {
          career_status: careerStatus,
          ...(careerStatus === "have_goal" ? { career_aspiration: careerGoal.trim() } : {}),
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

  const counselorStart =
    careerStatus === "have_goal" ? "/counselor?start=have_goal" : careerStatus === "exploring" ? "/counselor?start=exploring" : "/counselor";

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

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-10 pt-4">
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
              <h1 className="font-display text-[2.25rem] font-semibold leading-tight">
                Welcome! What should we call you?
              </h1>
              <p className="mt-3 text-lg text-ink-muted">
                Your counselor will use this name when it talks with you.
              </p>
              <label htmlFor="preferred-name" className="sr-only">
                Preferred name
              </label>
              <TextInput
                id="preferred-name"
                autoFocus
                value={preferredName}
                onChange={(event) => setPreferredName(event.target.value)}
                placeholder="Your first name or nickname"
                className="mt-8 h-14 text-lg"
                maxLength={80}
                onKeyDown={(event) => event.key === "Enter" && void next()}
              />
            </section>
          )}

          {step === 2 && (
            <section>
              <h1 className="font-display text-[2.25rem] font-semibold leading-tight">What grade are you in?</h1>
              <p className="mt-3 text-lg text-ink-muted">This helps your plan fit where you are right now.</p>
              <div className="mt-8 flex flex-wrap gap-2.5">
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

          {step === 3 && (
            <section>
              <h1 className="font-display text-[2.25rem] font-semibold leading-tight">What do you enjoy?</h1>
              <p className="mt-3 text-lg text-ink-muted">
                Pick a few favorite subjects and interests, or type your own. There are no wrong answers.
              </p>
              <h2 className="mt-8 text-sm font-bold text-ink-muted">Favorite subjects</h2>
              <div className="mt-3">
                <ChipInput value={subjects} onChange={setSubjects} placeholder="Type a subject" suggestions={SUBJECTS} />
              </div>
              <h2 className="mt-7 text-sm font-bold text-ink-muted">Interests & hobbies</h2>
              <div className="mt-3">
                <ChipInput value={interests} onChange={setInterests} placeholder="Type an interest" suggestions={INTERESTS} />
              </div>
            </section>
          )}

          {step === 4 && (
            <section>
              <h1 className="font-display text-[2.25rem] font-semibold leading-tight">
                Do you have a career in mind?
              </h1>
              <p className="mt-3 text-lg text-ink-muted">Either answer is a great place to start.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    value: "have_goal" as const,
                    icon: Target,
                    title: "I have a career in mind",
                    body: "Let's map out how to get there.",
                  },
                  {
                    value: "exploring" as const,
                    icon: Compass,
                    title: "I'm still figuring it out",
                    body: "Totally normal. Let's discover what fits you.",
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={careerStatus === option.value}
                    onClick={() => setCareerStatus(option.value)}
                    className={`rounded-[var(--radius-card)] border-2 p-5 text-left transition-colors ${
                      careerStatus === option.value
                        ? "border-primary bg-primary-softer"
                        : "border-line bg-surface hover:border-primary/40"
                    }`}
                  >
                    <option.icon aria-hidden className="size-6 text-primary" />
                    <p className="mt-3 font-bold text-ink">{option.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">{option.body}</p>
                  </button>
                ))}
              </div>
              {careerStatus === "have_goal" && (
                <div className="mt-5">
                  <label htmlFor="career-goal" className="text-sm font-semibold">
                    What career are you thinking about?
                  </label>
                  <TextInput
                    id="career-goal"
                    value={careerGoal}
                    onChange={(event) => setCareerGoal(event.target.value)}
                    placeholder="For example: nurse, game designer, electrician"
                    className="mt-1.5"
                  />
                </div>
              )}
            </section>
          )}

          {step === 5 && (
            <section className="text-center">
              <h1 className="font-display mt-4 text-[2.25rem] font-semibold leading-tight">
                You&apos;re all set{preferredName ? `, ${preferredName}` : ""}!
              </h1>
              <p className="mx-auto mt-3 max-w-md text-lg text-ink-muted">
                Your AI Career Counselor is ready to help you explore, ask questions, and build a plan that works for you.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" loading={saving} onClick={() => finish(counselorStart)} icon={<MessageCircle aria-hidden className="size-[18px]" />}>
                  Talk to my counselor
                </Button>
                <Button size="lg" variant="secondary" disabled={saving} onClick={() => finish("/")}>
                  Look around first
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
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => next(true)} disabled={saving}>
                Skip
              </Button>
              <Button onClick={() => next()} loading={saving}>
                Continue
                <ArrowRight aria-hidden className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
