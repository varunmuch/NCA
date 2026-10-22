export type EducationLevel = { level: string; percent: number };

function normalize(level: string) {
  return level.split(" - ")[0].toLowerCase().replace(/ or other 2-year degree| or the equivalent.*$/g, "").trim();
}

/**
 * The official "typical entry" education can hide a common route: BLS lists
 * a master's for AI engineers, but 36% of workers O*NET surveyed say a
 * bachelor's is what the job requires. Returns a sentence when the most
 * common reported level differs from the typical entry, else null.
 */
export function surveyNote(typicalEntry: string | null | undefined, levels: EducationLevel[] | undefined, smallSample = false) {
  const top = levels?.[0];

  if (!top || !typicalEntry || normalize(top.level) === normalize(typicalEntry)) {
    return null;
  }

  const level = top.level.split(" - ")[0].toLowerCase().replace("'s degree", "'s degree");

  return `${top.percent}% of workers surveyed say a ${level} is what the job requires${smallSample ? " (small survey)" : ""}.`;
}
