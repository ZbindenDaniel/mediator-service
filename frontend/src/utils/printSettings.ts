import { logger } from './logger';

type MaybeNodeProcess = typeof process | { env?: Record<string, string | undefined> };

export interface AutoPrintItemLabelConfig {
  enabled: boolean;
  hadInput: boolean;
  invalid: boolean;
  rawValue: string | null;
}

// TODO(agent): Confirm AUTO_PRINT_ITEM_LABEL default and document the configuration source.
function resolveAutoPrintItemLabelRaw(): string | null {
  const candidateProcess = (globalThis as { process?: MaybeNodeProcess }).process;
  if (candidateProcess && typeof candidateProcess === 'object' && candidateProcess.env) {
    const raw = candidateProcess.env.AUTO_PRINT_ITEM_LABEL;
    if (typeof raw === 'string') {
      return raw;
    }
  }
  return null;
}

function parseBooleanFlag(rawValue: string | null): AutoPrintItemLabelConfig {
  const trimmed = rawValue?.trim() ?? '';
  if (!trimmed) {
    return {
      enabled: false,
      hadInput: false,
      invalid: false,
      rawValue
    };
  }

  const normalized = trimmed.toLowerCase();
  const truthy = new Set(['1', 'true', 'yes', 'on']);
  const falsy = new Set(['0', 'false', 'no', 'off']);

  if (truthy.has(normalized)) {
    return {
      enabled: true,
      hadInput: true,
      invalid: false,
      rawValue
    };
  }

  if (falsy.has(normalized)) {
    return {
      enabled: false,
      hadInput: true,
      invalid: false,
      rawValue
    };
  }

  return {
    enabled: false,
    hadInput: true,
    invalid: true,
    rawValue
  };
}

const parsedAutoPrintItemLabel = parseBooleanFlag(resolveAutoPrintItemLabelRaw());

if (typeof console !== 'undefined') {
  if (!parsedAutoPrintItemLabel.hadInput) {
    logger.info?.('[ui] AUTO_PRINT_ITEM_LABEL not configured; defaulting to disabled.');
  } else if (parsedAutoPrintItemLabel.invalid) {
    logger.warn?.('[ui] AUTO_PRINT_ITEM_LABEL is misconfigured; defaulting to disabled.', {
      value: parsedAutoPrintItemLabel.rawValue
    });
  }
}

export const AUTO_PRINT_ITEM_LABEL_CONFIG: AutoPrintItemLabelConfig = Object.freeze({
  ...parsedAutoPrintItemLabel
});
