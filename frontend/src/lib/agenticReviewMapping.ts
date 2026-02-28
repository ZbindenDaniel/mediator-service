import { AGENTIC_REVIEW_SPEC_MAX_ENTRIES } from '../../../models';
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
  review_price: number | null;
  shop_article: boolean | null;
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
  return Array.from(deduped.values()).slice(0, AGENTIC_REVIEW_SPEC_MAX_ENTRIES);
}

export function mapReviewAnswersToInput(
  answers: AgenticReviewQuestionAnswers,
  options: {
    missingSpecRaw: string | null;
    unneededSpecRaw?: string | null;
    unneededSpecKeys?: string[];
    notes?: string;
    reviewPrice?: number | null;
    shopArticle?: boolean | null;
    wrongInformation?: boolean | null;
    reviewedBy?: string | null;
  }
): AgenticReviewInput {
  // TODO(agentic-review-wrong-information): Wire a dedicated checklist input when reviewers need to flag factually wrong content.
  const noteValue = typeof options.notes === 'string' ? options.notes.trim() : '';
  const wrongInformation = typeof options.wrongInformation === 'boolean' ? options.wrongInformation : false;
  return {
    information_present: !answers.hasMissingSpecs,
    bad_format: !answers.descriptionMatches || !answers.shortTextMatches,
    wrong_information: wrongInformation,
    wrong_physical_dimensions: !answers.dimensionsPlausible,
    missing_spec: parseMissingSpecInput(options.missingSpecRaw),
    unneeded_spec: Array.isArray(options.unneededSpecKeys)
      ? parseMissingSpecInput(options.unneededSpecKeys.join(","))
      : parseMissingSpecInput(options.unneededSpecRaw ?? null),
    notes: noteValue ? noteValue : null,
    review_price: typeof options.reviewPrice === 'number' && Number.isFinite(options.reviewPrice)
      ? options.reviewPrice
      : null,
    shop_article: typeof options.shopArticle === 'boolean' ? options.shopArticle : null,
    reviewedBy: options.reviewedBy ?? null
  };
}
