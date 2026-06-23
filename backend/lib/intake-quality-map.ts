import type { IntakeScanPayload, IntakeQuestion } from '../../models/intake';
import type { QualityQuestion } from '../../models/quality-contract';

// Maps scan payload fields to quality question defaultValues.
// Only populate defaults for questions whose specField matches a reliable scan field.
type ScanMapper = (scan: IntakeScanPayload) => string | null;

const FIELD_MAPPERS: Record<string, ScanMapper> = {
  drive_type: (scan) => {
    const disk = scan.disks?.[0];
    if (!disk) return null;
    const t = (disk.type || '').toLowerCase();
    if (t.includes('nvme')) return 'NVMe SSD';
    if (t.includes('ssd')) return 'SSD';
    if (t.includes('hdd')) return 'HDD';
    if (t.includes('emmc')) return 'eMMC';
    return null;
  }
};

export function preFillQualityQuestions(
  questions: QualityQuestion[],
  scan: IntakeScanPayload
): IntakeQuestion[] {
  return questions.map((q): IntakeQuestion => {
    const mapper = FIELD_MAPPERS[q.id];
    const defaultValue = mapper ? mapper(scan) ?? undefined : undefined;
    const result: IntakeQuestion = {
      id: q.id,
      type: q.type as IntakeQuestion['type'],
      question: q.question,
    };
    if ('values' in q && q.values) result.values = q.values;
    if ('suggestions' in q && q.suggestions) result.suggestions = q.suggestions;
    if (q.specField) result.specField = q.specField;
    if (defaultValue !== undefined) result.defaultValue = defaultValue;
    if (q.showIf) result.showIf = q.showIf;
    return result;
  });
}
