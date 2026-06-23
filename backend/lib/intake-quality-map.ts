import type { IntakeScanPayload, IntakeQuestion } from '../../models/intake';
import type { QualityQuestion } from '../../models/quality-contract';

// Maps scan payload fields to quality/assembly question defaultValues.
type ScanMapper = (scan: IntakeScanPayload) => string | null;

/** Rounds a value to the nearest option in a sorted array of numbers. */
function roundToNearest(value: number, options: number[]): number {
  return options.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

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
  },

  ram_gb: (scan) => {
    if (!scan.ramMb || scan.ramMb <= 0) return null;
    const gb = scan.ramMb / 1024;
    const nearest = roundToNearest(gb, [2, 4, 8, 16, 32, 64, 128]);
    return String(nearest);
  },

  storage_gb: (scan) => {
    const disk = scan.disks?.[0];
    if (!disk?.sizeGb || disk.sizeGb <= 0) return null;
    const nearest = roundToNearest(disk.sizeGb, [128, 256, 512, 1000, 2000]);
    return String(nearest);
  },

  battery_condition: (scan) => {
    if (scan.batteryPercent == null) return null;
    if (scan.batteryPercent >= 80) return 'Gut (>80%)';
    if (scan.batteryPercent >= 50) return 'Mittel (50–80%)';
    return 'Schwach (<50%)';
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
