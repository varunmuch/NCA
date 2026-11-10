"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Compass,
  Download,
  Flag,
  GraduationCap,
  Heart,
  Layers,
  Lightbulb,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Save,
  Signpost,
  Target,
  Trash2,
} from "lucide-react";

import { Badge, Card } from "@/components/ui/Card";
import { askCounselor } from "@/lib/counselor-events";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { InlineNote } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { PlanClarify, PlanDetail, PlanMilestone, PlanStep, ProgressStatus } from "@/types/cie";

import { GeneratingPlan } from "./PlanGenerator";
import { SimplePlan } from "./SimplePlan";

const REVISION_IDEAS = [
  "Show me cheaper colleges closer to home",
  "Add more AP classes",
  "Give me colleges I'm more likely to get into",
  "Make my steps more hands-on",
  "Include more options for after high school",
];

function Section({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-softer text-primary">{icon}</span>
        <h2 className="font-bold text-ink">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function TitledList({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.title}>
          <p className="font-semibold text-ink">{item.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{item.body}</p>
        </li>
      ))}
    </ul>
  );
}

function CheckButton({
  done,
  disabled,
  onToggle,
  label,
}: {
  done: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50 ${
        done ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface hover:border-accent"
      }`}
    >
      {done && <Check aria-hidden className="size-4" />}
    </button>
  );
}

export function PlanWorkspace({ initial, initialTab }: { initial: PlanDetail; initialTab?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [plan, setPlan] = useState(initial);
  const [busy, setBusy] = useState<"" | "save" | "revise" | "delete" | "edit">("");
  const [taskBusy, setTaskBusy] = useState<number | null>(null);
  const [reviseOpen, setReviseOpen] = useState<"" | "revise" | "goal">("");
  const [instruction, setInstruction] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [clarify, setClarify] = useState<PlanClarify["clarify"] | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draftMilestones, setDraftMilestones] = useState<PlanMilestone[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const content = plan.content;
  const saved = plan.status === "saved";
  // Plans written since Phase 5 use the simpler layout.
  const isSimple = content.schema === 2;

  async function savePlan() {
    setBusy("save");

    try {
      setPlan(await api.savePlan(plan.id));
      toast("Plan saved. You can now check off your milestones here.");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save the plan.", "error");
    } finally {
      setBusy("");
    }
  }

  async function revise() {
    setBusy("revise");
    setReviseOpen("");

    try {
      const next = await api.revisePlan(plan.id, {
        instruction: instruction.trim(),
        career_goal: newGoal.trim(),
      });

      // Too vague to act on: the counselor asks what to change.
      if ("clarify" in next) {
        setClarify(next.clarify);
        setBusy("");
        setReviseOpen("revise");
        return;
      }

      setClarify(null);
      setInstruction("");
      setNewGoal("");
      toast(
        next.status === "saved"
          ? `Updated My Path (version ${next.version}). See what changed at the top.`
          : `Version ${next.version} is ready. See what changed, then save if you like it.`
      );
      router.push(`/plan/${next.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't revise the plan.", "error");
      setBusy("");
    }
  }

  async function toggleTask(taskId: number | undefined) {
    if (!taskId) {
      return;
    }

    const current = plan.task_status[String(taskId)];
    const next: ProgressStatus = current === "done" ? "not_started" : "done";
    setTaskBusy(taskId);

    try {
      await api.updateTask(taskId, { status: next });
      setPlan((value) => ({ ...value, task_status: { ...value.task_status, [String(taskId)]: next } }));

      if (next === "done") {
        toast("Nice work! Step completed.");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update that step.", "error");
    } finally {
      setTaskBusy(null);
    }
  }

  async function saveMilestones() {
    setBusy("edit");

    try {
      const updated = await api.updatePlan(plan.id, {
        short_term_milestones: draftMilestones.filter((item) => item.title.trim()),
      });
      setPlan(updated);
      setEditOpen(false);
      toast("Milestones updated");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update milestones.", "error");
    } finally {
      setBusy("");
    }
  }

  async function saveSteps(steps: PlanStep[]) {
    try {
      setPlan(await api.updatePlan(plan.id, { next_steps: steps }));
      toast("Steps updated");
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update your steps.", "error");
      return false;
    }
  }

  async function deletePlan() {
    setBusy("delete");

    try {
      await api.deletePlan(plan.id);
      toast("Plan version deleted");
      router.push("/plan");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't delete the plan.", "error");
      setBusy("");
    }
  }

  if (busy === "revise") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <GeneratingPlan label="Revising your plan" />
      </div>
    );
  }

  const milestones = content.short_term_milestones ?? [];
  const actionTaskIds = content.next_action_task_ids ?? [];
  const doneCount = milestones.filter((item) => plan.task_status[String(item.task_id)] === "done").length;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/plan" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> All plans
        </Link>
        {plan.versions.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="version" className="text-sm text-ink-muted">
              Version
            </label>
            <Select
              id="version"
              value={plan.id}
              onChange={(event) => router.push(`/plan/${event.target.value}`)}
              className="h-9 w-auto py-0 text-sm"
            >
              {plan.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version} · {version.status === "saved" ? "Saved" : "Draft"} · {formatDate(version.created_at)}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <header className="on-navy sticker relative overflow-hidden rounded-[var(--radius-hero)] bg-navy p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={saved ? "accent" : "sun"}>{saved ? "Saved" : "Draft"}</Badge>
          <Badge>Version {plan.version}</Badge>
          <span className="text-sm text-white/70">Created {formatDate(plan.created_at)}</span>
        </div>
        <h1 className="font-display mt-3 text-[2rem] font-semibold leading-tight text-white sm:text-[2.5rem]">{plan.title}</h1>
        <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-white/85">{content.career_direction}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {!saved && (
            <Button onClick={savePlan} loading={busy === "save"} icon={<Save aria-hidden className="size-4" />}>
              Save plan
            </Button>
          )}
          {/* Changes happen in conversation with the counselor, right here. */}
          <Button
            variant="primary"
            onClick={() => askCounselor("I'd like to change something in My Path.")}
            icon={<MessageCircle aria-hidden className="size-4" />}
          >
            Change it with your counselor
          </Button>
          <Button variant="secondary" onClick={() => setReviseOpen("goal")} icon={<Target aria-hidden className="size-4" />}>
            Change career goal
          </Button>
          <a href={api.planPdfUrl(plan.id)} download className={buttonClass("secondary")}>
            <Download aria-hidden className="size-4" /> Download PDF
          </a>
          <Button variant="ghost" onClick={() => setDeleteOpen(true)} icon={<Trash2 aria-hidden className="size-4" />}>
            <span className="sr-only sm:not-sr-only">Delete</span>
          </Button>
        </div>
      </header>

      {!saved && (
        <InlineNote>
          This is a draft. Read it over, ask for changes, and <strong>save</strong> it when it feels right. Saving turns your next steps into a checklist on this page.
        </InlineNote>
      )}

      {isSimple ? (
        <SimplePlan plan={plan} initialTab={initialTab} saved={saved} taskBusy={taskBusy} onToggle={toggleTask} onSaveSteps={saveSteps} />
      ) : (
        <>
      <section aria-labelledby="next-actions" className="rounded-[var(--radius-card)] bg-ink p-6 text-canvas shadow-[var(--shadow-raised)] sm:p-7">
        <h2 id="next-actions" className="text-xs font-semibold text-canvas/70">
          My next three actions
        </h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {content.next_three_actions.map((action, index) => {
            const taskId = actionTaskIds[index];
            const done = Boolean(taskId) && plan.task_status[String(taskId)] === "done";

            return (
              <li key={action} className="flex gap-3 rounded-2xl bg-canvas/8 p-4 ring-1 ring-canvas/10">
                {saved && taskId ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={`Mark "${action}" ${done ? "not done" : "done"}`}
                    disabled={taskBusy === taskId}
                    onClick={() => toggleTask(taskId)}
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
                      done ? "border-accent bg-accent" : "border-canvas/40 hover:border-canvas"
                    }`}
                  >
                    {done && <Check aria-hidden className="size-4" />}
                  </button>
                ) : (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-canvas/15 text-sm font-bold">{index + 1}</span>
                )}
                <p className={`pt-0.5 leading-relaxed ${done ? "text-canvas/60 line-through" : ""}`}>{action}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="My interests and strengths" icon={<Heart aria-hidden className="size-4" />}>
          <ul className="flex flex-wrap gap-2">
            {content.interests_and_strengths.map((item) => (
              <li key={item} className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Careers I'm exploring" icon={<Compass aria-hidden className="size-4" />}>
          <ul className="space-y-3">
            {content.careers_exploring.map((career) => (
              <li key={career.title}>
                {career.slug ? (
                  <Link href={`/explore/${career.slug}`} className="font-semibold text-primary hover:underline">
                    {career.title}
                  </Link>
                ) : (
                  <p className="font-semibold text-ink">{career.title}</p>
                )}
                <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{career.why}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="School subjects that matter" icon={<BookOpen aria-hidden className="size-4" />}>
          <TitledList items={content.academic_subjects.map((item) => ({ title: item.subject, body: item.why }))} />
        </Section>

        <Section title="Skills to develop" icon={<Target aria-hidden className="size-4" />}>
          <TitledList items={content.skills_to_develop.map((item) => ({ title: item.skill, body: item.how }))} />
        </Section>

        <Section title="Projects and activities" icon={<Layers aria-hidden className="size-4" />}>
          <TitledList items={content.projects_and_activities.map((item) => ({ title: item.title, body: item.description }))} />
        </Section>

        <Section title="Learning opportunities" icon={<Lightbulb aria-hidden className="size-4" />}>
          <TitledList items={content.learning_opportunities.map((item) => ({ title: item.title, body: item.description }))} />
        </Section>
      </div>

      <Section title="High school roadmap" icon={<Route aria-hidden className="size-4" />}>
        <ol className="relative space-y-6 pl-8 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-0.5 before:bg-line">
          {content.high_school_roadmap.map((stage, index) => (
            <li key={`${stage.period}-${index}`} className="relative">
              <span className="absolute -left-8 top-0.5 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary ring-4 ring-surface">
                {index + 1}
              </span>
              <p className="text-sm font-semibold text-primary">{stage.period}</p>
              <p className="font-bold text-ink">{stage.focus}</p>
              <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                {stage.steps.map((step) => (
                  <li key={step} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-soft" />
                    {step}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Education and training pathways" icon={<GraduationCap aria-hidden className="size-4" />}>
          <TitledList items={content.education_pathways.map((item) => ({ title: item.path, body: item.description }))} />
        </Section>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary-softer text-primary">
                <Flag aria-hidden className="size-4" />
              </span>
              <h2 className="font-bold">Short-term milestones</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setDraftMilestones(milestones.map((item) => ({ ...item })));
                setEditOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-softer"
            >
              <Pencil aria-hidden className="size-3.5" /> Edit
            </button>
          </div>
          {saved && milestones.length > 0 && (
            <p className="mt-2 text-sm text-ink-muted">
              {doneCount} of {milestones.length} complete
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {milestones.map((milestone) => {
              const done = plan.task_status[String(milestone.task_id)] === "done";

              return (
                <li key={milestone.id} className="flex gap-3 rounded-2xl border border-line p-3.5">
                  {saved && milestone.task_id ? (
                    <CheckButton
                      done={done}
                      disabled={taskBusy === milestone.task_id}
                      onToggle={() => toggleTask(milestone.task_id)}
                      label={`Mark "${milestone.title}" ${done ? "not done" : "done"}`}
                    />
                  ) : (
                    <span aria-hidden className="mt-1 size-5 shrink-0 rounded-full border-2 border-dashed border-line-strong" />
                  )}
                  <div className="min-w-0">
                    <p className={`font-semibold ${done ? "text-ink-muted line-through" : "text-ink"}`}>{milestone.title}</p>
                    {milestone.description && <p className="mt-0.5 text-sm text-ink-muted">{milestone.description}</p>}
                    {milestone.timeframe && <Badge className="mt-2">{milestone.timeframe}</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Section title="Long-term goals" icon={<Signpost aria-hidden className="size-4" />}>
          <ul className="space-y-2">
            {content.long_term_goals.map((goal) => (
              <li key={goal} className="flex gap-2.5 text-ink">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                {goal}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Other paths worth knowing about" icon={<Compass aria-hidden className="size-4" />}>
          <TitledList items={content.alternative_pathways.map((item) => ({ title: item.title, body: item.description }))} />
        </Section>
      </div>

      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold">Go deeper with your counselor</h2>
          <p className="mt-1 text-sm text-ink-muted">Get a skill check, project idea, or interview practice for this plan.</p>
        </div>
        <ButtonLink
          href={`/counselor?ask=${encodeURIComponent(`Let's talk about my plan "${plan.title}". What should I focus on first?`)}`}
          variant="soft"
          icon={<MessageCircle aria-hidden className="size-4" />}
        >
          Talk it through
        </ButtonLink>
      </Card>
        </>
      )}

      {!isSimple && content.based_on && <p className="text-sm text-ink-muted">How this plan was made: {content.based_on}</p>}
      <p className="text-xs text-ink-muted">
        This plan was drafted by an AI counselor from what you&apos;ve shared. Review it with a school counselor or trusted adult before big decisions.
      </p>

      <Dialog
        open={Boolean(reviseOpen)}
        onClose={() => setReviseOpen("")}
        title={reviseOpen === "goal" ? "Change career goal" : "Revise with AI"}
        description="Say what to change: colleges, classes, steps, your major or goal. Your counselor changes exactly that and keeps the rest. This version stays in your history."
      >
        <div className="space-y-4">
          {reviseOpen === "goal" && (
            <Field label="New career goal" htmlFor="new-goal" hint="Or describe a direction, like “something with animals”.">
              <TextInput id="new-goal" value={newGoal} onChange={(event) => setNewGoal(event.target.value)} autoFocus maxLength={200} />
            </Field>
          )}
          {clarify && reviseOpen === "revise" && (
            <div className="rounded-xl border border-sun/30 bg-sun-soft/50 p-3.5" role="status">
              <p className="text-sm font-semibold text-ink">{clarify.question}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {clarify.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setInstruction(option);
                      setClarify(null);
                    }}
                    className="rounded-full border border-sun/40 bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-sun-soft"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Field label={reviseOpen === "goal" ? "Anything else? (optional)" : "What should change?"} htmlFor="instruction">
            <TextArea id="instruction" rows={3} value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={1000} />
          </Field>
          {reviseOpen === "revise" && !clarify && (
            <div className="flex flex-wrap gap-2">
              {REVISION_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setInstruction(idea)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:border-primary/30 hover:bg-primary-softer hover:text-primary-ink"
                >
                  {idea}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setReviseOpen("")}>
              Cancel
            </Button>
            <Button
              onClick={revise}
              disabled={reviseOpen === "goal" ? !newGoal.trim() : !instruction.trim()}
              icon={<RefreshCw aria-hidden className="size-4" />}
            >
              Create new version
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit milestones">
        <div className="space-y-4">
          {draftMilestones.map((milestone, index) => (
            <div key={milestone.id} className="rounded-2xl border border-line p-3">
              <div className="flex gap-2">
                <TextInput
                  aria-label={`Milestone ${index + 1} title`}
                  value={milestone.title}
                  onChange={(event) =>
                    setDraftMilestones((items) =>
                      items.map((item, itemIndex) => (itemIndex === index ? { ...item, title: event.target.value } : item))
                    )
                  }
                  maxLength={100}
                />
                <button
                  type="button"
                  aria-label={`Remove milestone ${index + 1}`}
                  onClick={() => setDraftMilestones((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </div>
              <TextInput
                aria-label={`Milestone ${index + 1} timeframe`}
                value={milestone.timeframe}
                placeholder="When? (optional)"
                onChange={(event) =>
                  setDraftMilestones((items) =>
                    items.map((item, itemIndex) => (itemIndex === index ? { ...item, timeframe: event.target.value } : item))
                  )
                }
                className="mt-2"
                maxLength={40}
              />
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus aria-hidden className="size-4" />}
            onClick={() =>
              setDraftMilestones((items) => [
                ...items,
                { id: `new-${Date.now()}`, title: "", description: "", timeframe: "" },
              ])
            }
          >
            Add milestone
          </Button>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveMilestones} loading={busy === "edit"}>
              Save changes
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this version?"
        description="Other versions of this plan stay."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={deletePlan} loading={busy === "delete"}>
            Delete version
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
