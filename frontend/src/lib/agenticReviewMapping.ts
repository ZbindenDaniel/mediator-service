// TODO(agentic-review-mapping): Keep question semantics and payload field mapping aligned across checklist UI revisions.
export interface AgenticReviewQuestionAnswers {
  descriptionMatches: boolean;
  shortTextMatches: boolean;
  hasUnnecessarySpecs: boolean;
  hasMissingSpecs: boolean;
  dimensionsPlausible: boolean;
}

export interface AgenticReviewInput {
  information_present: boolean;
  bad_format: boolean;
  wrong_information: boolean;
  wrong_physical_dimensions: boolean;
  missing_spec: string[];
  unneeded_spec: string[];
  notes: string | null;
  reviewedBy: string | null;
}

export function parseMissingSpecInput(value: string | null): string[] {
  if (!value) {
    return [];
  }
  const deduped = new Map<string, string>();
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const key = entry.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, entry);
      }
    });
  return Array.from(deduped.values()).slice(0, 10);
}

export function mapReviewAnswersToInput(
  answers: AgenticReviewQuestionAnswers,
  options: { missingSpecRaw: string | null; unneededSpecRaw?: string | null; unneededSpecKeys?: string[]; notes: string; reviewedBy?: string | null }
): AgenticReviewInput {
  return {
    information_present: !answers.hasMissingSpecs,
    bad_format: !answers.descriptionMatches || !answers.shortTextMatches,
    wrong_information: answers.hasUnnecessarySpecs,
    wrong_physical_dimensions: !answers.dimensionsPlausible,
    missing_spec: parseMissingSpecInput(options.missingSpecRaw),
    unneeded_spec: Array.isArray(options.unneededSpecKeys)
      ? parseMissingSpecInput(options.unneededSpecKeys.join(","))
      : parseMissingSpecInput(options.unneededSpecRaw ?? null),
    notes: options.notes.trim() ? options.notes.trim() : null,
    reviewedBy: options.reviewedBy ?? null
  };
}
