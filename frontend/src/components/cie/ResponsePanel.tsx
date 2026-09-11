import type { CieApiResponse } from "@/types/cie";

type ResponsePanelProps = {
  result: CieApiResponse | null;
  error?: string;
};

type ResultValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | number[]
  | Record<string, unknown>
  | Record<string, unknown>[];

const labelMap: Record<string, string> = {
  target_role: "Target Role",
  current_stage: "Current Stage",
  recommended_next_roles: "Recommended Next Roles",
  key_skills_to_build: "Key Skills to Build",
  recommended_projects: "Recommended Projects",
  recommended_certifications: "Recommended Certifications",
  estimated_progression: "Estimated Progression",

  project_title: "Project Title",
  project_goal: "Project Goal",
  target_role_alignment: "Target Role Alignment",
  student_context_used: "Student Context Used",
  prerequisite_skills: "Prerequisite Skills",
  tools_and_services: "Tools and Services",
  architecture_overview: "Architecture Overview",
  implementation_phases: "Implementation Phases",
  weekly_roadmap: "Weekly Roadmap",
  portfolio_deliverables: "Portfolio Deliverables",
  resume_bullets: "Resume Bullets",
  github_readme_sections: "GitHub README Sections",
  evaluation_criteria: "Evaluation Criteria",
  next_steps_after_project: "Next Steps After Project",

  interview_type: "Interview Type",
  preparation_summary: "Preparation Summary",
  core_topics_to_prepare: "Core Topics to Prepare",
  technical_questions_to_practice: "Technical Questions to Practice",
  scenario_questions_to_practice: "Scenario Questions to Practice",
  behavioral_questions_to_practice: "Behavioral Questions to Practice",
  project_stories_to_prepare: "Project Stories to Prepare",
  study_plan: "Study Plan",
  mock_interview_plan: "Mock Interview Plan",
  resume_positioning_tips: "Resume Positioning Tips",
  next_steps: "Next Steps",

  current_skill_summary: "Current Skill Summary",
  matching_skills: "Matching Skills",
  missing_core_skills: "Missing Core Skills",
  missing_tools_or_platforms: "Missing Tools or Platforms",
  priority_learning_order: "Priority Learning Order",
  recommended_projects_to_close_gaps: "Projects to Close Gaps",
  weekly_skill_plan: "Weekly Skill Plan",
  certification_alignment: "Certification Alignment",

  current_level_summary: "Current Level Summary",
  recommended_first_certification: "Recommended First Certification",
  certification_order: "Certification Order",
  certification_reasoning: "Certification Reasoning",
  estimated_timeline: "Estimated Timeline",
  preparation_plan: "Preparation Plan",
  hands_on_practice_needed: "Hands-on Practice Needed",
  project_alignment: "Project Alignment",
};

function formatLabel(key: string) {
  if (labelMap[key]) {
    return labelMap[key];
  }

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isEmptyValue(value: ResultValue) {
  if (value === null || value === undefined) {
    return true;
  }

  if (Array.isArray(value) && value.length === 0) {
    return true;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return true;
  }

  return false;
}

export function ResponsePanel({
  result,
  error = "",
}: ResponsePanelProps) {
  if (error) {
    return (
      <section className="rounded-3xl border border-red-100 bg-red-50 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-600">
          Error
        </p>

        <h2 className="mt-2 text-xl font-bold text-red-700">
          Something went wrong
        </h2>

        <p className="mt-3 text-sm leading-6 text-red-600">
          {error}
        </p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
          Response
        </p>

        <h2 className="mt-2 text-xl font-bold text-slate-950">
          No response yet
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          Submit a question to see the response here.
        </p>
      </section>
    );
  }

  if (result.status === "needs_profile") {
    return (
      <section className="rounded-3xl border border-amber-100 bg-amber-50 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
          Profile Needed
        </p>

        <h2 className="mt-2 text-xl font-bold text-amber-800">
          Complete your profile first
        </h2>

        <p className="mt-3 text-sm leading-6 text-amber-700">
          {result.message ||
            "CIE needs your profile before giving personalized guidance."}
        </p>

        {result.required_fields && result.required_fields.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {result.required_fields.map((field) => (
              <span
                key={field}
                className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700"
              >
                {formatLabel(field)}
              </span>
            ))}
          </div>
        )}
      </section>
    );
  }

  const responseResult = result.result as
    | Record<string, ResultValue>
    | undefined;

  if (!responseResult) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
          Response
        </p>

        <h2 className="mt-2 text-xl font-bold text-slate-950">
          Message
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          {result.message || "No structured result returned yet."}
        </p>
      </section>
    );
  }

  const entries = Object.entries(responseResult).filter(
    ([, value]) => !isEmptyValue(value)
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
            CIE Response
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Personalized Guidance
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Review the guidance below and save important actions in your
            Progress Tracker.
          </p>
        </div>

        <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-2">
          <p className="text-xs font-medium text-teal-600">
            Intent
          </p>

          <p className="text-sm font-semibold capitalize text-teal-800">
            {result.intent?.replace(/_/g, " ") || "Career guidance"}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {entries.map(([key, value]) => (
          <ResultBlock
            key={key}
            label={formatLabel(key)}
            value={value}
          />
        ))}
      </div>
    </section>
  );
}

function ResultBlock({
  label,
  value,
}: {
  label: string;
  value: ResultValue;
}) {
  if (Array.isArray(value)) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </h3>

        <div className="mt-4 space-y-3">
          {value.map((item, index) => (
            <div
              key={index}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700"
            >
              {typeof item === "object" && item !== null ? (
                <pre className="whitespace-pre-wrap break-words text-sm text-slate-700">
                  {JSON.stringify(item, null, 2)}
                </pre>
              ) : (
                <span>{String(item)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </h3>

        <pre className="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
          {JSON.stringify(value, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </h3>

      <p className="mt-3 text-sm leading-7 text-slate-700">
        {String(value)}
      </p>
    </div>
  );
}
