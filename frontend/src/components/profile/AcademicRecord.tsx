"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowRight, Award, BookOpen, Briefcase, CircleCheck, CircleDashed, FileText, HeartHandshake, Lightbulb, Sparkles, Trophy, Users } from "lucide-react";

import { BrightFuturesCard } from "@/components/college/BrightFuturesCard";
import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CardSkeleton, ErrorNotice } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { StudentRecord } from "@/types/cie";

const CHECKLIST_ICONS: Record<string, typeof Users> = {
  activities: Users,
  leadership: Sparkles,
  volunteering: HeartHandshake,
  work_experience: Briefcase,
  awards: Trophy,
  projects: Lightbulb,
  skills: Award,
};

const AREA_TONE = ["bg-primary", "bg-pink", "bg-teal", "bg-sun", "bg-sky", "bg-violet", "bg-accent"];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

function ProfileStrength({ record }: { record: StudentRecord }) {
  const steps = [
    { key: "transcript", label: "Transcript", done: Boolean(record.academics) },
    { key: "resume", label: "Resume", done: Boolean(record.resume) },
    { key: "quiz", label: "Interest quiz", done: Boolean(record.riasec) },
    { key: "tests", label: "SAT or ACT", done: Boolean(record.tests.sat || record.tests.act) },
    { key: "hours", label: "Service hours", done: record.service_hours != null },
  ];
  const done = steps.filter((step) => step.done).length;

  return (
    <section className="rounded-[var(--radius-hero)] border border-line bg-primary-softer p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">Profile strength</p>
          <p className="font-display text-2xl font-semibold text-ink">
            {done} of {steps.length} done
          </p>
        </div>
        <p className="max-w-sm text-sm text-ink-muted">Your counselor, quiz and plan read these first. The more that&apos;s here, the less generic the advice.</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {steps.map((step) => (
          <li key={step.key} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${step.done ? "bg-accent-soft text-accent-ink" : "bg-white text-ink-muted ring-1 ring-line"}`}>
            {step.done ? <CircleCheck aria-hidden className="size-4" /> : <CircleDashed aria-hidden className="size-4" />}
            {step.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Grades({ record }: { record: StudentRecord }) {
  const academics = record.academics;

  if (!academics) {
    return (
      <section className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6">
        <h2 className="text-xl font-semibold text-ink">Grades</h2>
        <p className="mt-1 text-sm text-ink-muted">Upload your transcript (an unofficial one is fine) and we&apos;ll work out your GPA, advanced courses and strongest subjects.</p>
        <ButtonLink href="#documents" variant="soft" size="sm" className="mt-4" icon={<FileText aria-hidden className="size-4" />}>
          Add my transcript
        </ButtonLink>
      </section>
    );
  }

  const advanced = Object.values(academics.rigor).reduce((sum, count) => sum + count, 0);

  return (
    <section aria-labelledby="grades-title" className="space-y-4">
      <div>
        <h2 id="grades-title" className="text-xl font-semibold text-ink">
          Grades
        </h2>
        <p className="text-sm text-ink-muted">
          Calculated from {academics.graded_courses} graded courses on your transcript{academics.institution ? ` (${academics.institution})` : ""}. Your school calculates the official GPA.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Unweighted GPA" value={academics.gpa_unweighted?.toFixed(2) ?? "-"} hint="A=4, B=3, C=2, D=1" />
        <Stat label="Weighted GPA" value={academics.gpa_weighted?.toFixed(2) ?? "-"} hint="AP/IB/AICE/dual +1, honors +0.5" />
        <Stat
          label="Advanced courses"
          value={String(advanced)}
          hint={Object.entries(academics.rigor).map(([level, count]) => `${count} ${level}`).join(", ") || "None yet"}
        />
        <Stat label="Grade trend" value={academics.trend ? academics.trend[0].toUpperCase() + academics.trend.slice(1) : "-"} hint={academics.trend ? "First term vs latest" : "Needs two terms"} />
      </div>

      {academics.areas.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <p className="text-sm font-semibold text-ink">Grades by subject</p>
          <ul className="mt-3 space-y-2">
            {academics.areas.map((area, index) => (
              <li key={area.area} className="grid grid-cols-[130px_1fr_3rem] items-center gap-3 text-sm">
                <span className="font-medium text-ink">{area.area}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-surface-3">
                  <span className={`block h-full rounded-full ${AREA_TONE[index % AREA_TONE.length]}`} style={{ width: `${(area.gpa / 4) * 100}%` }} />
                </span>
                <span className="text-right font-semibold tabular-nums text-ink">{area.gpa.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-[var(--radius-card)] border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold text-ink-muted hover:text-ink">
          All courses ({academics.courses.length}){academics.in_progress.length ? ` and ${academics.in_progress.length} in progress` : ""}
        </summary>
        <div className="border-t border-line px-5 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="py-1 font-semibold">Course</th>
                <th className="py-1 font-semibold">Level</th>
                <th className="py-1 text-right font-semibold">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {academics.courses.map((course) => (
                <tr key={`${course.name}-${course.term}`}>
                  <td className="py-1.5 text-ink">{course.name}</td>
                  <td className="py-1.5 text-ink-muted">{course.level}</td>
                  <td className="py-1.5 text-right font-semibold text-ink">{course.grade || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {academics.in_progress.length > 0 && <p className="mt-3 text-sm text-ink-muted">Taking now: {academics.in_progress.join(", ")}</p>}
        </div>
      </details>
    </section>
  );
}

function TestsAndHours({ record, onSaved }: { record: StudentRecord; onSaved: (next: StudentRecord) => void }) {
  const toast = useToast();
  const [sat, setSat] = useState(record.tests.sat ? String(record.tests.sat) : "");
  const [act, setAct] = useState(record.tests.act ? String(record.tests.act) : "");
  const [hours, setHours] = useState(record.service_hours_source === "you told us" && record.service_hours != null ? String(record.service_hours) : "");
  const [major, setMajor] = useState(record.intended_major);
  const [busy, setBusy] = useState(false);
  const input = "mt-1 w-full rounded-[var(--radius-input)] border border-line-strong bg-surface px-3.5 py-2.5 text-ink focus:border-primary focus:outline-none";

  return (
    <section aria-labelledby="tests-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6">
      <h2 id="tests-title" className="text-xl font-semibold text-ink">
        Scores, hours and the major you want
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Practice and PSAT scores are fine. These change your college chances and the Bright Futures check.</p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);

          try {
            onSaved(await api.updateAcademicProfile({ sat, act, service_hours: hours, intended_major: major }));
            toast("Saved. Your chances and Bright Futures check are updated, and your counselor is refreshing your suggestions and My Path to match.");
          } catch (caught) {
            toast(caught instanceof Error ? caught.message : "Couldn't save.", "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="text-sm font-medium text-ink">
          SAT
          <input inputMode="numeric" className={input} value={sat} onChange={(event) => setSat(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="400-1600" />
        </label>
        <label className="text-sm font-medium text-ink">
          ACT
          <input inputMode="numeric" className={input} value={act} onChange={(event) => setAct(event.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="1-36" />
        </label>
        <label className="text-sm font-medium text-ink">
          Service hours
          <input
            inputMode="numeric"
            className={input}
            value={hours}
            onChange={(event) => setHours(event.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder={record.service_hours != null ? `${record.service_hours} from your resume` : "e.g. 40"}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Major you want
          <input className={input} value={major} onChange={(event) => setMajor(event.target.value)} placeholder="e.g. Computer Science" />
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </section>
  );
}

function ResumeChecklist({ record }: { record: StudentRecord }) {
  const done = record.resume_checklist.filter((item) => item.done).length;

  return (
    <section aria-labelledby="resume-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="resume-title" className="text-xl font-semibold text-ink">
            Your resume
          </h2>
          <p className="text-sm text-ink-muted">
            {record.resume ? `${done} of ${record.resume_checklist.length} sections found.` : "No resume yet."} Put in everything you&apos;ve done, even small things. It all counts.
          </p>
        </div>
        {record.service_hours != null && (
          <span className="rounded-full bg-teal-soft px-3 py-1 text-sm font-semibold text-teal">
            {record.service_hours} service hours ({record.service_hours_source})
          </span>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {record.resume_checklist.map((item) => {
          const Icon = CHECKLIST_ICONS[item.key] ?? BookOpen;

          return (
            <li key={item.key} className={`rounded-xl border p-4 ${item.done ? "border-accent/25 bg-accent-softer" : "border-dashed border-line-strong bg-surface"}`}>
              <div className="flex items-center gap-2">
                <span className={`flex size-8 items-center justify-center rounded-lg ${item.done ? "bg-accent text-white" : "bg-surface-2 text-ink-muted"}`}>
                  <Icon aria-hidden className="size-4" />
                </span>
                <p className="font-semibold text-ink">{item.label}</p>
                <span className="ml-auto text-xs font-semibold text-ink-muted">{item.done ? `${item.count} listed` : "Missing"}</span>
              </div>
              {!item.done && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.hint}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InterestsAndMajor({ record }: { record: StudentRecord }) {
  const option = record.major_minor?.options[0];

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <p className="text-sm font-semibold text-sun">Interest type (RIASEC)</p>
        {record.riasec ? (
          <>
            <p className="mt-2 flex gap-1.5">
              {record.riasec.code.split("").map((letter, index) => (
                <span key={letter} className={`flex size-10 items-center justify-center rounded-xl text-lg font-bold ${index === 0 ? "bg-sun text-white" : "border-2 border-sun text-sun-ink"}`}>
                  {letter}
                </span>
              ))}
            </p>
            <p className="mt-2 text-sm text-ink-muted">{record.riasec.top.join(" · ")}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Not taken yet.</p>
        )}
        <Link href="/discover" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {record.riasec ? "See or retake the quiz" : "Take the quiz"} <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <p className="text-sm font-semibold text-pink">Major and minor</p>
        {option ? (
          <>
            <p className="mt-2 font-semibold text-ink">{option.major.title}</p>
            <p className="text-sm text-ink-muted">Minor: {option.minor.title}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Finish the quiz to get three major and minor sets.</p>
        )}
        <Link href="/discover" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {option ? "See all options and colleges" : "Find my major"} <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}

/** The student's record: what every agent in the app reads first. */
export function AcademicRecord() {
  const [record, setRecord] = useState<StudentRecord | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .record()
      .then((data) => {
        setRecord(data);
        setError("");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Couldn't load your record."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-10">
      {error && <ErrorNotice message={error} onRetry={load} />}
      {!record && !error && <CardSkeleton lines={4} />}
      {record && (
        <>
          <ProfileStrength record={record} />
          <Grades record={record} />
          <TestsAndHours record={record} onSaved={setRecord} />
          <ResumeChecklist record={record} />
          <InterestsAndMajor record={record} />
          <BrightFuturesCard data={record.bright_futures} />
        </>
      )}
      <div id="documents" className="scroll-mt-24">
        <Suspense>
          <DocumentLibrary embedded onChange={load} />
        </Suspense>
      </div>
    </div>
  );
}
