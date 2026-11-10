"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, CircleDashed, Map as MapIcon, Sparkles } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import { timeAgo } from "@/lib/format";
import type { HomeRecord, HomeSummary } from "@/types/cie";

import { AgentActivity } from "./AgentActivity";
import { CareerJourney } from "./CareerJourney";
import { CareerScene3D } from "./CareerScene3D";

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  return hour < 18 ? "Good afternoon" : "Good evening";
}

/** The one thing to do next, chosen by the backend from the student's records. */
function NextStep({ home }: { home: HomeSummary }) {
  const step = home.next_step;

  return (
    <section
      aria-labelledby="next-step-title"
      className="sticker relative overflow-hidden rounded-[var(--radius-card)] bg-primary p-6 text-white sm:p-7"
    >
      <span aria-hidden className="absolute right-6 top-6 size-5 rotate-12 rounded-md bg-sunny" />
      <span aria-hidden className="absolute right-16 top-14 size-3 rounded-full bg-pink-soft" />
      <span aria-hidden className="absolute bottom-8 right-10 size-4 -rotate-12 rounded-sm bg-teal-soft" />
      <p className="relative text-sm font-semibold text-white/80">Your next step</p>
      <h2 id="next-step-title" className="relative mt-1 text-xl font-semibold leading-snug sm:text-2xl">
        {step.title}
      </h2>
      <p className="relative mt-2 max-w-xl leading-relaxed text-white/85">{step.description}</p>
      <Link
        href={step.href}
        className="press relative mt-5 inline-flex h-11 items-center gap-2 rounded-full border-2 border-black/5 bg-sunny px-5 text-[15px] font-semibold text-ink shadow-[var(--shadow-raised)]"
      >
        <ArrowRight aria-hidden className="size-4" />
        {step.cta}
      </Link>
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
    <header className="sticker relative overflow-hidden rounded-[var(--radius-hero)] bg-[#14286b] px-6 py-7 text-white sm:px-9 sm:py-8">
      {/* Confetti. */}
      <span aria-hidden className="max-sm:hidden absolute left-[46%] top-6 size-4 rotate-12 rounded-sm bg-pink" />
      <span aria-hidden className="max-sm:hidden absolute bottom-8 left-[40%] size-3 rounded-full bg-sunny" />
      <span aria-hidden className="max-sm:hidden absolute right-[38%] top-10 h-2 w-6 -rotate-12 rounded-full bg-teal" />
      <span aria-hidden className="max-sm:hidden absolute bottom-6 left-8 size-3 rotate-45 bg-violet" />
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <div className="w-full sm:max-w-md">
          <h1 className="font-display text-[2rem] font-semibold leading-tight text-white sm:text-[2.5rem]">
            {greeting()}
            {home.name ? `, ${home.name}` : ""}.
          </h1>
          {home.grade_level && (
            <p className="mt-2 inline-flex rounded-full bg-sunny px-3 py-1 text-sm font-semibold text-ink">
              {home.grade_level}
            </p>
          )}
          {chips.length > 0 ? (
            <dl className="mt-4 flex flex-wrap gap-2">
              {(chips as { label: string; value: string; tone: string }[]).map((chip) => (
                <div key={chip.label} className="rounded-xl bg-white px-3 py-1.5">
                  <dt className="text-[11px] font-semibold text-ink-muted">{chip.label}</dt>
                  <dd className={`max-w-[14rem] truncate text-sm font-bold ${chip.tone}`}>{chip.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 max-w-sm leading-relaxed text-white/80">Every career starts with one small step. Here&apos;s yours.</p>
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
        <div className="h-full rounded-full bg-primary" style={{ width: `${(done / total) * 100}%` }} />
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

      <p className="pt-4 text-xs text-ink-muted">
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
  // The next step is shown above; list only the others.
  const steps = (plan?.next_three_actions ?? []).filter((action) => action !== home.next_step.title);

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
        <div className="mt-3 rounded-xl bg-primary-softer px-4 py-3">
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
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Hero home={home} />
      {home.journey && <CareerJourney journey={home.journey} />}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <NextStep home={home} />
          <AgentActivity />
          <ContinueList home={home} />
        </div>
        <div className="space-y-5">
          {home.record && <ProfileCard record={home.record} />}
          <PathCard home={home} />
        </div>
      </div>
    </div>
  );
}
