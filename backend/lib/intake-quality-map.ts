import type { IntakeScanPayload, IntakeQuestion, IntakeComponent } from '../../models/intake';
import type { QualityQuestion } from '../../models/quality-contract';

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

// Canonical drive-type label from a scanned type string.
function driveTypeLabel(type: string | null | undefined): string | null {
  const t = (type || '').toLowerCase();
  if (t.includes('nvme')) return 'NVMe SSD';
  if (t.includes('ssd')) return 'SSD';
  if (t.includes('hdd')) return 'HDD';
  if (t.includes('emmc')) return 'eMMC';
  return null;
}

// Named scan "signals" — the adapters from the scan payload to a raw value. A contract question
// references one via `autoFill`. This is the ONLY code coupling: a signal exists iff the image
// actually gathers that data. WHICH question uses WHICH signal lives in the contract JSON, not
// here — so renaming/adding auto-filled questions is a JSON change, not a code change.
// A numeric signal is snapped to the question's own `values` (no hardcoded option arrays).
type ScanSignal = (scan: IntakeScanPayload) => number | string | null;

const SCAN_SIGNALS: Record<string, ScanSignal> = {
  ram: (scan) => (scan.ramMb && scan.ramMb > 0 ? scan.ramMb / 1024 : null),
  storageSize: (scan) => {
    const disk = firstOfKind(scan, 'disk');
    return disk?.sizeGb && disk.sizeGb > 0 ? disk.sizeGb : null;
  },
  storageType: (scan) => driveTypeLabel(firstOfKind(scan, 'disk')?.type),
  // Percent → labelled bucket. The labels must match the question's `values`.
  battery: (scan) => {
    if (scan.batteryPercent == null) return null;
    if (scan.batteryPercent >= 80) return 'Gut (>80%)';
    if (scan.batteryPercent >= 50) return 'Mittel (50–80%)';
    return 'Schwach (<50%)';
  },
};

/** Parse a select question's options as numbers, or null when they aren't all numeric. */
function numericOptions(q: QualityQuestion): number[] | null {
  if (!('values' in q) || !q.values) return null;
  const nums = q.values.map((v) => Number(v));
  return nums.every((n) => Number.isFinite(n)) ? nums : null;
}

/**
 * Resolve a question's `autoFill` binding to a concrete answer, or undefined when the scan can't
 * answer it (missing data, unknown signal, or a string result outside the offered options).
 * Numeric signals snap to the question's own `values`.
 */
export function resolveAutoFill(q: QualityQuestion, scan: IntakeScanPayload): string | undefined {
  const name = q.autoFill;
  if (!name) return undefined;
  const signal = SCAN_SIGNALS[name];
  if (!signal) return undefined;
  const raw = signal(scan);
  if (raw == null) return undefined;
  if (typeof raw === 'number') {
    const nums = numericOptions(q);
    return String(nums ? roundToNearest(raw, nums) : raw);
  }
  // A string answer must be one of the offered options, else we ask rather than store junk.
  if ('values' in q && q.values && !q.values.includes(raw)) return undefined;
  return raw;
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

/** Project a contract question to the wire shape the intake TUI renders, applying prefills. */
function toIntakeQuestion(q: QualityQuestion, components: IntakeComponent[]): IntakeQuestion {
  const defaultValue = componentPrefill(q.id, components);
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
}

/** A scan-derived answer, rendered for display so the operator sees what was filled in. */
export interface IntakeDetectedSpec {
  id: string;
  label: string;
  value: string;
}

export interface IntakeQuestionResolution {
  ask: IntakeQuestion[];
  autoAnswers: Record<string, string>;
  /** autoFill questions the scan answered — shown to the operator instead of asked. */
  detected: IntakeDetectedSpec[];
  /** autoFill questions the scan could NOT answer (signal null / value off-list), so they are
   *  still asked. This is the diagnostic that makes a mis-scan visible (e.g. NVMe size = 0). */
  unresolvedAutoFill: { id: string; autoFill: string }[];
}

/** Render an auto-resolved answer the way its spec value would read (e.g. "8" → "8 GB"). */
function renderDetectedValue(q: QualityQuestion, answer: string): string {
  return q.specValue ? q.specValue.replace('%v', answer) : answer;
}

/**
 * Split the merged contract questions into what to ASK the operator vs. what the server
 * AUTO-answers at intake. A question is auto-resolved (and dropped from `ask`) when:
 *   • `skipAtIntake` — a booted device implies it → assume "true" for booleans; or
 *   • `autoFill` — the scan yields a value via its named signal.
 * Everything else is asked (with component-driven prefills). The caller merges `autoAnswers`
 * under the submitted answers (operator/script value wins) before scoring/spec derivation.
 * `detected` lists the scan-answered spec questions so the caller can show them to the operator;
 * `unresolvedAutoFill` lists autoFill questions the scan failed to answer (still asked).
 */
export function resolveIntakeQuestions(
  questions: QualityQuestion[],
  scan: IntakeScanPayload
): IntakeQuestionResolution {
  const components = normalizeScanComponents(scan);
  const autoAnswers: Record<string, string> = {};
  const detected: IntakeDetectedSpec[] = [];
  const unresolvedAutoFill: { id: string; autoFill: string }[] = [];
  const pending: QualityQuestion[] = [];
  for (const q of questions) {
    if (q.skipAtIntake) {
      if (q.type === 'boolean') autoAnswers[q.id] = 'true';
      continue;
    }
    const auto = resolveAutoFill(q, scan);
    if (auto !== undefined) {
      autoAnswers[q.id] = auto;
      // Only surface genuine spec answers (autoFill) to the operator — a skipAtIntake presence
      // assumption ("Lüfter vorhanden: ja") is noise, not an informative detected spec.
      detected.push({ id: q.id, label: q.specField ?? q.question, value: renderDetectedValue(q, auto) });
      continue;
    }
    // An autoFill question that did NOT resolve is being asked despite the scan being expected to
    // answer it — record it so the caller can log the mis-scan (the NVMe size=0 class of bug).
    if (q.autoFill) unresolvedAutoFill.push({ id: q.id, autoFill: q.autoFill });
    pending.push(q);
  }
  // Resolve showIf against auto-answered controllers: the script never sees auto-answers, so a
  // dependent whose controller was auto-resolved would be wrongly hidden client-side. Decide it
  // here — drop when the condition isn't met, else ask it unconditionally (strip the showIf).
  const ask: IntakeQuestion[] = [];
  for (const q of pending) {
    const iq = toIntakeQuestion(q, components);
    if (q.showIf && q.showIf.questionId in autoAnswers) {
      if (autoAnswers[q.showIf.questionId] === q.showIf.value) delete iq.showIf;
      else continue;
    }
    ask.push(iq);
  }
  return { ask, autoAnswers, detected, unresolvedAutoFill };
}
