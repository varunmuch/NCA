"use client";

import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  FileText,
  Loader2,
  Compass,
  Flag,
  Lightbulb,
  Map,
  Route,
  MessageCircle,
  Sparkles,
  UserRoundPen,
} from "lucide-react";

import { CareerCard, FamilyIcon } from "@/components/careers/CareerCard";
import { Badge, Card, SectionTitle } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { timeAgo } from "@/lib/format";
import type { HomeDocument, HomeSummary } from "@/types/cie";

import { PathIllustration } from "./PathIllustration";

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  return hour < 18 ? "Good afternoon" : "Good evening";
}

const NEXT_STEP_ICONS = {
  onboarding: UserRoundPen,
  counselor: Sparkles,
  review_facts: CircleCheck,
  plan: Map,
  task: Flag,
  roadmap: Route,
  quiz: Lightbulb,
  save_plan: Map,
  explore: Compass,
} as const;

function Hero({ home }: { home: HomeSummary }) {
  return (
    <section className="relative overflow-hidden rounded-[var(--radius-hero)] border border-line bg-gradient-to-br from-primary-softer via-surface to-accent-softer px-6 py-8 shadow-[var(--shadow-card)] sm:px-10 sm:py-12">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary-soft/60 blur-3xl" />
      <div className="relative grid items-center gap-6 md:grid-cols-[1.25fr_1fr]">
        <div className="animate-[var(--animate-fade-up)]">
          <p className="text-sm font-semibold text-primary">
            {greeting()}
            {home.grade_level ? ` · ${home.grade_level}` : ""}
          </p>
          <h1 className="font-display mt-2 text-[2.5rem] font-semibold leading-[1.05] text-ink sm:text-[3.25rem]">
            Hey{home.name ? `, ${home.name}` : ""} <span className="inline-block origin-[70%_70%] motion-safe:animate-[wave_1.6s_ease-in-out_1]">👋</span>
          </h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-muted">
            Your future is full of possibilities. Let&apos;s explore them together.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/counselor" size="lg" icon={<Sparkles aria-hidden className="size-[18px]" />}>
              Talk to My Counselor
            </ButtonLink>
            <ButtonLink href="/explore" size="lg" variant="secondary" icon={<Compass aria-hidden className="size-[18px]" />}>
              Explore Careers
            </ButtonLink>
          </div>
        </div>
        <PathIllustration className="mx-auto hidden w-full max-w-[380px] md:block" />
      </div>
    </section>
  );
}

function NextStepCard({ home }: { home: HomeSummary }) {
  const step = home.next_step;
  const Icon = NEXT_STEP_ICONS[step.kind as keyof typeof NEXT_STEP_ICONS] ?? Flag;

  return (
    <section
      aria-labelledby="next-step-title"
      className="relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-ink p-6 text-white shadow-[var(--shadow-raised)] sm:p-7"
    >
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 size-56 rounded-full bg-primary/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -top-20 right-24 size-40 rounded-full bg-accent/30 blur-3xl" />
      <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Your next step</p>
      <div className="relative mt-4 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-white ring-1 ring-white/15">
          <Icon aria-hidden className="size-6" />
        </span>
        <div>
          <h2 id="next-step-title" className="text-xl font-bold leading-snug sm:text-2xl">
            {step.title}
          </h2>
          <p className="mt-2 max-w-md leading-relaxed text-white/75">{step.description}</p>
        </div>
      </div>
      <div className="relative mt-auto pt-6">
        <Link
          href={step.href}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-primary-soft"
        >
          {step.cta}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function ConversationCard({ home }: { home: HomeSummary }) {
  const conversation = home.latest_conversation;

  return (
    <Card className="flex h-full flex-col p-6">
      <SectionTitle title="Continue your conversation" icon={<MessageCircle aria-hidden className="size-[18px]" />} />
      {conversation ? (
        <>
          <Link
            href={`/counselor/${conversation.id}`}
            className="mt-5 block rounded-2xl bg-surface-2 p-4 transition-colors hover:bg-surface-3"
          >
            <p className="font-semibold text-ink">{conversation.title}</p>
            {conversation.preview && (
              <p className="mt-1.5 line-clamp-2 text-sm text-ink-muted">“{conversation.preview}”</p>
            )}
            <p className="mt-2 text-xs text-ink-soft">{timeAgo(conversation.updated_at)}</p>
          </Link>
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <ButtonLink href={`/counselor/${conversation.id}`} variant="soft" size="sm">
              Resume chat
            </ButtonLink>
            <ButtonLink href="/counselor" variant="ghost" size="sm">
              Start a new one
            </ButtonLink>
          </div>
        </>
      ) : (
        <div className="mt-5 flex flex-1 flex-col">
          <p className="text-sm leading-relaxed text-ink-muted">
            Your counselor is ready whenever you are. Ask about a career you&apos;re curious about, or say you have no idea yet. Both are great places to start.
          </p>
          <div className="mt-auto pt-5">
            <ButtonLink href="/counselor" variant="soft" size="sm" icon={<Sparkles aria-hidden className="size-4" />}>
              Say hello
            </ButtonLink>
          </div>
        </div>
      )}
    </Card>
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

function PlanCard({ home }: { home: HomeSummary }) {
  const { plan } = home;

  return (
    <Card className="flex h-full flex-col p-6">
      <SectionTitle
        title="Your plan"
        icon={<Map aria-hidden className="size-[18px]" />}
        action={
          plan ? (
            <Badge tone={plan.status === "saved" ? "accent" : "sun"}>
              {plan.status === "saved" ? "Saved" : "Draft"}
            </Badge>
          ) : undefined
        }
      />
      {plan ? (
        <div className="mt-5 flex flex-1 flex-col">
          <h3 className="font-display text-xl font-semibold leading-snug">{plan.title}</h3>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{plan.career_direction}</p>
          {plan.next_three_actions.length > 0 && (
            <ol className="mt-4 space-y-2">
              {plan.next_three_actions.map((action, index) => (
                <li key={action} className="flex gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-ink">
                    {index + 1}
                  </span>
                  <span className="pt-0.5 text-ink">{action}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-auto pt-5">
            <ButtonLink href={`/plan/${plan.id}`} variant="soft" size="sm">
              Open my plan
            </ButtonLink>
          </div>
        </div>
      ) : (
        <EmptyState
          className="mt-5 flex-1 border-0 bg-surface-2/60 py-8"
          icon={<Map aria-hidden className="size-5" />}
          title="No plan yet"
          description="When you're ready, your counselor can turn what it knows about you into clear steps for this year."
          action={
            <ButtonLink href="/plan" size="sm">
              Create my plan
            </ButtonLink>
          }
        />
      )}
    </Card>
  );
}

const START_STEPS = [
  {
    icon: Lightbulb,
    title: "Find careers that fit you",
    description: "Take the interest quiz (about 8 minutes) to get your interest code and careers ranked by fit.",
    href: "/discover",
    cta: "Take the quiz",
  },
  {
    icon: Route,
    title: "Build a roadmap",
    description: "Open any career and get goals from this week to five years out: courses, programs, scholarships, and colleges.",
    href: "/explore",
    cta: "Pick a career",
  },
  {
    icon: Map,
    title: "Make a plan",
    description: "Turn what you've learned into a plan for this year, with steps you can check off as you go.",
    href: "/plan",
    cta: "Create my plan",
  },
];

function RoadmapsSection({ home }: { home: HomeSummary }) {
  if (!home.roadmaps.length) {
    return (
      <section aria-labelledby="start-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <h2 id="start-title" className="font-display text-2xl font-semibold">
          Not sure what you want to be? Start here.
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Most students don&apos;t know yet. Here&apos;s how to go from curious to a clear plan.</p>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {START_STEPS.map(({ icon: Icon, title, description, href, cta }, index) => (
            <li key={title} className="flex flex-col rounded-2xl bg-surface-2 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                  {index + 1}
                </span>
                <Icon aria-hidden className="size-5 text-primary" />
              </div>
              <h3 className="mt-3 font-bold text-ink">{title}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-ink-muted">{description}</p>
              <Link href={href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                {cta} <ArrowRight aria-hidden className="size-4" />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section aria-labelledby="roadmaps-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="roadmaps-title" className="font-display text-2xl font-semibold">
            Your career roadmaps
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Step-by-step paths you&apos;ve built. Pick up where you left off.</p>
        </div>
        <Link href="/explore" className="hidden text-sm font-semibold text-primary hover:underline sm:block">
          Build another
        </Link>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {home.roadmaps.map((roadmap) => (
          <Link
            key={roadmap.slug}
            href={`/explore/${roadmap.slug}#roadmap`}
            className="group flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)]"
          >
            <div className="flex items-center gap-3">
              <FamilyIcon family={roadmap.family} />
              <div className="min-w-0">
                <p className="truncate font-bold text-ink group-hover:text-primary">{roadmap.title}</p>
                <p className="text-xs text-ink-muted">Updated {timeAgo(roadmap.updated_at)}</p>
              </div>
            </div>
            {roadmap.first_step && (
              <div className="mt-4 flex-1 rounded-xl bg-warm-soft/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-warm-ink">First step</p>
                <p className="mt-1 line-clamp-3 text-sm text-ink">{roadmap.first_step}</p>
              </div>
            )}
            <div className="mt-4 flex items-center justify-end text-sm">
              <span className="inline-flex items-center gap-1 font-semibold text-primary">
                Open <ArrowRight aria-hidden className="size-4" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CareersSection({ home }: { home: HomeSummary }) {
  return (
    <section aria-labelledby="careers-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="careers-title" className="font-display text-2xl font-semibold">
            Careers worth exploring
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Based on what you&apos;ve saved and shared. Nothing here is set in stone.</p>
        </div>
        <Link href="/explore" className="hidden text-sm font-semibold text-primary hover:underline sm:block">
          Browse all careers
        </Link>
      </div>
      {home.careers.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {home.careers.map((career) => (
            <CareerCard key={career.slug} career={career} reason={career.reason} />
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-5"
          icon={<Compass aria-hidden className="size-5" />}
          title="Let's find some ideas"
          description="Tell your counselor what you enjoy (favorite classes, hobbies, anything) and careers worth exploring will show up here."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/counselor" size="sm" icon={<Sparkles aria-hidden className="size-4" />}>
                Help me discover
              </ButtonLink>
              <ButtonLink href="/explore" size="sm" variant="secondary">
                Browse careers
              </ButtonLink>
            </div>
          }
        />
      )}
    </section>
  );
}

export function HomeDashboard({ home }: { home: HomeSummary }) {
  return (
    <div className="space-y-6 sm:space-y-8">
      <Hero home={home} />

      <DocumentsStrip home={home} />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <NextStepCard home={home} />
        </div>
        <div className="lg:col-span-5">
          <ConversationCard home={home} />
        </div>
      </div>

      <RoadmapsSection home={home} />

      <CareersSection home={home} />

      <PlanCard home={home} />
    </div>
  );
}
