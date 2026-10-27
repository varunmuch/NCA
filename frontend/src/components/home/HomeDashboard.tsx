"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CircleCheck, CircleDashed, Map as MapIcon, Sparkles } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { HomeRecord, HomeSummary } from "@/types/cie";

import { AgentActivity } from "./AgentActivity";
import { CareerScene3D } from "./CareerScene3D";

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
    <section aria-labelledby="this-week-title" className="rounded-[var(--radius-card)] border border-teal/25 bg-gradient-to-br from-teal-soft to-sky-soft p-6 sm:p-7">
      <p className="text-sm font-semibold text-teal">Your step this week</p>
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
    <section aria-labelledby="since-title" className="rounded-[var(--radius-card)] border border-accent/20 bg-accent-softer px-5 py-4">
      <h2 id="since-title" className="text-sm font-semibold text-accent-ink">
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
    <section
      aria-labelledby="next-step-title"
      className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-7"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-primary via-pink to-sun" />
      <p className="text-sm font-semibold text-pink">Your next step</p>
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

const MISSING_HREF: Record<string, string> = {
  transcript: "/profile#documents",
  resume: "/profile#documents",
  resume_more: "/profile#documents",
  quiz: "/discover",
  tests: "/profile",
  hours: "/profile",
};

function Hero({ home }: { home: HomeSummary }) {
  const record = home.record;
  const chips = record
    ? [
        record.gpa_unweighted != null && { label: "GPA", value: record.gpa_unweighted.toFixed(2), tone: "text-primary" },
        record.riasec && { label: "Type", value: record.riasec, tone: "text-sun-ink" },
        record.major && { label: "Major", value: record.major, tone: "text-pink" },
        (record.tests.sat || record.tests.act) && {
          label: record.tests.sat ? "SAT" : "ACT",
          value: String(record.tests.sat ?? record.tests.act),
          tone: "text-teal",
        },
      ].filter(Boolean)
    : [];

  return (
    <header className="relative overflow-hidden rounded-[var(--radius-hero)] border border-line bg-gradient-to-br from-primary-softer via-white to-pink-soft px-6 py-7 sm:px-9 sm:py-8">
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <div className="w-full sm:max-w-md">
          <h1 className="font-display text-[2rem] font-semibold leading-tight text-ink sm:text-[2.5rem]">
            {greeting()}
            {home.name ? `, ${home.name}` : ""}.
          </h1>
          {home.grade_level && (
            <p className="mt-2 inline-flex rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-primary-ink ring-1 ring-primary/15">
              {home.grade_level}
            </p>
          )}
          {chips.length > 0 ? (
            <dl className="mt-4 flex flex-wrap gap-2">
              {(chips as { label: string; value: string; tone: string }[]).map((chip) => (
                <div key={chip.label} className="rounded-xl bg-white/85 px-3 py-1.5 ring-1 ring-line">
                  <dt className="text-[11px] font-semibold text-ink-muted">{chip.label}</dt>
                  <dd className={`max-w-[14rem] truncate text-sm font-bold ${chip.tone}`}>{chip.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 max-w-sm leading-relaxed text-ink-muted">Every career starts with one small step. Here&apos;s yours.</p>
          )}
        </div>
        <CareerScene3D className="shrink-0 max-sm:-my-4" />
      </div>
    </header>
  );
}

function ProfileCard({ record }: { record: HomeRecord }) {
  const missing = record.missing.slice(0, 3);
  const total = 5;
  const done = total - Math.min(total, record.missing.filter((item) => item.key !== "resume_more").length);

  return (
    <section aria-labelledby="profile-card-title" className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="profile-card-title" className="font-semibold text-ink">
          Your profile
        </h2>
        <span className="text-sm font-semibold tabular-nums text-primary">
          {done}/{total}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-gradient-to-r from-primary via-pink to-teal" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      {missing.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {missing.map((item) => (
            <li key={item.key}>
              <Link href={MISSING_HREF[item.key] ?? "/profile"} className="group flex gap-2.5">
                <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-soft group-hover:text-primary" />
                <span>
                  <span className="block text-sm font-semibold text-ink group-hover:text-primary">{item.label}</span>
                  <span className="block text-xs leading-relaxed text-ink-muted">{item.why}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-accent-ink">
          <CircleCheck aria-hidden className="size-4" /> Your counselor has everything it needs.
        </p>
      )}

      <p className="mt-auto pt-4 text-xs text-ink-muted">
        Resume: {record.resume_done} of {record.resume_total} sections
        {record.service_hours != null ? ` · ${record.service_hours} service hours` : ""}
        {record.advanced_courses ? ` · ${record.advanced_courses} advanced courses` : ""}
      </p>
      <Link href="/profile" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        Open my profile <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}

const BRIGHT_TONE = { on_track: "bg-accent-soft text-accent-ink", not_yet: "bg-pink-soft text-pink", unknown: "bg-surface-2 text-ink-muted" } as const;
const BRIGHT_TEXT = { on_track: "on track", not_yet: "not yet", unknown: "needs info" } as const;

function PathCard({ home }: { home: HomeSummary }) {
  const plan = home.plan;
  const record = home.record;
  // The weekly step is shown above; list only the others.
  const steps = (plan?.next_three_actions ?? []).filter((action) => action !== home.this_week?.title);

  return (
    <section aria-labelledby="path-card-title" className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="path-card-title" className="font-semibold text-ink">
          My Path
        </h2>
        {plan && (
          <Link href={`/plan/${plan.id}`} className="text-sm font-semibold text-primary hover:underline">
            Open
          </Link>
        )}
      </div>

      {record?.major && (
        <div className="mt-3 rounded-xl bg-gradient-to-br from-primary-softer to-pink-soft px-4 py-3">
          <p className="text-[11px] font-semibold text-ink-muted">Major and minor</p>
          <p className="text-sm font-semibold leading-snug text-ink">{record.major}</p>
          {record.minor && <p className="text-sm text-pink">Minor: {record.minor}</p>}
        </div>
      )}

      {plan ? (
        steps.length > 0 && (
          <ol className="mt-4 space-y-2.5">
            {steps.map((action, index) => (
              <li key={action} className="flex gap-2.5 text-sm text-ink">
                <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${["bg-primary", "bg-pink", "bg-teal"][index % 3]}`}>
                  {index + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        )
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          One plan with your major and minor, classes to take, colleges with your chances, and scholarships.
        </p>
      )}

      {record && record.bright_futures.levels.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-ink-muted">Bright Futures:</span>
          {record.bright_futures.levels.map((level) => (
            <span key={level.name} className={`rounded-full px-2 py-0.5 font-semibold ${BRIGHT_TONE[level.status]}`}>
              {level.name.split(" (")[1]?.replace(")", "") ?? level.name} {BRIGHT_TEXT[level.status]}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-5">
        {plan ? (
          <ButtonLink href={`/plan/${plan.id}`} variant="soft" size="sm" icon={<MapIcon aria-hidden className="size-4" />}>
            See colleges and scholarships
          </ButtonLink>
        ) : (
          <ButtonLink href="/plan?generate=1" size="sm" icon={<Sparkles aria-hidden className="size-4" />}>
            Build My Path
          </ButtonLink>
        )}
      </div>
    </section>
  );
}

function ContinueList({ home }: { home: HomeSummary }) {
  const rows: { key: string; label: string; title: string; href: string; meta?: string; tone: string }[] = [];
  const conversation = home.latest_conversation;

  if (conversation) {
    rows.push({
      key: `chat-${conversation.id}`,
      label: "Conversation",
      title: conversation.title,
      href: `/counselor/${conversation.id}`,
      meta: timeAgo(conversation.updated_at),
      tone: "text-primary",
    });
  }

  for (const career of home.careers.filter((item) => item.saved).slice(0, 3)) {
    rows.push({ key: `career-${career.slug}`, label: "Saved career", title: career.title, href: `/explore/${career.slug}`, tone: "text-pink" });
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
            <Link href={row.href} className="group flex items-center gap-4 px-5 py-3.5 hover:bg-primary-softer">
              <span className={`w-28 shrink-0 text-sm font-medium max-sm:w-24 ${row.tone}`}>{row.label}</span>
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
  // When the next step is the plan's weekly task, show it once, checkable.
  const weekly = Boolean(home.this_week && home.next_step.kind === "task");

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <Hero home={home} />
      <SinceLastTime home={home} />
      {weekly ? <ThisWeek home={home} /> : <NextStep home={home} />}
      <AgentActivity />
      <div className="grid gap-5 md:grid-cols-2">
        {home.record && <ProfileCard record={home.record} />}
        <PathCard home={home} />
      </div>
      <ContinueList home={home} />
    </div>
  );
}
