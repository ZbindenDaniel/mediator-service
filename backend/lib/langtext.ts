import type { LangtextPayload } from '../../models';

export type LangtextExportFormat = 'json' | 'markdown' | 'html';

export type LangtextLogger = Partial<Pick<Console, 'debug' | 'info' | 'warn' | 'error'>>;

export interface LangtextHelperContext {
  logger?: LangtextLogger;
  context?: string;
  artikelNummer?: string | null;
  itemUUID?: string | null;
}

const LOG_NAMESPACE = '[langtext]';

// TODO(agent): Expand malformed Langtext JSON detection to cover nested structures.
// TODO(langtext-contract): Remove mixed payload support once all Langtext specs are normalized at input boundaries.

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case '\'':
        return '&#39;';
      default:
        return character;
    }
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasSuspiciousQuotePlacement(raw: string): boolean {
  const withoutEscapedQuotes = raw.replace(/\\"/g, '');
  return /:\s*"[^"\n]*"[^,}\s]/.test(withoutEscapedQuotes);
}

function normalizeMalformedJsonText(raw: string): string {
  const trimmed = raw.trim();
  const withoutBraces = trimmed.replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim();
  return withoutBraces || trimmed;
}

function sanitizePayload(
  value: Record<string, unknown>,
  context: LangtextHelperContext,
  logger: LangtextLogger
): LangtextPayload | null {
  const result: LangtextPayload = {};

  for (const [key, raw] of Object.entries(value)) {
    if (typeof key !== 'string' || !key) {
      log(logger, 'warn', 'Dropping Langtext payload entry with invalid key', {
        ...context,
        entryKey: key
      });
      continue;
    }

    if (typeof raw === 'string') {
      result[key] = raw;
      continue;
    }

    if (Array.isArray(raw)) {
      const preservedValues = raw.filter((entry): entry is string => typeof entry === 'string');
      if (preservedValues.length === raw.length) {
        result[key] = preservedValues;
      } else {
        log(logger, 'warn', 'Dropping non-string values from Langtext array payload entry', {
          ...context,
          key,
          droppedCount: raw.length - preservedValues.length,
          originalLength: raw.length
        });
        if (preservedValues.length > 0) {
          result[key] = preservedValues;
        }
      }
      continue;
    }

    if (raw === null || raw === undefined) {
      log(logger, 'debug', 'Dropping nullish Langtext payload value', {
        ...context,
        key
      });
      continue;
    }

    try {
      const coercedValue = String(raw);
      result[key] = coercedValue;
      log(logger, 'warn', 'Coerced non-string Langtext payload value to string', {
        ...context,
        key,
        valueType: typeof raw
      });
    } catch (err) {
      log(logger, 'warn', 'Failed to coerce Langtext payload value to string', {
        ...context,
        key,
        value: raw,
        error: err
      });
    }
  }

  return Object.keys(result).length > 0 ? result : null;
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
      if (hasSuspiciousQuotePlacement(trimmed)) {
        const fallbackText = normalizeMalformedJsonText(trimmed);
        log(logger, 'warn', 'Detected malformed Langtext JSON-like payload; treating as text', {
          ...context,
          value: fallbackText,
          reason: 'suspicious_quote_placement'
        });
        return fallbackText;
      }

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
        const fallbackText = normalizeMalformedJsonText(trimmed);
        log(logger, 'warn', 'Failed to parse Langtext JSON payload', {
          ...context,
          error: err,
          value: fallbackText
        });
        return fallbackText;
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

function normalizePayloadValue(rawValue: string | string[]): string {
  if (Array.isArray(rawValue)) {
    return rawValue.join('\n');
  }
  return rawValue;
}

function formatMarkdownFromPayload(
  payload: LangtextPayload,
  context: Record<string, unknown>,
  logger: LangtextLogger
): string | null {
  const lines: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(payload)) {
    const key = rawKey.trim();
    if (!key) {
      log(logger, 'warn', 'Skipping Langtext entry with empty key during markdown serialization', {
        ...context,
        entryKey: rawKey
      });
      continue;
    }

    const normalizedValue = normalizePayloadValue(rawValue).replace(/\r\n/g, '\n');
    const trimmedValue = normalizedValue.trim();
    if (!trimmedValue) {
      lines.push(`- **${key}**`);
      continue;
    }

    const singleLine = trimmedValue.replace(/\s*\n\s*/g, ' ');
    lines.push(`- **${key}** ${singleLine}`);
  }

  if (lines.length === 0) {
    log(logger, 'debug', 'Markdown serialization produced no Langtext entries', {
      ...context
    });
    return null;
  }

  return lines.join('\n');
}

function formatMarkdownFromText(value: string): string | null {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  return normalized ? normalized : null;
}

function formatHtmlFromPayload(
  payload: LangtextPayload,
  context: Record<string, unknown>,
  logger: LangtextLogger
): string | null {
  const items: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(payload)) {
    const key = rawKey.trim();
    if (!key) {
      log(logger, 'warn', 'Skipping Langtext entry with empty key during HTML serialization', {
        ...context,
        entryKey: rawKey
      });
      continue;
    }

    const normalizedValue = normalizePayloadValue(rawValue).replace(/\r\n/g, '\n');
    const trimmedValue = normalizedValue.trim();
    const escapedKey = escapeHtml(key);
    if (!trimmedValue) {
      items.push(`<li><strong>${escapedKey}</strong></li>`);
      continue;
    }

    const escapedValue = escapeHtml(trimmedValue).replace(/\n/g, '<br />');
    items.push(`<li><strong>${escapedKey}</strong> ${escapedValue}</li>`);
  }

  if (items.length === 0) {
    log(logger, 'debug', 'HTML serialization produced no Langtext entries', {
      ...context
    });
    return null;
  }

  return `<ul>${items.join('')}</ul>`;
}

function formatHtmlFromText(value: string): string | null {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return null;
  }

  const escaped = escapeHtml(normalized).replace(/\n/g, '<br />');
  return `<p>${escaped}</p>`;
}

export function serializeLangtextForExport(
  value: unknown,
  format: LangtextExportFormat,
  context: LangtextHelperContext = {}
): string | null {
  const logger = resolveLogger(context.logger);
  const contextWithLogger: LangtextHelperContext = { ...context, logger };
  const serializationContext = { ...contextWithLogger, format };

  try {
    if (format === 'json') {
      return stringifyLangtext(value, contextWithLogger);
    }

    const parsed = parseLangtext(value, contextWithLogger);
    if (parsed === null) {
      return null;
    }

    if (typeof parsed === 'string') {
      if (format === 'markdown') {
        return formatMarkdownFromText(parsed);
      }
      if (format === 'html') {
        return formatHtmlFromText(parsed);
      }
      return null;
    }

    if (format === 'markdown') {
      return formatMarkdownFromPayload(parsed, serializationContext, logger);
    }

    if (format === 'html') {
      return formatHtmlFromPayload(parsed, serializationContext, logger);
    }

    return null;
  } catch (error) {
    log(logger, 'error', 'Failed to serialize Langtext for export', {
      ...serializationContext,
      error
    });
    return null;
  }
}

// export function ensureLangtextString(
//   value: any,
//   context: LangtextHelperContext = {}
// ): string | null {
//   if (value == null) {
//     return null;
//   }

//   if (typeof value === 'string') {
//     return value;
//   }

//   const serialized = stringifyLangtext(value, context);
//   return serialized ?? null;
// }
