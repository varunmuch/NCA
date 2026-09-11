import type { StudentProfile } from "@/types/cie";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { ProfileSummaryCard } from "./ProfileSummaryCard";
import { QuickActionCard } from "./QuickActionCard";

type DashboardHomeProps = {
  profile: StudentProfile;
  setActiveSection: (section: string) => void;
};

export function DashboardHome({
  profile,
  setActiveSection,
}: DashboardHomeProps) {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-700 p-6 text-white shadow-xl shadow-slate-200 sm:p-8">
        <div className="max-w-4xl">
          <div className="flex items-center gap-5">
            <BrandLogo
              variant="shield"
              size="xl"
              light
              showText={false}
            />

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-100">
                NeoCity Academy
              </p>

              <p className="mt-1 text-xl font-bold text-white">
                Career Intelligence Engine
              </p>
            </div>
          </div>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.22em] text-teal-100">
            Student Career Workspace
          </p>

          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Plan your next career move with confidence.
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-100 sm:text-base">
            Upload your resume, build a roadmap, find skill gaps, choose
            certifications, prepare for interviews, and track progress in one
            NeoCity Academy workspace.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setActiveSection("profile")}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100"
            >
              Complete Profile
            </button>

            <button
              type="button"
              onClick={() => setActiveSection("progress")}
              className="rounded-2xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/20"
            >
              Track Progress
            </button>
          </div>
        </div>
      </section>

      <ProfileSummaryCard profile={profile} />

      <section>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">
            What do you want to do today?
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Choose a guided action instead of writing the perfect prompt.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <QuickActionCard
            title="Build my roadmap"
            description="Get a month-by-month path from your current profile to your target role."
            onClick={() => setActiveSection("roadmap")}
          />

          <QuickActionCard
            title="Pick my next project"
            description="Get a portfolio project matched to your target role and current skills."
            onClick={() => setActiveSection("projects")}
          />

          <QuickActionCard
            title="Find skill gaps"
            description="Compare current skills against your target role requirements."
            onClick={() => setActiveSection("skills")}
          />

          <QuickActionCard
            title="Track my progress"
            description="Create timelines, add subtasks, and update your progress."
            onClick={() => setActiveSection("progress")}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">
              NeoCity Academy Career Workspace
            </p>

            <h2 className="mt-1 text-xl font-bold text-slate-950">
              Start with one clear milestone.
            </h2>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              Once your profile is updated, CIE can help you choose a project,
              certification, or interview plan and track each step inside the
              Progress Tracker.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveSection("progress")}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Open Progress Tracker
          </button>
        </div>
      </section>
    </div>
  );
}
