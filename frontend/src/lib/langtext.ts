// TODO(langtext-observability): Capture additional metadata for downstream JSON editors once the
// parser stabilizes around sanitized payload handling and logging.
// TODO(langtext-contract): Remove legacy string coercion once all callers emit string/string[] payload values.
export interface LangtextEntry {
  key: string;
  value: string;
}

export type LangtextParseResult =
  | {
      kind: 'json';
      mode: 'json';
      entries: LangtextEntry[];
      rawObject: Record<string, string | string[]>;
    }
  | {
      kind: 'text';
      mode: 'text';
      text: string;
      rawText: string;
    };

function normaliseLangtextObject(
  source: Record<string, unknown>,
  logger: Pick<Console, 'warn' | 'error'>
): LangtextParseResult {
  const entries: LangtextEntry[] = [];
  const rawObject: Record<string, string | string[]> = {};

  for (const key of Object.keys(source)) {
    const value = source[key];
    if (typeof value === 'string') {
      entries.push({ key, value });
      rawObject[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      const preserved = value.filter((entry): entry is string => typeof entry === 'string');
      if (preserved.length !== value.length) {
        logger.warn?.('Langtext entry array contained non-string values, dropping invalid values', {
          key,
          droppedCount: value.length - preserved.length,
          originalLength: value.length
        });
      }
      if (preserved.length === 0) {
        logger.warn?.('Langtext entry array had no string values after normalization, coercing to empty string', { key });
        entries.push({ key, value: '' });
        rawObject[key] = '';
      } else {
        const joinedValue = preserved.join('\n');
        logger.warn?.('Langtext array value converted to newline-delimited editor string', {
          key,
          count: preserved.length
        });
        entries.push({ key, value: joinedValue });
        rawObject[key] = preserved;
      }
      continue;
    }

    if (value == null) {
      logger.warn?.('Langtext entry missing value, coercing to empty string', { key });
      entries.push({ key, value: '' });
      rawObject[key] = '';
      continue;
    }

    const coercedValue = String(value);
    logger.warn?.('Langtext entry not a string, coercing value', {
      key,
      valueType: typeof value
    });
    entries.push({ key, value: coercedValue });
    rawObject[key] = coercedValue;
  }

  return { kind: 'json', mode: 'json', entries, rawObject };
}

export function parseLangtext(
  candidate: unknown,
  logger: Pick<Console, 'warn' | 'error'> = console
): LangtextParseResult {
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return normaliseLangtextObject(candidate as Record<string, unknown>, logger);
  }

  if (typeof candidate !== 'string') {
    const text = candidate == null ? '' : String(candidate);
    logger.warn?.('Langtext value not a string, treating as legacy text', {
      valueType: typeof candidate
    });
    return {
      kind: 'text',
      mode: 'text',
      text,
      rawText: text
    };
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return {
      kind: 'text',
      mode: 'text',
      text: '',
      rawText: candidate
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normaliseLangtextObject(parsed as Record<string, unknown>, logger);
    }

    logger.warn?.('Langtext JSON parsed to non-object, treating as legacy text', {
      valueType: typeof parsed
    });
  } catch (error) {
    logger.error?.('Failed to parse sanitized Langtext JSON, treating as legacy text', {
      preview: trimmed.slice(0, 200),
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return {
    kind: 'text',
    mode: 'text',
    text: candidate,
    rawText: candidate
  };
}

export function stringifyLangtextEntries(entries: readonly LangtextEntry[]): string {
  const payload: Record<string, string> = {};
  for (const entry of entries) {
    payload[entry.key] = entry.value;
  }
  return JSON.stringify(payload);
}
