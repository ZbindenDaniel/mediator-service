export interface SpecContractField {
  key: string;
  required: boolean;
  description: string;
}

export interface SpecContract {
  version: number;
  subCategory?: number;
  fields: SpecContractField[];
  // Optional human-authored, category-level prompt snippets injected into the agentic extraction and
  // supervisor prompts for this subcategory (e.g. "3.5\" HDDs usually measure 146×101×26 mm"). Free-form
  // guidance to steer the model on things it often gets wrong; each entry is sanitized before injection.
  guidance?: string[];
}

export interface SpecGapResult {
  missingRequired: string[];
  missingDesired: string[];
  presentFields: string[];
  contractVersion: number;
}

// Internal canonicalization of spec sub-keys. The extraction prompt invites free-form keys, so the
// model sometimes emits a variant ("CPU") of a canonical contract key ("Prozessor"). We keep a single
// canonical name in the stored data by folding known variants onto the contract key — kept in code
// (NOT as a visible `aliases[]` on the contract JSON) so contracts stay single-name and readable.
// Only high-confidence hardware-spec synonyms are listed to avoid mis-folding.
const SPEC_KEY_VARIANTS: Record<string, string[]> = {
  Prozessor: ['CPU', 'Processor', 'Prozessortyp', 'CPU-Modell', 'Prozessor (CPU)'],
  RAM: ['Arbeitsspeicher', 'Memory', 'Hauptspeicher', 'RAM-Größe'],
  Speicher: ['Storage', 'Festplatte', 'Speicherkapazität', 'Speichergröße'],
  Speichertyp: ['Storage Type', 'Laufwerkstyp', 'Drive Type'],
  Grafikkarte: ['GPU', 'Graphics', 'Graphics Card', 'Grafik'],
  Betriebssystem: ['OS', 'Operating System'],
};

// Reverse lookup: lowercased variant → canonical key. Built once at module load.
const SPEC_VARIANT_TO_CANONICAL: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonical, variants] of Object.entries(SPEC_KEY_VARIANTS)) {
    for (const variant of variants) {
      map.set(variant.trim().toLowerCase(), canonical);
    }
  }
  return map;
})();

/**
 * Resolves a spec sub-key to its canonical contract-key form, or returns it unchanged when it is not
 * a known variant. Case-insensitive on the variant side.
 */
export function canonicalizeSpecKey(key: string): string {
  return SPEC_VARIANT_TO_CANONICAL.get(key.trim().toLowerCase()) ?? key;
}

/**
 * Folds known variant keys in a Langtext record onto their canonical contract key, keeping a single
 * canonical name. A variant value is only adopted when the canonical key is absent/empty (an explicit
 * canonical value always wins), and the variant key is dropped so no duplicate sibling remains.
 * Returns a new object; leaves the input untouched.
 */
export function canonicalizeSpecKeyRecord<T = unknown>(
  langtext: Record<string, T>
): Record<string, T> {
  const result: Record<string, T> = {};
  const foldedVariantKeys: string[] = [];
  for (const [key, value] of Object.entries(langtext)) {
    const canonical = canonicalizeSpecKey(key);
    if (canonical === key) {
      // Not a variant — preserve as-is unless a variant already claimed this canonical slot.
      if (!(key in result)) {
        result[key] = value;
      }
      continue;
    }
    foldedVariantKeys.push(key);
    const canonicalHasValue =
      result[canonical] !== undefined && result[canonical] !== null && String(result[canonical]).trim() !== '';
    const canonicalInSource =
      langtext[canonical] !== undefined && langtext[canonical] !== null && String(langtext[canonical]).trim() !== '';
    // Adopt the variant value only when the canonical key is not already carrying a real value.
    if (!canonicalHasValue && !canonicalInSource) {
      result[canonical] = value;
    }
    // else: drop the variant (canonical wins); the canonical entry is copied when its own key is iterated.
  }
  return result;
}

// --- Spec VALUE canonicalization (lever L11) ---------------------------------------------------
// The value-level twin of SPEC_KEY_VARIANTS: per (canonical) field key, a controlled vocabulary mapping
// each canonical value to its known variants. Folds free-form values that mean the same thing
// (DP / Display Port / Displayport → DisplayPort) so items group/filter and the conformance signal is
// clean. Deterministic, whole-value, case-insensitive — the safe "auto-correct a known" (no prose
// surgery, no model). SEED ONLY: extend per house style. Compound/multi-token values ("DP, HDMI") and an
// operator-editable home (a runtime standards file) are deferred — see PLANNING_agentic_levers.md §2d.
const SPEC_VALUE_VARIANTS: Record<string, Record<string, string[]>> = {
  'Anschlüsse': { 'DisplayPort': ['DP', 'Display Port', 'Displayport'] },
  'Speichertyp': { 'SSD': ['Solid State Drive', 'Solid-State-Drive'] },
};

// field key (lowercased) → (variant lowercased → canonical value). A canonical value maps to itself, so
// re-running is idempotent. Built once at module load.
const SPEC_VALUE_LOOKUP: Map<string, Map<string, string>> = (() => {
  const byField = new Map<string, Map<string, string>>();
  for (const [field, canonicals] of Object.entries(SPEC_VALUE_VARIANTS)) {
    const m = new Map<string, string>();
    for (const [canonical, variants] of Object.entries(canonicals)) {
      m.set(canonical.trim().toLowerCase(), canonical);
      for (const variant of variants) m.set(variant.trim().toLowerCase(), canonical);
    }
    byField.set(field.trim().toLowerCase(), m);
  }
  return byField;
})();

/** Canonical form of a single spec VALUE for a (canonical) field key, or the value unchanged. */
export function canonicalizeSpecValue(key: string, value: string): string {
  const m = SPEC_VALUE_LOOKUP.get(key.trim().toLowerCase());
  if (!m) return value;
  return m.get(value.trim().toLowerCase()) ?? value;
}

/**
 * Folds known value variants in a Langtext record onto their canonical value, per field. Applies to
 * string values and to each entry of a string array; non-strings and unknown fields pass through
 * untouched. Returns a new object. Call AFTER canonicalizeSpecKeyRecord so field keys are canonical.
 */
export function canonicalizeSpecValuesRecord<T = unknown>(langtext: Record<string, T>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(langtext)) {
    if (typeof value === 'string') {
      result[key] = canonicalizeSpecValue(key, value) as T;
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) => (typeof v === 'string' ? canonicalizeSpecValue(key, v) : v)) as T;
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Merges contract fields into langtext as empty strings without overwriting existing values.
 * Empty-string entries signal to operators and agents that the field is expected but not yet filled.
 */
export function applySpecContract(
  contract: SpecContract,
  langtext: Record<string, string | string[]>
): Record<string, string | string[]> {
  const result = { ...langtext };
  let changed = false;
  for (const field of contract.fields) {
    if (result[field.key] === undefined || result[field.key] === null) {
      result[field.key] = '';
      changed = true;
    }
  }
  return changed ? result : langtext;
}

export function checkSpecGap(
  contract: SpecContract,
  langtext: Record<string, unknown>
): SpecGapResult {
  const missingRequired: string[] = [];
  const missingDesired: string[] = [];
  const presentFields: string[] = [];
  // Canonicalize first so a value stored under a variant key (e.g. "CPU") counts as present for its
  // canonical contract field ("Prozessor") instead of being reported missing.
  const canonicalLangtext = canonicalizeSpecKeyRecord(langtext);
  for (const field of contract.fields) {
    const value = canonicalLangtext[field.key];
    const present = value !== undefined && value !== null && value !== '';
    if (present) {
      presentFields.push(field.key);
    } else if (field.required) {
      missingRequired.push(field.key);
    } else {
      missingDesired.push(field.key);
    }
  }
  return { missingRequired, missingDesired, presentFields, contractVersion: contract.version };
}
