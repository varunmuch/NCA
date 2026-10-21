"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ChevronRight, Search, Users } from "lucide-react";

import { Badge, Card, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { timeAgo } from "@/lib/format";
import type { StaffStudentRow } from "@/types/cie";

const FLAG_LABELS: Record<StaffStudentRow["flags"][number], string> = {
  inactive: "Inactive 2+ weeks",
  no_direction: "No direction yet",
  plan_not_saved: "Plan not saved",
  document_failed: "File couldn't be read",
};

type Filter = "all" | "attention" | StaffStudentRow["flags"][number];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All students" },
  { key: "attention", label: "Needs attention" },
  { key: "no_direction", label: "No direction yet" },
  { key: "inactive", label: "Inactive" },
  { key: "plan_not_saved", label: "Plan not saved" },
];

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-ink">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-muted">{note}</p>}
    </Card>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  if (!total) {
    return <span className="text-ink-soft">—</span>;
  }

  const percent = Math.round((done / total) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-ink-muted">
        {done}/{total}
      </span>
    </div>
  );
}

export function StaffDashboard({ students }: { students: StaffStudentRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const activeThisWeek = students.filter((item) => item.active_this_week).length;
  const attention = students.filter((item) => item.flags.length > 0).length;
  const savedPlans = students.filter((item) => item.plan === "saved").length;

  const visible = students.filter((item) => {
    if (filter === "attention" && !item.flags.length) {
      return false;
    }

    if (filter !== "all" && filter !== "attention" && !item.flags.includes(filter)) {
      return false;
    }

    const needle = query.trim().toLowerCase();

    return !needle || `${item.name} ${item.email ?? ""} ${item.grade_level}`.toLowerCase().includes(needle);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="School counselors"
        title="Counselor Dashboard"
        description="See who's making progress and who might need a check-in. Students' chat messages stay private; you see their profile, plans, progress, and roadmaps."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Students" value={students.length} />
        <Stat label="Active this week" value={activeThisWeek} />
        <Stat label="Need attention" value={attention} note="Any flag below" />
        <Stat label="Saved a plan" value={savedPlans} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter students">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                filter === item.key ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-ink hover:bg-surface-2"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="relative block lg:w-72">
          <span className="sr-only">Search students</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, grade"
            className="h-10 w-full rounded-full border border-line-strong bg-surface pl-9 pr-4 text-sm focus:border-primary focus:outline-none focus:shadow-[var(--shadow-focus)]"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<Users aria-hidden className="size-5" />} title="No students here" description="Try a different filter or search." />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {visible.map((student) => (
              <li key={student.id}>
                <Link
                  href={`/staff/${encodeURIComponent(student.id)}`}
                  className="grid gap-3 px-5 py-4 transition-colors hover:bg-surface-2 md:grid-cols-[1.6fr_1fr_0.8fr_0.8fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{student.name}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {[student.grade_level, student.email].filter(Boolean).join(" · ")}
                    </p>
                    {student.flags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {student.flags.map((flag) => (
                          <Badge key={flag} tone={flag === "inactive" || flag === "document_failed" ? "warm" : "sun"}>
                            <AlertTriangle aria-hidden className="size-3" />
                            {FLAG_LABELS[flag]}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-ink-muted">
                    <span className="md:hidden font-semibold text-ink">Interests: </span>
                    {student.top_interests.length ? student.top_interests.join(", ") : student.career_aspiration || "—"}
                  </div>
                  <div className="text-sm">
                    <span className="md:hidden font-semibold">Plan: </span>
                    {student.plan === "saved" ? (
                      <Badge tone="accent">Saved</Badge>
                    ) : student.plan === "draft" ? (
                      <Badge tone="sun">Draft</Badge>
                    ) : (
                      <span className="text-ink-soft">None</span>
                    )}
                  </div>
                  <Progress done={student.tasks_done} total={student.tasks_total} />
                  <div className="flex items-center justify-between gap-3 text-xs text-ink-muted md:justify-end">
                    <span>{student.last_active ? `Active ${timeAgo(student.last_active)}` : "Never active"}</span>
                    <ChevronRight aria-hidden className="size-4" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
