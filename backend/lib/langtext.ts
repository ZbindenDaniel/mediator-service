import type { LangtextPayload } from '../../models';

export type LangtextLogger = Partial<Pick<Console, 'debug' | 'info' | 'warn' | 'error'>>;

// TODO(langtext-export-format): Consolidate format options once downstream clients adopt shared rendering helpers.
export type LangtextExportFormat = 'json' | 'markdown' | 'html';

export interface LangtextHelperContext {
  logger?: LangtextLogger;
  context?: string;
  artikelNummer?: string | null;
  itemUUID?: string | null;
}

const LOG_NAMESPACE = '[langtext]';
const LANGTEXT_EXPORT_FORMAT_SET: ReadonlySet<LangtextExportFormat> = new Set(['json', 'markdown', 'html']);

function resolveLogger(logger?: LangtextLogger): LangtextLogger {
  return logger ?? console;
}

export function isLangtextExportFormat(value: unknown): value is LangtextExportFormat {
  if (typeof value !== 'string') {
    return false;
  }
  return LANGTEXT_EXPORT_FORMAT_SET.has(value as LangtextExportFormat);
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

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLangtextPayloadAsMarkdown(payload: LangtextPayload): string | null {
  const segments: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(payload)) {
    const key = rawKey.trim();
    const value = rawValue.trim();

    if (key && value) {
      segments.push(`- **${key}**: ${value}`);
      continue;
    }

    if (key) {
      segments.push(`- **${key}**`);
      continue;
    }

    if (value) {
      segments.push(value);
    }
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.join('\n');
}

function formatLangtextPayloadAsHtml(payload: LangtextPayload): string | null {
  const segments: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(payload)) {
    const key = rawKey.trim();
    const value = rawValue.trim();

    if (!key && !value) {
      continue;
    }

    if (key && value) {
      segments.push(`<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</p>`);
      continue;
    }

    if (key) {
      segments.push(`<p><strong>${escapeHtml(key)}</strong></p>`);
      continue;
    }

    segments.push(`<p>${escapeHtml(value)}</p>`);
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.join('');
}

export function formatLangtextForExport(
  value: unknown,
  format: LangtextExportFormat,
  context: LangtextHelperContext = {}
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (format === 'json') {
    return stringifyLangtext(value, context);
  }

  const logger = resolveLogger(context.logger);
  const parseContext: LangtextHelperContext = {
    ...context,
    logger
  };
  const parsed = parseLangtext(value, parseContext);

  if (parsed === null) {
    return null;
  }

  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) {
      return '';
    }

    if (format === 'html') {
      return `<p>${escapeHtml(trimmed)}</p>`;
    }

    return trimmed;
  }

  if (format === 'markdown') {
    const formatted = formatLangtextPayloadAsMarkdown(parsed);
    if (formatted === null) {
      log(logger, 'debug', 'Langtext markdown export produced no content', {
        ...parseContext
      });
      return '';
    }
    return formatted;
  }

  if (format === 'html') {
    const formatted = formatLangtextPayloadAsHtml(parsed);
    if (formatted === null) {
      log(logger, 'debug', 'Langtext HTML export produced no content', {
        ...parseContext
      });
      return '';
    }
    return formatted;
  }

  log(logger, 'warn', 'Unsupported Langtext export format requested, falling back to JSON', {
    ...parseContext,
    format
  });
  return stringifyLangtext(parsed, parseContext);
}
