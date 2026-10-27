import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Map } from "lucide-react";

import { PlanGenerator } from "@/components/plan/PlanGenerator";
import { Badge, PageHeader } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";
import { fetchAsStudent, getStudent } from "@/lib/student-session";
import type { PlanSummary } from "@/types/cie";

export const metadata: Metadata = { title: "My Path" };

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ generate?: string; goal?: string; start?: string }>;
}) {
  const { generate, goal, start } = await searchParams;
  const { me } = await getStudent();
  const { plans } = await fetchAsStudent<{ plans: PlanSummary[] }>("/me/plans");

  // One card per plan, showing its newest version.
  const latest = new globalThis.Map<string, PlanSummary & { versions: number }>();

  for (const plan of plans) {
    const current = latest.get(plan.lineage_id);

    if (!current || plan.version > current.version) {
      latest.set(plan.lineage_id, {
        ...plan,
        versions: plans.filter((item) => item.lineage_id === plan.lineage_id).length,
      });
    }
  }

  const lineages = [...latest.values()];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="My Path"
        title={lineages.length ? "Your plans" : "Let's build your plan"}
        description="One plan built from your grades, resume and interests: what to study, where to apply, how to pay for it, and what to do this month."
      />

      {lineages.length > 0 && (
        <section aria-labelledby="saved-plans">
          <h2 id="saved-plans" className="sr-only">
            Saved plans
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {lineages.map((plan) => (
              <li key={plan.lineage_id}>
                <Link
                  href={`/plan/${plan.id}`}
                  className="group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-[var(--shadow-raised)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Map aria-hidden className="size-5" />
                    </span>
                    <Badge tone={plan.status === "saved" ? "accent" : "sun"}>{plan.status === "saved" ? "Saved" : "Draft"}</Badge>
                  </div>
                  <h3 className="font-display mt-4 text-xl font-semibold leading-snug text-ink">{plan.title}</h3>
                  {plan.career_goal && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{plan.career_goal}</p>}
                  <div className="mt-auto flex items-center justify-between pt-4 text-sm text-ink-muted">
                    <span>
                      Updated {formatDate(plan.updated_at)}
                      {plan.versions > 1 ? ` · ${plan.versions} versions` : ""}
                    </span>
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PlanGenerator
        suggestedGoal={goal?.slice(0, 200) || (me.profile.career_status === "have_goal" ? me.profile.career_aspiration : "")}
        autoFocus={generate === "1"}
        autoStart={start === "1"}
      />
    </div>
  );
}
