"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, Layers, MessageCircle, Route, Target } from "lucide-react";

import type { ModuleType } from "@/types/cie";

/**
 * Renders results from CIE's deep-dive modules (skill check, project
 * ideas, certificates, interview practice, career roadmap), including ones
 * saved before the redesign.
 */

const MODULE_META: Record<ModuleType, { title: string; icon: typeof Target }> = {
  skill_check: { title: "Skill check", icon: Target },
  project_ideas: { title: "Project idea", icon: Layers },
  certificates: { title: "Certificates & courses", icon: BookOpen },
  interview_practice: { title: "Interview practice", icon: MessageCircle },
  career_roadmap: { title: "Career roadmap", icon: Route },
};

// Fields shown first, in this order; everything else follows.
const PRIORITY: Record<ModuleType, string[]> = {
  skill_check: ["current_skill_summary", "matching_skills", "missing_core_skills", "priority_learning_order", "weekly_skill_plan", "next_steps"],
  project_ideas: ["project_goal", "prerequisite_skills", "implementation_phases", "weekly_roadmap", "portfolio_deliverables", "next_steps_after_project"],
  certificates: ["current_level_summary", "recommended_first_certification", "certification_order", "preparation_plan", "next_steps"],
  interview_practice: ["preparation_summary", "behavioral_questions_to_practice", "scenario_questions_to_practice", "technical_questions_to_practice", "study_plan", "next_steps"],
  career_roadmap: ["current_stage", "key_skills_to_build", "recommended_projects", "estimated_progression", "recommended_next_roles"],
};

const HIDDEN = new Set(["target_role", "project_title", "student_context_used", "interview_type"]);

function label(key: string) {
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ModuleResult({
  type,
  result,
}: {
  type: ModuleType;
  result: Record<string, unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = MODULE_META[type] ?? MODULE_META.career_roadmap;
  const Icon = meta.icon;
  const heading = String(result.project_title || result.target_role || "");

  const priority = PRIORITY[type] ?? [];
  const keys = [
    ...priority.filter((key) => key in result),
    ...Object.keys(result).filter((key) => !priority.includes(key) && !HIDDEN.has(key)),
  ].filter((key) => {
    const value = result[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  const visible = expanded ? keys : keys.slice(0, 3);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line bg-primary-softer/70 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-surface text-primary">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">{meta.title}</p>
          {heading && <p className="truncate font-bold text-ink">{heading}</p>}
        </div>
      </div>
      <div className="space-y-4 px-4 py-4 text-sm">
        {visible.map((key) => {
          const value = result[key];

          return (
            <div key={key}>
              <p className="font-semibold text-ink">{label(key)}</p>
              {Array.isArray(value) ? (
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-muted marker:text-primary/50">
                  {value.map((item, index) => (
                    <li key={index}>{String(item)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 leading-relaxed text-ink-muted">{String(value)}</p>
              )}
            </div>
          );
        })}
      </div>
      {keys.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-1.5 border-t border-line py-2.5 text-sm font-semibold text-primary hover:bg-primary-softer/50"
        >
          {expanded ? "Show less" : `Show ${keys.length - 3} more sections`}
          <ChevronDown aria-hidden className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}
