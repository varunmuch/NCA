"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  GitCompare,
  GraduationCap,
  Lightbulb,
  ListChecks,
  Map as MapIcon,
  MessageCircle,
  Wrench,
} from "lucide-react";

import { Badge, Card, SectionTitle } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorNotice, Skeleton } from "@/components/ui/Feedback";
import { api } from "@/lib/api";
import { preparationLabel } from "@/lib/format";
import type { CareerDetail, CareerInsights } from "@/types/cie";

import { CareerCard, FamilyIcon, SaveCareerButton } from "./CareerCard";
import { CareerFacts } from "./CareerFacts";
import { CareerRoadmap } from "./CareerRoadmap";

function Chips({ items, tone = "neutral" }: { items: string[]; tone?: "neutral" | "primary" }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            tone === "primary" ? "bg-primary-soft text-primary-ink" : "bg-surface-2 text-ink"
          }`}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function Insights({ slug }: { slug: string }) {
  const [insights, setInsights] = useState<CareerInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      setInsights(await api.careerInsights(slug));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load ideas right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="bg-surface-2 p-6">
        <div className="flex items-center gap-2">
          <MessageCircle aria-hidden className="size-5 text-primary" />
          <h2 className="text-lg font-bold">Make it personal</h2>
          <Badge tone="primary">AI</Badge>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Your counselor can connect this career to what you&apos;ve shared, and suggest beginner-friendly ways to try it out.
        </p>
        {!insights && (
          <Button className="mt-4" onClick={load} loading={loading} icon={<Lightbulb aria-hidden className="size-4" />}>
            {loading ? "Thinking…" : "Get ideas for me"}
          </Button>
        )}
      </div>

      {loading && (
        <div className="space-y-3 p-6" role="status" aria-label="Loading ideas">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {error && <ErrorNotice className="m-6" message={error} onRetry={load} />}

      {insights && (
        <div className="space-y-6 p-6 text-[15px] animate-[var(--animate-fade-up)]">
          <div>
            <h3 className="font-bold">A day in the life</h3>
            <p className="mt-1.5 leading-relaxed text-ink-muted">{insights.day_to_day}</p>
          </div>
          <div className="rounded-2xl bg-accent-softer p-4">
            <h3 className="font-bold text-accent-ink">How it connects to you</h3>
            <p className="mt-1.5 leading-relaxed text-ink">{insights.connection_to_you}</p>
          </div>
          {[
            ["Try it out in high school", insights.beginner_experiences],
            ["Other ways in", insights.alternative_routes],
            ["Questions to ask yourself", insights.questions_to_consider],
          ].map(([title, items]) =>
            (items as string[]).length ? (
              <div key={title as string}>
                <h3 className="font-bold">{title as string}</h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-muted marker:text-primary/50">
                  {(items as string[]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
          <p className="text-xs text-ink-muted">
            AI-generated suggestions. Check programs and requirements with your school counselor.
          </p>
        </div>
      )}
    </Card>
  );
}

export function CareerDetailView({ career }: { career: CareerDetail }) {
  const prep = preparationLabel(career.job_zone);
  const askHref = `/counselor?ask=${encodeURIComponent(`I'm curious about ${career.title}. What's it really like, and could it be a good fit for me?`)}`;

  return (
    <div className="space-y-8 pb-10">
      <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Explore careers
      </Link>

      <header className="flex flex-col gap-6 rounded-[var(--radius-hero)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex gap-4 sm:gap-5">
          <FamilyIcon family={career.family} size="lg" />
          <div>
            <p className="text-sm font-semibold text-ink-muted">{career.family_label}</p>
            <h1 className="font-display mt-1 text-[2rem] font-semibold leading-tight sm:text-[2.5rem]">{career.title}</h1>
            {career.sample_titles.length > 0 && (
              <p className="mt-2 text-sm text-ink-muted">Also called: {career.sample_titles.slice(0, 4).join(", ")}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {prep && <Badge>{prep}</Badge>}
              {career.interest_labels.slice(0, 2).map((label) => (
                <Badge key={label}>
                  {label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SaveCareerButton slug={career.slug} title={career.title} saved={Boolean(career.saved)} variant="button" />
          <ButtonLink href="#roadmap" variant="secondary" icon={<MapIcon aria-hidden className="size-4" />}>
            See my roadmap
          </ButtonLink>
          <ButtonLink href={askHref} icon={<MessageCircle aria-hidden className="size-4" />}>
            Discuss with my counselor
          </ButtonLink>
        </div>
      </header>

      {career.facts && <CareerFacts facts={career.facts} />}

      <CareerRoadmap slug={career.slug} title={career.title} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-bold">What they do</h2>
            <p className="mt-2 text-[17px] leading-relaxed text-ink">{career.description}</p>
          </Card>

          {career.tasks.length > 0 && (
            <Card className="p-6">
              <SectionTitle title="Typical responsibilities" icon={<ListChecks aria-hidden className="size-[18px]" />} />
              <ul className="mt-4 space-y-3">
                {career.tasks.map((task) => (
                  <li key={task} className="flex gap-3 leading-relaxed text-ink">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    {task}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-6">
            <SectionTitle title="Skills and school subjects" icon={<Wrench aria-hidden className="size-[18px]" />} />
            {career.subjects.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-ink-muted">High school subjects that help</h3>
                <div className="mt-2">
                  <Chips items={career.subjects} tone="primary" />
                </div>
              </div>
            )}
            {career.skills.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-ink-muted">Skills involved</h3>
                <div className="mt-2">
                  <Chips items={career.skills} />
                </div>
              </div>
            )}
            {career.knowledge.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-ink-muted">Knowledge areas</h3>
                <div className="mt-2">
                  <Chips items={career.knowledge} />
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <SectionTitle title="Education and training" icon={<GraduationCap aria-hidden className="size-[18px]" />} />
            {career.preparation && <p className="mt-4 font-semibold">{career.preparation.replace(/^Job Zone [^:]+: /, "")}</p>}
            {career.education_summary && <p className="mt-1 leading-relaxed text-ink-muted">{career.education_summary}</p>}
            {career.common_education.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-ink-muted">What people in this job report</h3>
                <ul className="mt-3 space-y-3">
                  {career.common_education.map((item) => (
                    <li key={item.level}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-ink">{item.level.split(" - ")[0]}</span>
                        <span className="font-semibold text-ink-muted">{item.percent}%</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${item.percent}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-5 text-sm leading-relaxed text-ink-muted">
              Paths differ from person to person. Community college, apprenticeships, certificates, and the military can all be ways in for many careers.
            </p>
          </Card>

          <Insights slug={career.slug} />
        </div>

        <aside className="space-y-6">
          {career.related_careers.length > 0 && (
            <div>
              <h2 className="text-lg font-bold">Related careers</h2>
              <div className="mt-3 space-y-3">
                {career.related_careers.slice(0, 4).map((related) => (
                  <CareerCard key={related.slug} career={related} />
                ))}
              </div>
              <ButtonLink
                href={`/explore/compare?c=${[career.slug, ...career.related_careers.slice(0, 2).map((item) => item.slug)].join(",")}`}
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                icon={<GitCompare aria-hidden className="size-4" />}
              >
                Compare with related careers
              </ButtonLink>
            </div>
          )}
          <p className="text-xs leading-relaxed text-ink-muted">
            Source:{" "}
            <a href={career.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
              O*NET OnLine ({career.onet_code}) <ExternalLink aria-hidden className="size-3" />
            </a>
            . {career.source.name} by {career.source.publisher}, used under {career.source.license}.
          </p>
        </aside>
      </div>
    </div>
  );
}
