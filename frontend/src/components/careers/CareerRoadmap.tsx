"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  Award,
  BookOpen,
  Building2,
  ExternalLink,
  Flag,
  GraduationCap,
  ListPlus,
  Map as MapIcon,
  MessageCircle,
  RefreshCw,
  Rocket,
  Star,
} from "lucide-react";

import { Badge, Card } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorNotice, Skeleton } from "@/components/ui/Feedback";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { CareerResource, CareerRoadmap as Roadmap, CareerRoadmapContent } from "@/types/cie";

type TabKey = "steps" | "learn" | "courses" | "resources" | "scholarships" | "colleges";

const TABS: { key: TabKey; label: string; icon: typeof Flag }[] = [
  { key: "steps", label: "Step by step", icon: MapIcon },
  { key: "learn", label: "What to learn", icon: Rocket },
  { key: "courses", label: "Courses", icon: BookOpen },
  { key: "resources", label: "Online & programs", icon: Star },
  { key: "scholarships", label: "Scholarships", icon: Award },
  { key: "colleges", label: "Colleges", icon: Building2 },
];

const WAITING_LINES = [
  "Reading what you've shared…",
  "Mapping your steps from this week to five years out…",
  "Matching courses and majors…",
  "Picking programs and scholarships that fit you…",
  "Almost there…",
];

// One hue, light to strong, from this week out to five years.
const RUNG_TONES = [
  "bg-surface-3 text-ink",
  "bg-surface-3 text-ink",
  "bg-primary-soft text-primary-ink",
  "bg-primary-soft text-primary-ink",
  "bg-primary text-on-primary",
  "bg-primary text-on-primary",
];

function ExternalItem({
  resource,
  why,
  highlight = false,
}: {
  resource: CareerResource;
  why?: string;
  highlight?: boolean;
}) {
  return (
    <li
      className={`rounded-2xl border p-4 ${highlight ? "border-primary/30 bg-primary-softer" : "border-line bg-surface"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <a
          href={resource.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-ink underline-offset-2 hover:text-primary hover:underline"
        >
          {resource.title}
          <ExternalLink aria-hidden className="size-3.5 shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <div className="flex flex-wrap gap-1">
          {highlight && <Badge tone="primary">Picked for you</Badge>}
          {resource.tags.slice(0, 2).map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{resource.description}</p>
      {why && <p className="mt-2 text-sm leading-relaxed text-primary-ink">{why}</p>}
    </li>
  );
}

function ResourceList({
  resources,
  roadmap,
  sections,
}: {
  resources: CareerResource[];
  roadmap: CareerRoadmapContent | null;
  sections: CareerResource["section"][];
}) {
  const picked = new Map((roadmap?.picked_resources ?? []).map((item) => [item.id, item.why]));
  const items = resources.filter((item) => sections.includes(item.section));

  // Picked-for-you first, otherwise keep curated order (career-specific first).
  const ordered = [
    ...items.filter((item) => picked.has(item.id)),
    ...items.filter((item) => !picked.has(item.id)),
  ];

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {ordered.map((item) => (
        <ExternalItem key={item.id} resource={item} why={picked.get(item.id)} highlight={picked.has(item.id)} />
      ))}
    </ul>
  );
}

function Heading({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="mb-3 mt-7 first:mt-0">
      <h3 className="font-bold text-ink">{children}</h3>
      {note && <p className="mt-0.5 text-sm text-ink-muted">{note}</p>}
    </div>
  );
}

function NeedsRoadmap({ onBuild, loading }: { onBuild: () => void; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface-2 p-5 text-center">
      <p className="text-sm text-ink-muted">This part is personalized to you.</p>
      <Button className="mt-3" size="sm" onClick={onBuild} loading={loading} icon={<MessageCircle aria-hidden className="size-4" />}>
        Build my roadmap
      </Button>
    </div>
  );
}

function Ladder({ roadmap }: { roadmap: CareerRoadmapContent }) {
  return (
    <ol className="relative space-y-5">
      {roadmap.ladder.map((rung, index) => (
        <li key={rung.horizon} className="relative flex gap-4">
          {index < roadmap.ladder.length - 1 && (
            <span aria-hidden className="absolute left-[19px] top-10 h-[calc(100%-1rem)] w-0.5 bg-line" />
          )}
          <span
            aria-hidden
            className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${RUNG_TONES[index] ?? RUNG_TONES[5]}`}
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-xs font-semibold text-ink-muted">{rung.horizon}</p>
            <p className="mt-0.5 font-semibold leading-snug text-ink">{rung.goal}</p>
            {rung.steps.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {rung.steps.map((step) => (
                  <li key={step} className="flex gap-2.5 text-[15px] leading-relaxed text-ink-muted">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                    {step}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ReasonList<T>({
  items,
  title,
  badge,
  body,
}: {
  items: T[];
  title: (item: T) => string;
  badge?: (item: T) => string;
  body: (item: T) => ReactNode;
}) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <li key={title(item)} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold text-ink">{title(item)}</p>
            {badge && <Badge tone="accent">{badge(item)}</Badge>}
          </div>
          <div className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body(item)}</div>
        </li>
      ))}
    </ul>
  );
}

export function CareerRoadmap({ slug, title }: { slug: string; title: string }) {
  const [data, setData] = useState<Roadmap | null>(null);
  const [loadError, setLoadError] = useState("");
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [tab, setTab] = useState<TabKey>("steps");
  const [waitIndex, setWaitIndex] = useState(0);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    api
      .careerRoadmap(slug)
      .then((loaded) => {
        if (!cancelled) {
          setData(loaded);
          setLoadError("");
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : "Couldn't load this roadmap.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  function load() {
    setLoadError("");
    setAttempt((value) => value + 1);
  }

  useEffect(() => {
    if (!building) {
      return;
    }

    const timer = window.setInterval(
      () => setWaitIndex((index) => Math.min(index + 1, WAITING_LINES.length - 1)),
      8000
    );

    return () => window.clearInterval(timer);
  }, [building]);

  async function build() {
    setWaitIndex(0);
    setBuilding(true);
    setBuildError("");

    try {
      setData(await api.generateRoadmap(slug));
      setTab("steps");
    } catch (caught) {
      setBuildError(caught instanceof Error ? caught.message : "Your roadmap couldn't be created.");
    } finally {
      setBuilding(false);
    }
  }

  if (loadError) {
    return <ErrorNotice message={loadError} onRetry={load} />;
  }

  if (!data) {
    return (
      <Card className="space-y-3 p-6" role="status" aria-label="Loading roadmap">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </Card>
    );
  }

  const roadmap = data.roadmap;

  return (
    <Card className="overflow-hidden" id="roadmap">
      <div className="bg-surface-2 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <MapIcon aria-hidden className="size-5 text-primary" />
          <h2 className="text-xl font-bold">Your roadmap: {title}</h2>
          <Badge tone="primary">Personalized</Badge>
        </div>

        {!roadmap && !building && (
          <>
            <p className="mt-2 max-w-2xl leading-relaxed text-ink-muted">
              Not sure how to get from here to there? Get a step-by-step path built around you: goals for the next two weeks
              through five years out, what to learn, which courses to take, programs and scholarships to look at, and colleges
              to research.
            </p>
            <Button className="mt-5" size="lg" onClick={build} icon={<MessageCircle aria-hidden className="size-[18px]" />}>
              Build my roadmap
            </Button>
            <p className="mt-2 text-xs text-ink-muted">Takes about a minute. The resource lists below are ready now.</p>
          </>
        )}

        {building && (
          <div className="mt-4 max-w-xl space-y-3" role="status" aria-live="polite">
            <p className="font-semibold text-primary-ink">{WAITING_LINES[waitIndex]}</p>
            <div className="h-2 overflow-hidden rounded-full bg-primary-soft">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-[8000ms] ease-linear"
                style={{ width: `${((waitIndex + 1) / WAITING_LINES.length) * 92}%` }}
              />
            </div>
          </div>
        )}

        {buildError && <ErrorNotice className="mt-4" message={buildError} onRetry={build} />}

        {roadmap && !building && (
          <div className="animate-[var(--animate-fade-up)]">
            {roadmap.headline && <p className="mt-2 text-lg font-semibold text-ink">{roadmap.headline}</p>}
            {roadmap.where_you_are && (
              <p className="mt-2 max-w-3xl leading-relaxed text-ink-muted">{roadmap.where_you_are}</p>
            )}
            {roadmap.first_step && (
              <div className="mt-4 flex gap-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)]">
                <Flag aria-hidden className="mt-0.5 size-5 shrink-0 text-warm" />
                <div>
                  <p className="text-xs font-semibold text-warm-ink">Do this today</p>
                  <p className="mt-0.5 font-medium text-ink">{roadmap.first_step}</p>
                </div>
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <ButtonLink
                href={`/plan?generate=1&goal=${encodeURIComponent(title)}`}
                variant="accent"
                size="sm"
                icon={<ListPlus aria-hidden className="size-4" />}
              >
                Make a plan for this career
              </ButtonLink>
              <Button size="sm" variant="secondary" onClick={build} icon={<RefreshCw aria-hidden className="size-4" />}>
                Rebuild
              </Button>
              {data.generated_at && <span className="text-xs text-ink-muted">Built {timeAgo(data.generated_at)}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-line">
        <div role="tablist" aria-label="Roadmap sections" className="flex gap-1 overflow-x-auto px-4 pt-3 sm:px-6">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              type="button"
              id={`roadmap-tab-${key}`}
              aria-selected={tab === key}
              aria-controls="roadmap-panel"
              onClick={() => setTab(key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-t-xl border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                tab === key ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </button>
          ))}
        </div>

        <div id="roadmap-panel" role="tabpanel" aria-labelledby={`roadmap-tab-${tab}`} className="border-t border-line p-4 sm:p-6">
          {tab === "steps" &&
            (roadmap ? (
              <>
                <Heading note="From small wins this week to where this career can take you.">Short-term to long-term goals</Heading>
                <Ladder roadmap={roadmap} />
              </>
            ) : (
              <NeedsRoadmap onBuild={build} loading={building} />
            ))}

          {tab === "learn" &&
            (roadmap ? (
              <>
                <Heading note="Knowledge and skills you can start building now.">What you need to learn</Heading>
                <ReasonList
                  items={roadmap.what_to_learn}
                  title={(item) => item.topic}
                  body={(item) => (
                    <>
                      <p>{item.why}</p>
                      <p className="mt-1.5 text-ink">
                        <span className="font-semibold">How: </span>
                        {item.how}
                      </p>
                    </>
                  )}
                />
                {roadmap.certifications.length > 0 && (
                  <>
                    <Heading note="Industry credentials some high school students earn. Ask your school which ones it offers.">
                      Certifications to consider
                    </Heading>
                    <ReasonList items={roadmap.certifications} title={(item) => item.name} body={(item) => item.why} />
                  </>
                )}
              </>
            ) : (
              <NeedsRoadmap onBuild={build} loading={building} />
            ))}

          {tab === "courses" &&
            (roadmap ? (
              <>
                <Heading note="Check with your school counselor which of these your schedule allows.">High school courses</Heading>
                <ReasonList
                  items={roadmap.high_school_courses}
                  title={(item) => item.course}
                  badge={(item) => item.kind}
                  body={(item) => item.why}
                />
                {roadmap.college_majors.length > 0 && (
                  <>
                    <Heading note="What to look for when you search colleges.">College majors and programs</Heading>
                    <ReasonList
                      items={roadmap.college_majors}
                      title={(item) => item.major}
                      body={(item) => item.why}
                    />
                  </>
                )}
              </>
            ) : (
              <NeedsRoadmap onBuild={build} loading={building} />
            ))}

          {tab === "resources" && (
            <>
              {roadmap && roadmap.online_learning.length > 0 && (
                <>
                  <Heading note="Free courses and videos. Each link opens a search on that site.">Learn online, picked for you</Heading>
                  <ul className="grid gap-3 md:grid-cols-2">
                    {roadmap.online_learning.map((item) => (
                      <li key={item.topic} className="rounded-2xl border border-primary/30 bg-primary-softer p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-ink hover:text-primary hover:underline"
                          >
                            {item.topic}
                            <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                          <Badge tone="primary">{item.provider}</Badge>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-primary-ink">{item.why}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <Heading note="Trusted free sites for this field.">Learning sites</Heading>
              <ResourceList resources={data.resources} roadmap={roadmap} sections={["learn"]} />
              <Heading note="Clubs, competitions, and summer programs that look great on applications.">Programs to join</Heading>
              <ResourceList resources={data.resources} roadmap={roadmap} sections={["programs"]} />
            </>
          )}

          {tab === "scholarships" && (
            <>
              <Heading note="Eligibility, amounts, and deadlines change every year, so check each site. Many open in junior or senior year; start a list now.">
                Scholarships and fellowships
              </Heading>
              <ResourceList resources={data.resources} roadmap={roadmap} sections={["scholarships"]} />
              {!roadmap && (
                <p className="mt-4 text-sm text-ink-muted">Build your roadmap to see which of these fit you best.</p>
              )}
            </>
          )}

          {tab === "colleges" && (
            <>
              {roadmap && roadmap.college_options.length > 0 && (
                <>
                  <Heading note="Examples to research, not a ranked list. Visit, compare costs, and talk with your counselor.">
                    Colleges and routes that fit your profile
                  </Heading>
                  <ReasonList
                    items={roadmap.college_options}
                    title={(item) => item.name}
                    badge={(item) => item.kind}
                    body={(item) => item.why}
                  />
                </>
              )}
              <Heading note="Tools for comparing colleges, paying for school, and other routes in.">Plan for college and beyond</Heading>
              <ResourceList resources={data.resources} roadmap={roadmap} sections={["college"]} />
            </>
          )}
        </div>

        <p className="flex items-start gap-2 border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-muted sm:px-6">
          <GraduationCap aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Personalized parts are AI-generated from what you&apos;ve shared. Links go to each organization&apos;s own site. Talk
            through your roadmap with your school counselor or{" "}
            <Link href={`/counselor?ask=${encodeURIComponent(`Can you help me with my roadmap for ${title}?`)}`} className="underline">
              your AI counselor
            </Link>
            .
          </span>
        </p>
      </div>
    </Card>
  );
}
