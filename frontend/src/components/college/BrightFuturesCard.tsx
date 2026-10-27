import { CircleCheck, CircleDashed, CircleX, ExternalLink } from "lucide-react";

import type { BrightFutures } from "@/types/cie";

const STATUS = {
  met: { icon: CircleCheck, tone: "text-accent", label: "Met" },
  not_yet: { icon: CircleX, tone: "text-pink", label: "Not yet" },
  unknown: { icon: CircleDashed, tone: "text-ink-soft", label: "Unknown" },
} as const;

const LEVEL_TONE = {
  on_track: "bg-accent-soft text-accent-ink",
  not_yet: "bg-pink-soft text-pink",
  unknown: "bg-surface-2 text-ink-muted",
} as const;

const LEVEL_TEXT = { on_track: "On track", not_yet: "Not yet", unknown: "Needs info" } as const;

/** Florida Bright Futures: each level's requirements checked against the student's record. */
export function BrightFuturesCard({ data }: { data: BrightFutures }) {
  return (
    <section aria-labelledby="bright-futures-title" className="rounded-[var(--radius-card)] border border-sun/25 bg-gradient-to-br from-sun-soft/70 to-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="bright-futures-title" className="font-semibold text-ink">
          {data.name}
        </h3>
        <a href={data.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Official site <ExternalLink aria-hidden className="size-3" />
        </a>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{data.summary}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {data.levels.map((level) => (
          <div key={level.key} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{level.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_TONE[level.status]}`}>{LEVEL_TEXT[level.status]}</span>
            </div>
            <ul className="mt-2.5 space-y-2">
              {level.checks.map((check) => {
                const status = STATUS[check.status];
                const Icon = status.icon;

                return (
                  <li key={check.item} className="flex gap-2 text-sm">
                    <Icon aria-label={status.label} className={`mt-0.5 size-4 shrink-0 ${status.tone}`} />
                    <span>
                      <span className="text-ink">{check.item}</span>
                      <span className="block text-xs text-ink-muted">{check.note}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        Also required: {data.common.join(" ")} Your GPA here is the app&apos;s estimate from your transcript; your school calculates the official one. {data.changes} Source: {data.source}.
      </p>
    </section>
  );
}
