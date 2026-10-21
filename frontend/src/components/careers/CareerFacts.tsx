import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import type { CareerFacts as Facts } from "@/types/cie";

function dollars(value: number, hourly = false) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hourly ? 2 : 0,
    maximumFractionDigits: hourly ? 2 : 0,
  });
}

// "2026-10-21" read at local noon, so no time zone shifts it to the day before.
function asOf(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function Stat({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="border-t border-line pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0 md:first:border-l-0 md:first:pl-0">
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
      <div className="mt-2 space-y-1 text-sm leading-relaxed text-ink-muted">{children}</div>
    </div>
  );
}

function growthSentence(growth: number, average: number | undefined, period: string) {
  const years = period.replace("–", " to 20");
  const change = growth < 0 ? `shrink ${Math.abs(growth)}%` : `grow ${growth}%`;

  if (average === undefined) {
    return `Jobs are expected to ${change} from ${years}.`;
  }

  const compare =
    growth > average + 0.5 ? "faster than" : growth < average - 0.5 ? "slower than" : "about the same as";

  return `Jobs are expected to ${change} from ${years}, ${compare} the ${average}% average for all jobs.`;
}

/** Pay, job outlook, and how to get started, each from an official source. */
export function CareerFacts({ facts }: { facts: Facts }) {
  const national = facts.wages.national ?? {};
  const florida = facts.wages.florida ?? {};
  const outlook = facts.outlook;
  const education = facts.education;
  const sources = facts.sources;

  return (
    <section aria-labelledby="facts-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-7">
      <h2 id="facts-title" className="text-lg font-bold">
        Pay, jobs, and how to get started
      </h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3 md:gap-0">
        {national.annual_median ? (
          <Stat label="Typical pay in the U.S." value={`${dollars(national.annual_median)} a year`}>
            <p>Half of workers earn more than this, and half earn less.</p>
            {florida.annual_median && <p>In Florida: {dollars(florida.annual_median)} a year.</p>}
            {national.annual_p10 && national.annual_p90 && (
              <p>
                Most earn between {dollars(national.annual_p10)} and {dollars(national.annual_p90)}.
              </p>
            )}
          </Stat>
        ) : national.hourly_median ? (
          <Stat label="Typical pay in the U.S." value={`${dollars(national.hourly_median, true)} an hour`}>
            <p>Pay for this job is reported by the hour. Many people in it work part time or project to project.</p>
          </Stat>
        ) : (
          <Stat label="Typical pay" value="Not published">
            <p>The government doesn&apos;t publish pay for this job. Your school counselor can help you find out.</p>
          </Stat>
        )}

        {outlook && outlook.growth_percent !== null ? (
          <Stat
            label={`Jobs, ${outlook.period.replace("–", "–20")}`}
            value={`${outlook.growth_percent > 0 ? "+" : ""}${outlook.growth_percent}%`}
          >
            <p>{growthSentence(outlook.growth_percent, sources.outlook.all_jobs_growth_percent, outlook.period)}</p>
            {outlook.openings_per_year !== null && (
              <p>About {outlook.openings_per_year.toLocaleString("en-US")} openings each year, counting people who retire or change jobs.</p>
            )}
          </Stat>
        ) : null}

        {education?.typical_entry && (
          <Stat label="Education to get started" value={education.typical_entry}>
            {education.training && education.training !== "None" && <p>Plus training: {education.training.toLowerCase()}.</p>}
            {education.work_experience && education.work_experience !== "None" && (
              <p>Usually after {education.work_experience.toLowerCase()} in a related job.</p>
            )}
          </Stat>
        )}
      </div>

      {facts.ap_courses.length > 0 && (
        <div className="mt-7 border-t border-line pt-5">
          <h3 className="font-semibold text-ink">Classes to consider in high school</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {facts.ap_courses.map((course) => (
              <li key={course} className="rounded-full border border-line-strong px-3 py-1 text-sm text-ink">
                {course}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Many high schools also offer dual enrollment, where you take college classes for credit while you&apos;re still in high school. Ask your school counselor what&apos;s available.
          </p>
        </div>
      )}

      {(facts.licenses?.length ?? 0) > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-ink">Licenses in Florida</h3>
          <p className="mt-1 text-sm text-ink-muted">Some jobs need a state license. These are the ones Florida lists for this work.</p>
          <ul className="mt-3 space-y-2">
            {facts.licenses.map((item) => (
              <li key={item.title} className="text-sm leading-relaxed">
                <span className="font-medium text-ink">{item.title}</span>
                <span className="text-ink-muted">
                  {" "}from{" "}
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                      {item.agency}
                    </a>
                  ) : (
                    item.agency
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {facts.learning.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-ink">Free ways to start learning</h3>
          <ul className="mt-3 space-y-2">
            {facts.learning.map((item) => (
              <li key={item.url}>
                <a href={item.url} target="_blank" rel="noreferrer" className="group inline-flex items-baseline gap-1.5 text-ink hover:underline">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-sm text-ink-muted">
                    {item.provider} · {item.cost}
                  </span>
                  <ExternalLink aria-hidden className="size-3.5 self-center text-ink-soft" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
        Pay:{" "}
        <a href={sources.wages.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {sources.wages.name}
        </a>
        . Jobs and education:{" "}
        <a href={sources.outlook.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {sources.outlook.name}
        </a>
        .{" "}
        {sources.licenses && (
          <>
            Licenses:{" "}
            <a href={sources.licenses.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {sources.licenses.name}
            </a>
            .{" "}
          </>
        )}
        AP classes:{" "}
        <a href={sources.ap_courses.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {sources.ap_courses.name}
        </a>
        . Courses chosen by NeoCity Academy. As of {asOf(facts.retrieved)}.
      </p>
    </section>
  );
}
