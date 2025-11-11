import type { LangtextPayload } from '../../models';

export type LangtextLogger = Partial<Pick<Console, 'debug' | 'info' | 'warn' | 'error'>>;

export interface LangtextHelperContext {
  logger?: LangtextLogger;
  context?: string;
  artikelNummer?: string | null;
  itemUUID?: string | null;
}

const LOG_NAMESPACE = '[langtext]';

function resolveLogger(logger?: LangtextLogger): LangtextLogger {
  return logger ?? console;
}

function log(
  logger: LangtextLogger,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  metadata: Record<string, unknown>
): void {
  logger[level]?.(`${LOG_NAMESPACE} ${message}`, metadata);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizePayload(
  value: Record<string, unknown>,
  context: LangtextHelperContext,
  logger: LangtextLogger
): LangtextPayload | null {
  const result: Record<string, string> = {};
  let discarded = false;

  for (const [key, raw] of Object.entries(value)) {
    if (typeof key !== 'string' || !key) {
      discarded = true;
      continue;
    }
    if (typeof raw === 'string') {
      result[key] = raw;
      continue;
    }
    if (raw === null || raw === undefined) {
      continue;
    }
    try {
      result[key] = String(raw);
      discarded = true;
    } catch (err) {
      discarded = true;
      log(logger, 'warn', 'Failed to coerce Langtext payload value to string', {
        ...context,
        key,
        value: raw,
        error: err
      });
    }
  }

  if (discarded) {
    log(logger, 'debug', 'Discarded non-string Langtext payload entries during sanitization', {
      ...context
    });
  }

  return Object.keys(result).length > 0 ? (result as LangtextPayload) : null;
}

export function parseLangtext(
  value: unknown,
  context: LangtextHelperContext = {}
): string | LangtextPayload | null {
  if (value === null || value === undefined) {
    return null;
  }

  const logger = resolveLogger(context.logger);

  if (typeof value === 'string') {
    if (!value) {
      return '';
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(value);
        if (isPlainObject(parsed)) {
          const sanitized = sanitizePayload(parsed, context, logger);
          if (sanitized) {
            return sanitized;
          }
          log(logger, 'warn', 'Parsed Langtext JSON object contained no string values', {
            ...context
          });
          return '';
        }
        log(logger, 'warn', 'Parsed Langtext JSON produced non-object structure', {
          ...context,
          value: parsed
        });
        return value;
      } catch (err) {
        log(logger, 'warn', 'Failed to parse Langtext JSON payload', {
          ...context,
          error: err,
          value
        });
        return value;
      }
    }

    return value;
  }

  if (isPlainObject(value)) {
    const sanitized = sanitizePayload(value, context, logger);
    if (sanitized) {
      return sanitized;
    }
    log(logger, 'warn', 'Langtext object payload discarded due to empty sanitized entries', {
      ...context
    });
    return null;
  }

  try {
    return String(value);
  } catch (err) {
    log(logger, 'error', 'Failed to coerce Langtext value to string', {
      ...context,
      error: err,
      value
    });
    return null;
  }
}

export function stringifyLangtext(value: unknown, context: LangtextHelperContext = {}): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const logger = resolveLogger(context.logger);

  if (typeof value === 'string') {
    return value;
  }

  if (isPlainObject(value)) {
    const sanitized = sanitizePayload(value, context, logger);
    if (!sanitized) {
      log(logger, 'warn', 'Skipping Langtext serialization due to empty payload', {
        ...context
      });
      return null;
    }
    try {
      return JSON.stringify(sanitized);
    } catch (err) {
      log(logger, 'error', 'Failed to serialize Langtext payload to JSON', {
        ...context,
        error: err
      });
      return null;
    }
  }

  try {
    return String(value);
  } catch (err) {
    log(logger, 'error', 'Failed to stringify Langtext value', {
      ...context,
      error: err,
      value
    });
    return null;
  }
}

export function ensureLangtextString(
  value: any,
  context: LangtextHelperContext = {}
): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  const serialized = stringifyLangtext(value, context);
  return serialized ?? null;
}
