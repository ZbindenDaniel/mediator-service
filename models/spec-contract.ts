export interface SpecContractField {
  key: string;
  required: boolean;
  description: string;
}

export interface SpecContract {
  version: number;
  subCategory?: number;
  fields: SpecContractField[];
}

export interface SpecGapResult {
  missingRequired: string[];
  missingDesired: string[];
  presentFields: string[];
  contractVersion: number;
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
  for (const field of contract.fields) {
    const value = langtext[field.key];
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
