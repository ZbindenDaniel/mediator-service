import { parseLangtext } from './langtext';
import { applySpecContract } from '../../../models/spec-contract';
import type { SpecContract } from '../../../models/spec-contract';

// Article specs at creation: the category is known by the time the details form opens, so the
// Langtext editor starts with one (empty) entry per spec-contract field instead of nothing.

const quiet = { warn: () => undefined, error: () => undefined };

/** Langtext with an empty entry per contract field (existing values kept); legacy free text is left alone. */
export function prefillSpecFields(langtext: unknown, contract: SpecContract): unknown {
  const parsed = parseLangtext(langtext ?? '', quiet);
  if (parsed.mode === 'text' && parsed.text.trim()) return langtext;
  const base = parsed.mode === 'json' ? parsed.rawObject : {};
  return JSON.stringify(applySpecContract(contract, base));
}

/** Required contract fields that are still empty — a warning at save time, never a block. */
export function missingRequiredSpecs(langtext: unknown, contract: SpecContract): string[] {
  const parsed = parseLangtext(langtext ?? '', quiet);
  const values = parsed.mode === 'json' ? parsed.rawObject : {};
  return contract.fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = values[f.key];
      return Array.isArray(v) ? v.every((x) => !String(x).trim()) : !String(v ?? '').trim();
    })
    .map((f) => f.key);
}
