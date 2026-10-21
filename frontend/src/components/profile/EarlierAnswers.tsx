"use client";

import { useEffect, useState } from "react";
import { ChevronDown, History } from "lucide-react";

import { ModuleResult } from "@/components/counselor/ModuleResult";
import { formatDate } from "@/lib/format";
import { api } from "@/lib/api";
import type { EarlierAnswer, ModuleType } from "@/types/cie";

// Sections of the previous interface, mapped to today's module cards.
const SECTION_MODULE: Record<string, ModuleType> = {
  roadmap: "career_roadmap",
  projects: "project_ideas",
  skills: "skill_check",
  certifications: "certificates",
  interview: "interview_practice",
};

const SECTION_LABEL: Record<string, string> = {
  roadmap: "Career Map",
  projects: "Project Ideas",
  skills: "Skills Check",
  certifications: "Certificates",
  interview: "Interview Practice",
};

/**
 * Read-only answers saved by the earlier, section-based version of the app.
 */
export function EarlierAnswers() {
  const [answers, setAnswers] = useState<EarlierAnswer[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api
      .earlierAnswers()
      .then((data) => setAnswers(data.answers))
      .catch(() => setAnswers([]));
  }, []);

  if (!answers.length) {
    return null;
  }

  return (
    <section aria-labelledby="earlier-title" className="space-y-3">
      <div className="flex items-center gap-2">
        <History aria-hidden className="size-5 text-ink-muted" />
        <h2 id="earlier-title" className="text-lg font-bold">
          Earlier answers
        </h2>
      </div>
      <p className="text-sm text-ink-muted">Saved from the earlier version of Career Explorer.</p>
      <ul className="space-y-2">
        {answers.map((answer) => {
          const result = (answer.response as { result?: Record<string, unknown> }).result;
          const expanded = open === answer.id;

          return (
            <li key={answer.id} className="rounded-2xl border border-line bg-surface">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : answer.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-ink-muted">
                    {SECTION_LABEL[answer.section] ?? answer.section} · {formatDate(answer.created_at)}
                  </span>
                  <span className="mt-0.5 block truncate font-medium text-ink">{answer.prompt}</span>
                </span>
                <ChevronDown aria-hidden className={`size-5 shrink-0 text-ink-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded && (
                <div className="border-t border-line p-4">
                  {result && typeof result === "object" ? (
                    <ModuleResult type={SECTION_MODULE[answer.section] ?? "career_roadmap"} result={result} />
                  ) : (
                    <p className="text-sm text-ink-muted">This answer has no saved details.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
