import { logger } from './logger';

declare const __AUTO_PRINT_ITEM_LABEL__: string | null;

type MaybeNodeProcess = typeof process | { env?: Record<string, string | undefined> };
type AutoPrintItemLabelSource = 'define' | 'global' | 'process' | 'unset';

interface AutoPrintItemLabelRawResolution {
  rawValue: string | null;
  source: AutoPrintItemLabelSource;
}

export interface AutoPrintItemLabelConfig {
  enabled: boolean;
  hadInput: boolean;
  invalid: boolean;
  rawValue: string | null;
}

function resolveDefineAutoPrintItemLabelRaw(): string | null {
  try {
    if (typeof __AUTO_PRINT_ITEM_LABEL__ === 'string') {
      return __AUTO_PRINT_ITEM_LABEL__;
    }
  } catch (error) {
    logger.warn?.('[ui] Failed to resolve AUTO_PRINT_ITEM_LABEL from define source; falling back.', {
      error
    });
  }
  return null;
}

function resolveGlobalAutoPrintItemLabelRaw(): string | null {
  try {
    const candidateGlobalConfig = (globalThis as { __APP_CONFIG__?: Record<string, unknown> }).__APP_CONFIG__;
    if (candidateGlobalConfig && typeof candidateGlobalConfig === 'object') {
      const raw = candidateGlobalConfig.AUTO_PRINT_ITEM_LABEL;
      if (typeof raw === 'string') {
        return raw;
      }
    }
  } catch (error) {
    logger.warn?.('[ui] Failed to resolve AUTO_PRINT_ITEM_LABEL from global config; falling back.', {
      error
    });
  }
  return null;
}

function resolveProcessAutoPrintItemLabelRaw(): string | null {
  try {
    const candidateProcess = (globalThis as { process?: MaybeNodeProcess }).process;
    if (candidateProcess && typeof candidateProcess === 'object' && candidateProcess.env) {
      const raw = candidateProcess.env.AUTO_PRINT_ITEM_LABEL;
      if (typeof raw === 'string') {
        return raw;
      }
    }
  } catch (error) {
    logger.warn?.('[ui] Failed to resolve AUTO_PRINT_ITEM_LABEL from process.env; defaulting to unset.', {
      error
    });
  }
  return null;
}

function resolveAutoPrintItemLabelRaw(): AutoPrintItemLabelRawResolution {
  const defineRaw = resolveDefineAutoPrintItemLabelRaw();
  if (typeof defineRaw === 'string') {
    return {
      rawValue: defineRaw,
      source: 'define'
    };
  }

  const globalRaw = resolveGlobalAutoPrintItemLabelRaw();
  if (typeof globalRaw === 'string') {
    return {
      rawValue: globalRaw,
      source: 'global'
    };
  }

  const processRaw = resolveProcessAutoPrintItemLabelRaw();
  if (typeof processRaw === 'string') {
    return {
      rawValue: processRaw,
      source: 'process'
    };
  }

  return {
    rawValue: null,
    source: 'unset'
  };
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

const autoPrintItemLabelResolution = resolveAutoPrintItemLabelRaw();
const parsedAutoPrintItemLabel = parseBooleanFlag(autoPrintItemLabelResolution.rawValue);

if (typeof console !== 'undefined') {
  if (!parsedAutoPrintItemLabel.hadInput) {
    logger.info?.('[ui] AUTO_PRINT_ITEM_LABEL not configured; defaulting to disabled.');
  } else if (parsedAutoPrintItemLabel.invalid) {
    logger.warn?.('[ui] AUTO_PRINT_ITEM_LABEL is misconfigured; defaulting to disabled.', {
      value: parsedAutoPrintItemLabel.rawValue
    });
  }

  logger.info?.('[ui] AUTO_PRINT_ITEM_LABEL resolved configuration.', {
    source: autoPrintItemLabelResolution.source,
    enabled: parsedAutoPrintItemLabel.enabled
  });
}

export const AUTO_PRINT_ITEM_LABEL_CONFIG: AutoPrintItemLabelConfig = Object.freeze({
  ...parsedAutoPrintItemLabel
});
