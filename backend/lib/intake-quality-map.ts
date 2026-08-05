import type { IntakeScanPayload, IntakeQuestion, IntakeComponent } from '../../models/intake';
import type { QualityQuestion } from '../../models/quality-contract';

// Maps scan payload fields to quality/assembly question defaultValues.
type ScanMapper = (scan: IntakeScanPayload) => string | null;

/** Rounds a value to the nearest option in a sorted array of numbers. */
function roundToNearest(value: number, options: number[]): number {
  return options.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

/**
 * Unify the detected sub-devices into one `IntakeComponent[]`: the canonical `components` list
 * plus the `disks` shorthand mapped to `kind:'disk'` (slotKey = the device name). This is the one
 * place the two input shapes converge, so everything downstream sees a single list.
 */
export function normalizeScanComponents(scan: IntakeScanPayload): IntakeComponent[] {
  const out: IntakeComponent[] = Array.isArray(scan.components) ? [...scan.components] : [];
  if (Array.isArray(scan.disks)) {
    for (const d of scan.disks) {
      out.push({
        kind: 'disk',
        slotKey: d.name ?? null,
        serial: d.serial ?? null,
        wwn: d.wwn ?? null,
        model: d.model ?? null,
        type: d.type ?? null,
        sizeGb: d.sizeGb ?? null,
      });
    }
  }
  return out;
}

/** First detected component of a given kind (helper for spec derivation). */
function firstOfKind(scan: IntakeScanPayload, kind: string): IntakeComponent | undefined {
  return normalizeScanComponents(scan).find((c) => c.kind === kind);
}

const FIELD_MAPPERS: Record<string, ScanMapper> = {
  drive_type: (scan) => driveTypeLabel(firstOfKind(scan, 'disk')?.type),

  ram_gb: (scan) => {
    if (!scan.ramMb || scan.ramMb <= 0) return null;
    const gb = scan.ramMb / 1024;
    const nearest = roundToNearest(gb, [2, 4, 8, 16, 32, 64, 128]);
    return String(nearest);
  },

  storage_gb: (scan) => {
    const disk = firstOfKind(scan, 'disk');
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

// Canonical drive-type label from a scanned type string. Shared with the drive_type prefill.
function driveTypeLabel(type: string | null | undefined): string | null {
  const t = (type || '').toLowerCase();
  if (t.includes('nvme')) return 'NVMe SSD';
  if (t.includes('ssd')) return 'SSD';
  if (t.includes('hdd')) return 'HDD';
  if (t.includes('emmc')) return 'eMMC';
  return null;
}

/**
 * Derive instance-level specs directly from the hardware scan, using the CANONICAL spec-contract
 * keys (Prozessor / RAM / Speicher / Speichertyp). These are the "obviously present because the
 * device booted" specs. Callers merge script/operator-provided values ON TOP, so an explicit
 * value always wins over the scan-derived one. Keys must match contracts/specs/<subcat>.json.
 */
export function deriveInstanceSpecsFromScan(scan: IntakeScanPayload): Record<string, string> {
  const specs: Record<string, string> = {};
  const cpu = (scan.cpu || '').trim();
  if (cpu) specs['Prozessor'] = cpu;
  if (scan.ramMb && scan.ramMb > 0) {
    specs['RAM'] = `${roundToNearest(scan.ramMb / 1024, [2, 4, 8, 16, 32, 64, 128])} GB`;
  }
  const disk = firstOfKind(scan, 'disk');
  if (disk?.sizeGb && disk.sizeGb > 0) {
    specs['Speicher'] = `${roundToNearest(disk.sizeGb, [128, 256, 512, 1000, 2000])} GB`;
  }
  const type = driveTypeLabel(disk?.type);
  if (type) specs['Speichertyp'] = type;
  return specs;
}

/**
 * Prefill an assembly question from a detected component, by slot-key convention:
 *   • a boolean presence question `has_<slotKey>` → "true" (the device was detected)
 *   • a spec question `<slotKey>_model` → the component's model
 * This is how detected PCI devices (GPU, NIC, …) fill assembly info without being auto-created —
 * the operator just confirms the pre-answered slot. Returns undefined when no component matches.
 */
function componentPrefill(questionId: string, components: IntakeComponent[]): string | undefined {
  for (const c of components) {
    const slot = (c.slotKey || '').trim();
    if (!slot) continue;
    if (questionId === `has_${slot}`) return 'true';
    if (questionId === `${slot}_model` && c.model) return String(c.model);
  }
  return undefined;
}

export function preFillQualityQuestions(
  questions: QualityQuestion[],
  scan: IntakeScanPayload
): IntakeQuestion[] {
  const components = normalizeScanComponents(scan);
  return questions.map((q): IntakeQuestion => {
    const mapper = FIELD_MAPPERS[q.id];
    // Scalar scan mappers take precedence; component-driven prefill covers the rest.
    const defaultValue = (mapper ? mapper(scan) ?? undefined : undefined)
      ?? componentPrefill(q.id, components);
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
