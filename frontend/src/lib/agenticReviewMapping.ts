// TODO(agentic-review-mapping): Keep question semantics and payload field mapping aligned across checklist UI revisions.
export interface AgenticReviewQuestionAnswers {
  plausible: boolean;
  formattingCorrect: boolean;
  missingExpectedInfo: boolean;
  requiredDimensionsMissing: boolean;
}

export interface AgenticReviewInput {
  information_present: boolean;
  bad_format: boolean;
  wrong_information: boolean;
  wrong_physical_dimensions: boolean;
  missing_spec: string[];
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
  options: { missingSpecRaw: string | null; notes: string; reviewedBy?: string | null }
): AgenticReviewInput {
  return {
    information_present: !answers.missingExpectedInfo,
    bad_format: !answers.formattingCorrect,
    wrong_information: !answers.plausible,
    wrong_physical_dimensions: answers.requiredDimensionsMissing,
    missing_spec: parseMissingSpecInput(options.missingSpecRaw),
    notes: options.notes.trim() ? options.notes.trim() : null,
    reviewedBy: options.reviewedBy ?? null
  };
}
