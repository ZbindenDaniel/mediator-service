// TODO(quality-scale): Revisit quality labels and thresholds when merchandising finalizes the rubric.

export type QualityTag = 'Ersatzteil' | 'Upcycling' | 'Ok' | 'Gut' | 'Neuwertig';
export type AiPriority = 'high' | 'normal' | 'low';

export interface QualityAssessment {
  id: number;
  tag: QualityTag;
  value: number;
  is_complete: boolean | null;
  has_defects: boolean | null;
  is_functional: boolean | null;
  notes: string | null;
  reviewed_at: string;
  reviewed_by: string;
}

export type QualityAssessmentInsert = Omit<QualityAssessment, 'id'>;

export interface PhysicalConditionAnswers {
  is_complete: boolean | null;
  has_defects: boolean | null;
  is_functional: boolean | null;
}

export function deriveQualityTagFromCondition(answers: PhysicalConditionAnswers): { tag: QualityTag; value: number } {
  if (answers.is_functional === false) {
    return { tag: 'Ersatzteil', value: 1 };
  }
  if (answers.has_defects === true && answers.is_complete === false) {
    return { tag: 'Upcycling', value: 2 };
  }
  if (answers.has_defects === true || answers.is_complete === false) {
    return { tag: 'Ok', value: 3 };
  }
  return { tag: 'Gut', value: 4 };
}

export function deriveAiPriorityFromAssessment(value: number): AiPriority {
  if (value <= 2) return 'high';
  if (value === 3) return 'normal';
  return 'low';
}

export const QUALITY_MIN = 1 as const;
export const QUALITY_MAX = 5 as const;
export const QUALITY_DEFAULT = 3 as const;
export const QUALITY_UNKNOWN_LABEL = '?' as const;
export const QUALITY_UNKNOWN_COLOR = 'gray' as const;
export type QualityValue = number | null;

export const QUALITY_COLOR_MAP: Record<number, 'purple' | 'red' | 'yellow' | 'orange' | 'green'> = {
  1: 'purple',
  2: 'red',
  3: 'yellow',
  4: 'orange',
  5: 'green'
};

export const QUALITY_LABELS: Record<number, string> = {
  1: 'Ersatzteil',
  2: 'Upcycling',
  3: 'Ok',
  4: 'Gut',
  5: 'Neuwertig'
};

const QUALITY_LABEL_LOOKUP: Readonly<Record<string, number>> = Object.freeze(
  Object.entries(QUALITY_LABELS).reduce<Record<string, number>>((acc, [rawValue, label]) => {
    acc[label.toLowerCase()] = Number.parseInt(rawValue, 10);
    return acc;
  }, {})
);

export function normalizeQuality(
  value: unknown,
  logger: Pick<Console, 'warn' | 'error'> = console
): number | null {
  try {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return clampQuality(Math.round(value));
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isNaN(parsed)) {
        logger.warn?.('[quality] Ignoring non-numeric quality value', { value });
        return null;
      }
      return clampQuality(parsed);
    }
    if (value === null || value === undefined) {
      return null;
    }
    logger.warn?.('[quality] Unexpected quality type, leaving quality unset', { type: typeof value });
  } catch (error) {
    logger.error?.('[quality] Failed to normalize quality value', error);
  }
  return null;
}

export function resolveQualityFromLabel(
  value: unknown,
  logger: Pick<Console, 'warn' | 'error'> = console
): number | null {
  try {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return normalizeQuality(value, logger);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(parsed)) {
        return normalizeQuality(parsed, logger);
      }
      const mapped = QUALITY_LABEL_LOOKUP[trimmed.toLowerCase()];
      if (typeof mapped === 'number') {
        return normalizeQuality(mapped, logger);
      }
      logger.warn?.('[quality] Unrecognized quality label', { value: trimmed });
      return null;
    }
    if (value === null || value === undefined) {
      return null;
    }
    logger.warn?.('[quality] Unexpected quality label type', { type: typeof value });
  } catch (error) {
    logger.error?.('[quality] Failed to resolve quality label', error);
  }
  return null;
}

function clampQuality(value: number): number {
  if (value < QUALITY_MIN) {
    return QUALITY_MIN;
  }
  if (value > QUALITY_MAX) {
    return QUALITY_MAX;
  }
  return value;
}

export function describeQuality(
  value: unknown
): { value: number | null; label: string; color: typeof QUALITY_UNKNOWN_COLOR | (typeof QUALITY_COLOR_MAP)[number] } {
  const normalized = normalizeQuality(value);
  if (normalized === null) {
    return {
      value: null,
      label: QUALITY_UNKNOWN_LABEL,
      color: QUALITY_UNKNOWN_COLOR
    };
  }
  const label = QUALITY_LABELS[normalized];
  const color = QUALITY_COLOR_MAP[normalized];
  if (!label || !color) {
    console.warn('[quality] Missing quality label/color mapping', { normalized });
    return {
      value: normalized,
      label: QUALITY_UNKNOWN_LABEL,
      color: QUALITY_UNKNOWN_COLOR
    };
  }
  return { value: normalized, label, color };
}
