import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { preparationLabel } from "@/lib/format";
import type { CareerDetail } from "@/types/cie";

import { FamilyIcon } from "./CareerCard";

const ROWS: { label: string; render: (career: CareerDetail) => React.ReactNode }[] = [
  { label: "What they do", render: (career) => <p className="leading-relaxed">{career.description}</p> },
  {
    label: "A few typical tasks",
    render: (career) => (
      <ul className="list-disc space-y-1 pl-4 marker:text-primary/50">
        {career.tasks.slice(0, 3).map((task) => (
          <li key={task}>{task}</li>
        ))}
      </ul>
    ),
  },
  { label: "School subjects", render: (career) => career.subjects.join(", ") || "—" },
  { label: "Skills", render: (career) => career.skills.slice(0, 5).join(", ") || "—" },
  { label: "Good fit if you like", render: (career) => career.interest_labels.slice(0, 2).join("; ") },
  { label: "Preparation", render: (career) => preparationLabel(career.job_zone) || "—" },
  {
    label: "Most common education",
    render: (career) =>
      career.common_education[0] ? `${career.common_education[0].level} (${career.common_education[0].percent}%)` : "—",
  },
];

export function CompareCareers({ careers }: { careers: CareerDetail[] }) {
  if (careers.length < 2) {
    return (
      <EmptyState
        icon={<ArrowLeft aria-hidden className="size-5" />}
        title="Pick at least two careers"
        description="Select careers on the Explore page to compare them side by side."
        action={<ButtonLink href="/explore">Explore careers</ButtonLink>}
      />
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Explore careers
      </Link>
      <PageHeader eyebrow="Compare" title="Side by side" description="Notice what draws you in, and what doesn't. Both are useful clues." />

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface text-sm shadow-[var(--shadow-card)]">
          <thead>
            <tr>
              <th scope="col" className="w-40 bg-surface-2 p-4 text-left align-bottom text-xs font-semibold text-ink-muted">
                <span className="sr-only">Detail</span>
              </th>
              {careers.map((career) => (
                <th key={career.slug} scope="col" className="border-l border-line bg-surface-2 p-4 text-left align-top">
                  <FamilyIcon family={career.family} size="sm" />
                  <Link href={`/explore/${career.slug}`} className="mt-2 block text-base font-bold text-ink hover:text-primary">
                    {career.title}
                  </Link>
                  <span className="text-xs font-medium text-ink-muted">{career.family_label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="border-t border-line p-4 text-left align-top text-xs font-semibold text-ink-muted">
                  {row.label}
                </th>
                {careers.map((career) => (
                  <td key={career.slug} className="border-l border-t border-line p-4 align-top text-ink">
                    {row.render(career)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">Career information from the O*NET 31.0 Database (USDOL/ETA), CC BY 4.0.</p>
    </div>
  );
}
