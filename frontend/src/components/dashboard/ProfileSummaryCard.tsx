import type { StudentProfile } from "@/types/cie";

type ProfileSummaryCardProps = {
  profile: StudentProfile;
};

function EmptyValue() {
  return <span className="text-slate-400">Not added yet</span>;
}

export function ProfileSummaryCard({
  profile,
}: ProfileSummaryCardProps) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-indigo-600">
          Current Goal
        </p>

        <h3 className="mt-2 text-xl font-bold text-slate-950">
          {profile.career_aspiration || <EmptyValue />}
        </h3>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          This target role is used to personalize roadmap, project, and
          interview guidance.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-sky-600">
          Education
        </p>

        <h3 className="mt-2 text-xl font-bold text-slate-950">
          {profile.current_education || <EmptyValue />}
        </h3>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          Education helps CIE recommend realistic next steps and learning plans.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-emerald-600">
          Experience
        </p>

        <h3 className="mt-2 text-xl font-bold text-slate-950">
          {profile.years_of_experience ?? 0} year(s)
        </h3>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          Experience level helps match recommendations to beginner,
          intermediate, or advanced paths.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">
        <p className="text-sm font-semibold text-slate-700">
          Skills
        </p>

        {profile.skills.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <span
                key={skill}
                className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">
            No skills added yet.
          </p>
        )}
      </div>
    </section>
  );
}
