"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextInput } from "@/components/ui/Field";
import type { PlanDetail, PlanStep } from "@/types/cie";

function dollars(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/**
 * Plans written since Phase 5: the next 3 steps this month first, up to 3
 * careers with official pay and education, and the rest folded away.
 */
export function SimplePlan({
  plan,
  saved,
  taskBusy,
  onToggle,
  onSaveSteps,
}: {
  plan: PlanDetail;
  saved: boolean;
  taskBusy: number | null;
  onToggle: (taskId: number | undefined) => void;
  onSaveSteps: (steps: PlanStep[]) => Promise<boolean>;
}) {
  const content = plan.content;
  const steps = content.next_steps ?? [];
  const taskIds = content.next_action_task_ids ?? [];
  const careers = content.careers ?? [];
  const [editing, setEditing] = useState<PlanStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const done = steps.filter((_, index) => plan.task_status[String(taskIds[index])] === "done").length;
  const sources = [...new Set(careers.flatMap((career) => [career.pay_source, career.outlook_source]).filter(Boolean))];

  return (
    <div className="space-y-8">
      <section aria-labelledby="next-steps" className="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="next-steps" className="text-xl font-bold text-ink">
              Your next 3 steps this month
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {saved
                ? `${done} of ${steps.length} done.`
                : "Save the plan to check these off as you go."}
              {content.stage ? ` Grade ${content.stage.grade}: ${content.stage.name.toLowerCase()}.` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(steps.map((step) => ({ ...step })))}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <Pencil aria-hidden className="size-3.5" /> Edit
          </button>
        </div>

        <ol className="mt-5 space-y-4">
          {steps.map((step, index) => {
            const taskId = taskIds[index];
            const isDone = Boolean(taskId) && plan.task_status[String(taskId)] === "done";

            return (
              <li key={`${step.title}-${index}`} className="flex gap-4">
                {saved && taskId ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={`Mark "${step.title}" ${isDone ? "not done" : "done"}`}
                    disabled={taskBusy === taskId}
                    onClick={() => onToggle(taskId)}
                    className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50 ${
                      isDone ? "border-accent bg-accent text-on-accent" : "border-line-strong hover:border-accent"
                    }`}
                  >
                    {isDone && <Check aria-hidden className="size-4" />}
                  </button>
                ) : (
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-ink-muted">
                    {index + 1}
                  </span>
                )}
                <div>
                  <p className={`font-semibold leading-snug ${isDone ? "text-ink-muted line-through" : "text-ink"}`}>{step.title}</p>
                  {step.why && <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{step.why}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {careers.length > 0 && (
        <section aria-labelledby="plan-careers">
          <h2 id="plan-careers" className="text-lg font-bold">
            Careers you&apos;re exploring
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {careers.map((career) => (
              <li key={career.slug} className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <p className="text-xs font-semibold text-ink-muted">{career.family_label}</p>
                <Link href={`/explore/${career.slug}`} className="mt-1 font-bold leading-snug text-ink hover:underline">
                  {career.title}
                </Link>
                {career.why && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{career.why}</p>}
                <dl className="mt-auto space-y-1 border-t border-line pt-3 text-sm">
                  {career.pay_median ? (
                    <div>
                      <dt className="sr-only">Pay</dt>
                      <dd className="text-ink">
                        <span className="font-semibold">{dollars(career.pay_median)}</span> typical pay a year
                        {career.pay_median_florida ? ` (${dollars(career.pay_median_florida)} in Florida)` : ""}
                      </dd>
                    </div>
                  ) : null}
                  {career.education && (
                    <div>
                      <dt className="sr-only">Education</dt>
                      <dd className="text-ink-muted">To start: {career.education}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>
          {sources.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Typical pay is the median: half earn more, half earn less. From {sources.join(" and ")}.
            </p>
          )}
        </section>
      )}

      <details className="group rounded-[var(--radius-card)] border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 font-semibold text-ink">
          See the full plan
          <ChevronDown aria-hidden className="size-5 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-6 border-t border-line px-6 py-5">
          {(content.this_year ?? []).map((period) => (
            <div key={period.period}>
              <h3 className="font-semibold text-ink">{period.period}</h3>
              <ul className="mt-2 space-y-1.5 text-ink">
                {period.steps.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink-soft" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {(content.high_school ?? []).length > 0 && (
            <div>
              <h3 className="font-semibold text-ink">The rest of high school</h3>
              <dl className="mt-2 space-y-2">
                {content.high_school!.map((item) => (
                  <div key={item.grade} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
                    <dt className="text-sm font-semibold text-ink-muted">{item.grade}</dt>
                    <dd className="text-ink">{item.focus}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {(content.after_high_school ?? []).length > 0 && (
            <div>
              <h3 className="font-semibold text-ink">After high school</h3>
              <ul className="mt-2 space-y-2">
                {content.after_high_school!.map((item) => (
                  <li key={item.route}>
                    <span className="font-medium text-ink">{item.route}: </span>
                    <span className="text-ink-muted">{item.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(content.skills ?? []).length > 0 && (
            <div>
              <h3 className="font-semibold text-ink">Skills to build</h3>
              <ul className="mt-2 space-y-2">
                {content.skills!.map((item) => (
                  <li key={item.skill}>
                    <span className="font-medium text-ink">{item.skill}: </span>
                    <span className="text-ink-muted">{item.how}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {content.based_on && <p className="text-sm text-ink-muted">How this plan was made: {content.based_on}</p>}
          {(content.grounding?.removed.length ?? 0) > 0 && (
            <p className="text-sm text-ink-muted">We left out a figure we couldn&apos;t verify. Your school counselor can help with current numbers.</p>
          )}
        </div>
      </details>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit your next steps">
        <div className="space-y-3">
          {(editing ?? []).map((step, index) => (
            <div key={index} className="flex gap-2">
              <TextInput
                aria-label={`Step ${index + 1}`}
                value={step.title}
                maxLength={90}
                onChange={(event) =>
                  setEditing((items) => items!.map((item, itemIndex) => (itemIndex === index ? { ...item, title: event.target.value } : item)))
                }
              />
              <button
                type="button"
                aria-label={`Remove step ${index + 1}`}
                onClick={() => setEditing((items) => items!.filter((_, itemIndex) => itemIndex !== index))}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </div>
          ))}
          {(editing?.length ?? 0) < 5 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus aria-hidden className="size-4" />}
              onClick={() => setEditing((items) => [...(items ?? []), { title: "", why: "" }])}
            >
              Add a step
            </Button>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await onSaveSteps((editing ?? []).filter((step) => step.title.trim()));
                setBusy(false);

                if (ok) {
                  setEditing(null);
                }
              }}
            >
              Save steps
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
