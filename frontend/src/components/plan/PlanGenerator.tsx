"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Map } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { ErrorNotice } from "@/components/ui/Feedback";
import { api } from "@/lib/api";

/**
 * While a plan is built, show what the counselor is actually doing, line by
 * line, as the server reports it ("Found 14 Florida colleges..."), so the
 * wait shows the work instead of a spinner.
 */
export function GeneratingPlan({ label = "Building your plan", lines = [] }: { label?: string; lines?: string[] }) {
  const shown = lines.length ? lines : ["Reading your plan and what you asked for"];

  return (
    <div role="status" aria-live="polite" className="rounded-[var(--radius-hero)] border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
      <div className="text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Map aria-hidden className="size-7 motion-safe:animate-pulse" />
        </span>
        <h2 className="font-display mt-4 text-2xl font-semibold">{label}…</h2>
        <p className="mt-2 text-sm text-ink-muted">Usually under a minute. Here&apos;s what your counselor is doing:</p>
      </div>
      <ol className="mx-auto mt-6 max-w-lg space-y-3 text-left">
        {shown.map((item, index) => {
          const current = index === shown.length - 1;

          return (
            <li key={`${item}-${index}`} className={`flex items-start gap-3 text-[15px] animate-[var(--animate-fade-up)] ${current ? "text-ink" : "text-ink-muted"}`}>
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${current ? "bg-primary-soft text-primary" : "bg-accent text-on-accent"}`}
              >
                {current ? <span className="size-2 rounded-full bg-current motion-safe:animate-pulse" /> : <Check aria-hidden className="size-3.5" />}
              </span>
              {item}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function PlanGenerator({
  suggestedGoal = "",
  autoFocus = false,
  autoStart = false,
}: {
  suggestedGoal?: string;
  autoFocus?: boolean;
  autoStart?: boolean;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState(suggestedGoal);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const started = useRef(false);

  async function generate() {
    setBusy(true);
    setError("");
    setLines([]);

    try {
      const plan = await api.streamPlan({ career_goal: goal.trim(), instruction: note.trim() }, (text) =>
        setLines((current) => [...current, text])
      );
      router.push(`/plan/${plan.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your plan couldn't be created. Please try again.");
      setBusy(false);
    }
  }

  // Coming from sign-up ("Build my full plan"): start right away.
  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  if (busy) {
    return <GeneratingPlan lines={lines} />;
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
