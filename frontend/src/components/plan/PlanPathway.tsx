import { Award, BookOpen, ExternalLink, GraduationCap, School } from "lucide-react";
import type { ReactNode } from "react";

import type { Pathway } from "@/types/cie";

function dollars(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const GRADE_ORDER = ["9th grade", "10th grade", "11th grade", "12th grade"];

function Section({ id, icon, title, intro, children }: { id: string; icon: ReactNode; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-primary">
          {icon}
        </span>
        <h3 id={id} className="text-lg font-bold text-ink">
          {title}
        </h3>
      </div>
      {intro && <p className="mt-1 text-sm text-ink-muted">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Tag({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        tone === "accent" ? "bg-accent-softer text-accent-ink" : "bg-surface-2 text-ink-muted"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * The education path to the plan's main career: courses by grade, college
 * majors, Florida colleges, and certifications. Every name comes from an
 * official list and every figure from the data, not from the AI.
 */
export type PathwayPart = "courses" | "majors" | "colleges" | "certifications";

export function PlanPathway({ pathway, only, bare = false }: { pathway: Pathway; only?: PathwayPart[]; bare?: boolean }) {
  const show = (part: PathwayPart) => !only || only.includes(part);
  const grades = GRADE_ORDER.filter((grade) => pathway.courses.some((course) => course.grade === grade));
  const universities = pathway.colleges.filter((college) => college.kind === "4-year");
  const stateColleges = pathway.colleges.filter((college) => college.kind === "2-year");
  const sources = Object.values(pathway.sources ?? {}).filter((source) => source?.name);

  return (
    <section aria-labelledby={bare ? undefined : "pathway-title"} className="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-7">
      {!bare && (
        <>
          <p className="text-sm font-semibold text-primary">Your path</p>
          <h2 id="pathway-title" className="mt-1 text-xl font-bold text-ink">
            How to become: {pathway.career_title}
          </h2>
          {pathway.summary && <p className="mt-2 leading-relaxed text-ink-muted">{pathway.summary}</p>}
        </>
      )}

      <div className={`${bare ? "" : "mt-7 "}space-y-8`}>
        {show("courses") && pathway.courses.length > 0 && (
          <Section id="pathway-courses" icon={<BookOpen className="size-5" />} title="Courses to take in high school">
            <div className="space-y-5">
              {grades.map((grade) => (
                <div key={grade}>
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{grade}</h4>
                  <ul className="mt-2 space-y-2.5">
                    {pathway.courses
                      .filter((course) => course.grade === grade)
                      .map((course) => (
                        <li key={course.course} className="rounded-2xl border border-line p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">{course.course}</span>
                            <Tag tone={course.kind === "AP" ? "accent" : "plain"}>{course.kind}</Tag>
                          </div>
                          {course.why && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{course.why}</p>}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        )}

        {show("majors") && pathway.majors.length > 0 && (
          <Section id="pathway-majors" icon={<GraduationCap className="size-5" />} title="College majors that lead here">
            <ul className="grid gap-3 md:grid-cols-3">
              {pathway.majors.map((major) => (
                <li key={major.cip} className="flex flex-col rounded-2xl border border-line p-4">
                  <span className="font-semibold leading-snug text-ink">{major.title}</span>
                  <span className="mt-1 text-xs font-medium text-ink-muted">Offered at {major.florida_colleges} Florida colleges</span>
                  {(major.includes?.length ?? 0) > 0 && (
                    <span className="mt-1 text-xs text-ink-muted">Includes {major.includes!.slice(0, 3).join(", ")}</span>
                  )}
                  {major.why && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{major.why}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {show("colleges") && pathway.colleges.length > 0 && (
          <Section
            id="pathway-colleges"
            icon={<School className="size-5" />}
            title="Florida colleges and universities to look at"
            intro="Cost is the average a year after grants and scholarships. Earnings are the median for that program's graduates."
          >
            {[
              { label: "Universities", items: universities },
              { label: "Start at a state college, then transfer", items: stateColleges },
            ]
              .filter((group) => group.items.length)
              .map((group) => (
                <div key={group.label} className="mt-5 first:mt-0">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{group.label}</h4>
                  <ul className="mt-2 grid gap-3 md:grid-cols-2">
                    {group.items.map((college) => (
                      <li key={college.id} className="flex flex-col rounded-2xl border border-line p-4">
                        <div className="flex items-start justify-between gap-2">
                          {college.url ? (
                            <a href={college.url} target="_blank" rel="noreferrer" className="font-semibold leading-snug text-ink hover:underline">
                              {college.name}
                              <ExternalLink aria-hidden className="ml-1 inline size-3.5 text-ink-muted" />
                            </a>
                          ) : (
                            <span className="font-semibold leading-snug text-ink">{college.name}</span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Tag>{college.city}</Tag>
                          <Tag>
                            {college.ownership} {college.kind}
                          </Tag>
                          {college.central_florida && <Tag tone="accent">Near NeoCity</Tag>}
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <dt className="text-xs text-ink-muted">Cost after aid</dt>
                            <dd className="font-semibold text-ink">{college.net_price ? `${dollars(college.net_price)}/yr` : "Not published"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-ink-muted">Graduation rate</dt>
                            <dd className="font-semibold text-ink">{college.graduation_rate != null ? `${college.graduation_rate}%` : "Not published"}</dd>
                          </div>
                        </dl>
                        {college.programs.length > 0 && (
                          <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                            {college.programs.slice(0, 3).map((program) => (
                              <li key={`${program.cip4}-${program.credential}`} className="text-ink">
                                {program.credential} in {program.title}
                                {program.earnings_median ? (
                                  <span className="text-ink-muted">
                                    {" "}
                                    · graduates earn {dollars(program.earnings_median)} ({program.earnings_years} yr after)
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                        {college.why && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{college.why}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </Section>
        )}

        {show("certifications") && pathway.certifications.length > 0 && (
          <Section id="pathway-certs" icon={<Award className="size-5" />} title="Certifications to work toward">
            <ul className="space-y-3">
              {pathway.certifications.map((cert) => (
                <li key={cert.id} className="rounded-2xl border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {cert.url ? (
                      <a href={cert.url} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:underline">
                        {cert.name}
                        <ExternalLink aria-hidden className="ml-1 inline size-3.5 text-ink-muted" />
                      </a>
                    ) : (
                      <span className="font-semibold text-ink">{cert.name}</span>
                    )}
                    <Tag tone={cert.beginner_friendly ? "accent" : "plain"}>
                      {cert.beginner_friendly ? "No degree needed" : "Needs a degree or work experience first"}
                    </Tag>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">From {cert.organization}</p>
                  {cert.why && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{cert.why}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {sources.length > 0 && (
        <p className="mt-7 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
          Sources: {sources.map((source) => source.name).join("; ")}. Check details with each college and your school counselor.
        </p>
      )}
    </section>
  );
}
