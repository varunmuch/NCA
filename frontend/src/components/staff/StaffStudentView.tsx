"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, CircleCheck, Circle, FileText, Lightbulb, ListChecks, Map as MapIcon, Route, UserRound } from "lucide-react";

import { Badge, Card, SectionTitle } from "@/components/ui/Card";
import { formatDate, timeAgo } from "@/lib/format";
import type { StaffStudentDetail } from "@/types/cie";

const PROFILE_LABELS: [string, string][] = [
  ["grade_level", "Grade"],
  ["school", "School"],
  ["career_aspiration", "Career goal"],
  ["academic_goals", "Academic goals"],
  ["favorite_subjects", "Favorite subjects"],
  ["interests", "Interests"],
  ["strengths", "Strengths"],
  ["activities", "Activities"],
  ["skills", "Skills"],
];

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-6">
      <SectionTitle title={title} icon={icon} />
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

export function StaffStudentView({ student }: { student: StaffStudentDetail }) {
  const profileRows = PROFILE_LABELS.map(([key, label]) => {
    const value = student.profile[key];
    const text = Array.isArray(value) ? value.join(", ") : value;
    return [label, text] as const;
  }).filter(([, text]) => text);

  const content = student.plan?.content;

  return (
    <div className="space-y-6 pb-10">
      <Link href="/staff" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> All students
      </Link>

      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Student overview</p>
        <h1 className="font-display mt-1 text-[2rem] font-semibold leading-tight">{student.name || "Student"}</h1>
        <p className="mt-1 text-sm text-ink-muted">Read-only. Chat messages are private to the student and not shown here.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Profile" icon={<UserRound aria-hidden className="size-[18px]" />}>
          {profileRows.length ? (
            <dl className="space-y-2 text-sm">
              {profileRows.map(([label, text]) => (
                <div key={label} className="grid grid-cols-[130px_1fr] gap-3">
                  <dt className="font-semibold text-ink-muted">{label}</dt>
                  <dd className="text-ink">{text}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Empty>The student hasn&apos;t filled in their profile yet.</Empty>
          )}
          {student.facts.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-sm font-semibold text-ink-muted">Confirmed by the student</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {student.facts.slice(0, 24).map((fact) => (
                  <li key={`${fact.category}-${fact.value}`} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
                    {fact.value}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Interest quiz" icon={<Lightbulb aria-hidden className="size-[18px]" />}>
          {student.quiz ? (
            <>
              <ul className="space-y-2">
                {student.quiz.top.map((item) => (
                  <li key={item.type} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-ink">{item.label}</span>
                    <Badge tone="primary">{item.score}</Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-muted">Taken {timeAgo(student.quiz.taken_at)}</p>
            </>
          ) : (
            <Empty>Not taken yet. Suggest it if the student doesn&apos;t know where to start.</Empty>
          )}
        </Section>
      </div>

      <Section title="Career plan" icon={<MapIcon aria-hidden className="size-[18px]" />}>
        {student.plan && content ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-ink">{student.plan.title}</h3>
              <Badge tone={student.plan.status === "saved" ? "accent" : "sun"}>{student.plan.status === "saved" ? "Saved" : "Draft"}</Badge>
              <span className="text-xs text-ink-muted">Updated {timeAgo(student.plan.updated_at)}</span>
            </div>
            {content.career_direction && <p className="leading-relaxed text-ink-muted">{content.career_direction}</p>}
            {content.next_three_actions.length > 0 && (
              <div>
                <p className="font-semibold text-ink">Next actions</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-ink-muted">
                  {content.next_three_actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>
              </div>
            )}
            {content.careers_exploring.length > 0 && (
              <p className="text-ink-muted">
                <span className="font-semibold text-ink">Exploring: </span>
                {content.careers_exploring.map((career) => career.title).join(", ")}
              </p>
            )}
          </div>
        ) : (
          <Empty>No plan yet.</Empty>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Progress" icon={<ListChecks aria-hidden className="size-[18px]" />}>
          {student.progress.length ? (
            <div className="space-y-5">
              {student.progress.map((timeline) => {
                const done = timeline.tasks.filter((task) => task.status === "done").length;

                return (
                  <div key={timeline.id}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <p className="font-semibold text-ink">{timeline.title}</p>
                      <span className="text-xs text-ink-muted">
                        {done}/{timeline.tasks.length} done
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {timeline.tasks.slice(0, 8).map((task) => (
                        <li key={task.id} className="flex items-start gap-2 text-sm text-ink-muted">
                          {task.status === "done" ? (
                            <CircleCheck aria-label="Done" className="mt-0.5 size-4 shrink-0 text-accent" />
                          ) : (
                            <Circle aria-label="Not done" className="mt-0.5 size-4 shrink-0 text-ink-soft" />
                          )}
                          <span>{task.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>No progress steps yet.</Empty>
          )}
        </Section>

        <Section title="Roadmaps and saved careers" icon={<Route aria-hidden className="size-[18px]" />}>
          {student.roadmaps.length > 0 && (
            <ul className="space-y-3">
              {student.roadmaps.map((roadmap) => (
                <li key={roadmap.slug} className="rounded-xl bg-surface-2 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/explore/${roadmap.slug}`} className="font-semibold text-ink hover:text-primary hover:underline">
                      {roadmap.title}
                    </Link>
                    {roadmap.tracked ? <Badge tone="accent">Tracking</Badge> : <Badge>Not tracked</Badge>}
                  </div>
                  {roadmap.first_step && <p className="mt-1 text-ink-muted">First step: {roadmap.first_step}</p>}
                </li>
              ))}
            </ul>
          )}
          {student.saved_careers.length > 0 && (
            <p className="mt-4 text-sm text-ink-muted">
              <span className="font-semibold text-ink">Saved careers: </span>
              {student.saved_careers.map((career) => career.title).join(", ")}
            </p>
          )}
          {!student.roadmaps.length && !student.saved_careers.length && <Empty>No roadmaps or saved careers yet.</Empty>}
        </Section>
      </div>

      <Section title="Documents" icon={<FileText aria-hidden className="size-[18px]" />}>
        {student.documents.length ? (
          <ul className="divide-y divide-line text-sm">
            {student.documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium text-ink">{document.filename}</span>
                <span className="flex items-center gap-2 text-xs text-ink-muted">
                  <Badge>{document.doc_type}</Badge>
                  {document.status === "failed" ? <Badge tone="warm">Couldn&apos;t read</Badge> : null}
                  {formatDate(document.uploaded_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No documents uploaded.</Empty>
        )}
      </Section>
    </div>
  );
}
