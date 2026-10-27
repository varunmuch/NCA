"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextInput } from "@/components/ui/Field";
import { surveyNote } from "@/lib/education";
import type { PlanDetail, PlanStep } from "@/types/cie";

import { BrightFuturesCard } from "@/components/college/BrightFuturesCard";

import { PlanPathway } from "./PlanPathway";

type TabKey = "month" | "school" | "college" | "certs" | "careers";

const TABS: { key: TabKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "school", label: "Classes" },
  { key: "college", label: "Major, colleges & scholarships" },
  { key: "certs", label: "Certifications & skills" },
  { key: "careers", label: "Careers" },
];

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

  const pathway = content.pathway;
  const [tab, setTab] = useState<TabKey>("month");
  return (
    <div className="space-y-8">
      <div role="tablist" aria-label="Your path" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
        {TABS.filter((item) => item.key !== "careers" || careers.length > 0).map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`panel-${item.key}`}
            onClick={() => setTab(item.key)}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
              tab === item.key ? "border-primary text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "month" && (
        <div role="tabpanel" id="panel-month" aria-labelledby="tab-month" className="space-y-6">
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

          {(content.this_year ?? []).length > 0 && (
            <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-7">
              <h2 className="text-lg font-bold text-ink">The rest of this year</h2>
              <div className="mt-4 space-y-5">
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
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "school" && (
        <div role="tabpanel" id="panel-school" aria-labelledby="tab-school" className="space-y-6">
          {pathway && <PlanPathway pathway={pathway} only={["courses"]} bare />}
          {(content.high_school ?? []).length > 0 && (
            <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-7">
              <h2 className="text-lg font-bold text-ink">Your focus each year</h2>
              <dl className="mt-4 space-y-3">
                {content.high_school!.map((item) => (
                  <div key={item.grade} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
                    <dt className="text-sm font-semibold text-ink-muted">{item.grade}</dt>
                    <dd className="text-ink">{item.focus}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      )}

      {tab === "college" && (
        <div role="tabpanel" id="panel-college" aria-labelledby="tab-college" className="space-y-6">
          {pathway?.summary && <p className="leading-relaxed text-ink-muted">{pathway.summary}</p>}
          {pathway?.major_minor && (
            <section className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-gradient-to-br from-primary-softer via-white to-pink-soft p-5 sm:grid-cols-2 sm:p-6">
              <div>
                <p className="text-xs font-semibold text-primary">Your major</p>
                <p className="font-display text-xl font-semibold text-ink">{pathway.major_minor.major.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{pathway.major_minor.why_major}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-pink">Your minor</p>
                <p className="font-display text-xl font-semibold text-ink">{pathway.major_minor.minor.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{pathway.major_minor.why_minor}</p>
              </div>
              <Link href="/discover" className="text-sm font-semibold text-primary hover:underline sm:col-span-2">
                See all three major and minor options
              </Link>
            </section>
          )}
          {pathway && <PlanPathway pathway={pathway} only={["majors", "colleges"]} bare />}
          {pathway?.bright_futures && <BrightFuturesCard data={pathway.bright_futures} />}
          {(content.after_high_school ?? []).length > 0 && (
            <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-7">
              <h2 className="text-lg font-bold text-ink">Other routes after high school</h2>
              <ul className="mt-4 space-y-2.5">
                {content.after_high_school!.map((item) => (
                  <li key={item.route}>
                    <span className="font-medium text-ink">{item.route}: </span>
                    <span className="text-ink-muted">{item.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "certs" && (
        <div role="tabpanel" id="panel-certs" aria-labelledby="tab-certs" className="space-y-6">
          {pathway && <PlanPathway pathway={pathway} only={["certifications"]} bare />}
          {(content.skills ?? []).length > 0 && (
            <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-7">
              <h2 className="text-lg font-bold text-ink">Skills to build</h2>
              <ul className="mt-4 space-y-2.5">
                {content.skills!.map((item) => (
                  <li key={item.skill}>
                    <span className="font-medium text-ink">{item.skill}: </span>
                    <span className="text-ink-muted">{item.how}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "careers" && (
        <div role="tabpanel" id="panel-careers" aria-labelledby="tab-careers">
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
                          <dd className="text-ink-muted">Typical start: {career.education}</dd>
                        </div>
                      )}
                      {surveyNote(career.education, career.education_survey?.levels, career.education_survey?.small_sample) && (
                        <div>
                          <dt className="sr-only">What workers report</dt>
                          <dd className="text-ink">{surveyNote(career.education, career.education_survey?.levels, career.education_survey?.small_sample)}</dd>
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
        </div>
      )}

      {(content.based_on || (content.grounding?.removed.length ?? 0) > 0) && (
        <div className="space-y-1 text-sm text-ink-muted">
          {content.based_on && <p>How this plan was made: {content.based_on}</p>}
          {(content.grounding?.removed.length ?? 0) > 0 && (
            <p>We left out a figure we couldn&apos;t verify. Your school counselor can help with current numbers.</p>
          )}
        </div>
      )}


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
