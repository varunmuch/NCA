"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Map } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { ErrorNotice } from "@/components/ui/Feedback";
import { api } from "@/lib/api";

const STEPS = [
  "Gathering what you've shared",
  "Matching careers to your interests",
  "Mapping your high school years",
  "Writing your next steps",
];

export function GeneratingPlan({ label = "Building your plan" }: { label?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => Math.min(current + 1, STEPS.length - 1)), 9000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div role="status" aria-live="polite" className="rounded-[var(--radius-hero)] border border-line bg-surface p-8 text-center shadow-[var(--shadow-card)]">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Map aria-hidden className="size-7 motion-safe:animate-pulse" />
      </span>
      <h2 className="font-display mt-4 text-2xl font-semibold">{label}…</h2>
      <p className="mt-2 text-sm text-ink-muted">This usually takes under a minute. You can stay on this page.</p>
      <ol className="mx-auto mt-6 max-w-xs space-y-2.5 text-left">
        {STEPS.map((item, index) => (
          <li key={item} className={`flex items-center gap-3 text-sm ${index <= step ? "text-ink" : "text-ink-soft"}`}>
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                index < step ? "bg-accent text-on-accent" : index === step ? "bg-primary-soft text-primary" : "bg-surface-2"
              }`}
            >
              {index < step ? <Check aria-hidden className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PlanGenerator({ suggestedGoal = "", autoFocus = false }: { suggestedGoal?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [goal, setGoal] = useState(suggestedGoal);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");

    try {
      const plan = await api.generatePlan({ career_goal: goal.trim(), instruction: note.trim() });
      router.push(`/plan/${plan.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your plan couldn't be created. Please try again.");
      setBusy(false);
    }
  }

  if (busy) {
    return <GeneratingPlan />;
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-lg font-bold">Create a personalized plan</h2>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Your counselor uses your profile, conversations, and any resume or transcript you&apos;ve shared. No career goal yet? Leave it blank and you&apos;ll get an exploration plan instead.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Career goal (optional)" htmlFor="plan-goal" hint="For example: nurse, game designer, or “something in science”.">
          <TextInput
            id="plan-goal"
            autoFocus={autoFocus}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Leave blank to explore"
            maxLength={200}
          />
        </Field>
        <Field label="Anything to focus on? (optional)" htmlFor="plan-note" hint="Like “free activities only” or “I want to stay close to home”.">
          <TextArea id="plan-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
        </Field>
      </div>
      {error && <ErrorNotice className="mt-4" message={error} onRetry={generate} />}
      <Button size="lg" className="mt-6" onClick={generate} icon={<Map aria-hidden className="size-[18px]" />}>
        Generate my plan
      </Button>
    </div>
  );
}
