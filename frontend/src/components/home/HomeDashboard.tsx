"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CircleAlert, CircleCheck, FileText, Loader2 } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { HomeDocument, HomeSummary } from "@/types/cie";

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  return hour < 18 ? "Good afternoon" : "Good evening";
}

/** One step from the saved plan, checkable right here. */
function ThisWeek({ home }: { home: HomeSummary }) {
  const step = home.this_week;
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!step) {
    return null;
  }

  return (
    <section aria-labelledby="this-week-title" className="rounded-[var(--radius-card)] border border-primary/25 bg-primary-softer p-6 sm:p-7">
      <p className="text-sm font-semibold text-primary">Your step this week</p>
      <div className="mt-2 flex items-start gap-4">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`Mark "${step.title}" ${done ? "not done" : "done"}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);

            try {
              await api.updateTask(step.id, { status: done ? "not_started" : "done" });
              setDone(!done);
            } finally {
              setBusy(false);
            }
          }}
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50 ${
            done ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface hover:border-accent"
          }`}
        >
          {done && <Check aria-hidden className="size-4" />}
        </button>
        <div>
          <h2 id="this-week-title" className={`text-lg font-semibold leading-snug ${done ? "text-ink-muted line-through" : "text-ink"}`}>
            {step.title}
          </h2>
          <p className="mt-1 text-sm text-ink-muted" role="status">
            {done ? "Nice work. Your next step will be here when you come back." : "Tap the circle when it's done."}
          </p>
        </div>
      </div>
    </section>
  );
}

/** What changed since the last visit, from the student's own records. */
function SinceLastTime({ home }: { home: HomeSummary }) {
  const since = home.since_last_time;

  if (!since || since.items.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="since-title" className="rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4">
      <h2 id="since-title" className="text-sm font-semibold text-ink-muted">
        Since you were last here ({timeAgo(since.since)})
      </h2>
      <ul className="mt-2 space-y-1">
        {since.items.map((item) => (
          <li key={item} className="flex gap-2 text-[15px] text-ink">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The one thing to do next, chosen by the backend from the student's records. */
function NextStep({ home }: { home: HomeSummary }) {
  const step = home.next_step;

  return (
    <section aria-labelledby="next-step-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-7">
      <p className="text-sm font-medium text-ink-muted">Your next step</p>
      <h2 id="next-step-title" className="mt-1 text-xl font-semibold leading-snug text-ink sm:text-2xl">
        {step.title}
      </h2>
      <p className="mt-2 max-w-xl leading-relaxed text-ink-muted">{step.description}</p>
      <ButtonLink href={step.href} className="mt-5" icon={<ArrowRight aria-hidden className="size-4" />}>
        {step.cta}
      </ButtonLink>
    </section>
  );
}

function PlanSteps({ home }: { home: HomeSummary }) {
  const plan = home.plan;

  if (!plan || plan.next_three_actions.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="plan-steps-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="plan-steps-title" className="font-semibold text-ink">
          From your plan
        </h2>
        <Link href={`/plan/${plan.id}`} className="text-sm font-medium text-primary hover:underline">
          Open my plan
        </Link>
      </div>
      <ol className="mt-3 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {plan.next_three_actions.map((action, index) => (
          <li key={action} className="flex gap-3 px-5 py-3.5">
            <span className="w-4 shrink-0 text-sm font-semibold tabular-nums text-ink-soft">{index + 1}</span>
            <span className="text-ink">{action}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const DOCUMENT_KINDS = [
  { key: "resume", label: "Resume" },
  { key: "transcript", label: "Transcript" },
] as const;

function DocumentStatusPill({ document }: { document: HomeDocument | null }) {
  if (!document) {
    return <span className="text-sm text-ink-soft">Not added</span>;
  }

  if (document.status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Reading…
      </span>
    );
  }

  if (document.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-warm-ink">
        <CircleAlert aria-hidden className="size-4" /> Couldn&apos;t read
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">
      <CircleCheck aria-hidden className="size-4" /> On file
    </span>
  );
}

function DocumentsStrip({ home }: { home: HomeSummary }) {
  const documents = home.documents ?? { resume: null, transcript: null };
  const missing = DOCUMENT_KINDS.filter((kind) => !documents[kind.key]).length;

  return (
    <section
      aria-labelledby="documents-title"
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:gap-8"
    >
      <div className="flex items-center gap-3 sm:w-56 sm:shrink-0">
        <FileText aria-hidden className="size-5 text-ink-muted" />
        <div>
          <h2 id="documents-title" className="font-semibold text-ink">
            My documents
          </h2>
          <p className="text-xs text-ink-muted">
            {missing ? "Your counselor uses these to tailor advice" : "Your counselor is using these"}
          </p>
        </div>
      </div>

      <ul className="grid flex-1 gap-2 sm:grid-cols-2 sm:gap-6">
        {DOCUMENT_KINDS.map((kind) => {
          const document = documents[kind.key];

          return (
            <li key={kind.key} className="flex items-center justify-between gap-3 border-line sm:border-l sm:pl-6">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{kind.label}</p>
                {document && <p className="truncate text-xs text-ink-muted">{document.filename}</p>}
              </div>
              <DocumentStatusPill document={document} />
            </li>
          );
        })}
      </ul>

      <Link href="/documents" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
        {missing ? "Add" : "Manage"} <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}

type ContinueRow = { key: string; label: string; title: string; href: string; meta?: string };

function ContinueList({ home }: { home: HomeSummary }) {
  const rows: ContinueRow[] = [];
  const conversation = home.latest_conversation;

  if (conversation) {
    rows.push({
      key: `chat-${conversation.id}`,
      label: "Conversation",
      title: conversation.title,
      href: `/counselor/${conversation.id}`,
      meta: timeAgo(conversation.updated_at),
    });
  }

  for (const roadmap of home.roadmaps.slice(0, 2)) {
    rows.push({ key: `roadmap-${roadmap.slug}`, label: "Roadmap", title: roadmap.title, href: `/explore/${roadmap.slug}#roadmap` });
  }

  for (const career of home.careers.slice(0, 3)) {
    rows.push({
      key: `career-${career.slug}`,
      label: career.saved ? "Saved career" : "Career to explore",
      title: career.title,
      href: `/explore/${career.slug}`,
    });
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="continue-title">
      <h2 id="continue-title" className="font-semibold text-ink">
        Pick up where you left off
      </h2>
      <ul className="mt-3 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {rows.map((row) => (
          <li key={row.key}>
            <Link href={row.href} className="group flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2">
              <span className="w-32 shrink-0 text-sm text-ink-muted max-sm:w-24">{row.label}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{row.title}</span>
              {row.meta && <span className="hidden text-sm text-ink-soft sm:inline">{row.meta}</span>}
              <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-soft group-hover:text-ink" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeDashboard({ home }: { home: HomeSummary }) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-[2rem] font-semibold leading-tight text-ink sm:text-[2.5rem]">
          {greeting()}
          {home.name ? `, ${home.name}` : ""}.
        </h1>
        {home.grade_level && <p className="mt-1 text-ink-muted">{home.grade_level}</p>}
      </header>

      <SinceLastTime home={home} />
      <ThisWeek home={home} />
      {/* The weekly step already is the next step when it comes from the plan. */}
      {!(home.this_week && home.next_step.kind === "task") && <NextStep home={home} />}
      <PlanSteps home={home} />
      <DocumentsStrip home={home} />
      <ContinueList home={home} />
    </div>
  );
}
