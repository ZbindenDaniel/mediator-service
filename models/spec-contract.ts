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
