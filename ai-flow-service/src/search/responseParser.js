// src/search/responseParser.js
const RATE_LIMIT_CODES = new Set([429, 503]);
const RATE_LIMIT_TEXT_PATTERNS = [
  /\brate[\s-]?limit(?:ed|ing)?\b/i,
  /\btoo\s+many\s+requests\b/i,
  /\bstatus\s*(code)?\s*429\b/i,
  /\bstatus\s*(code)?\s*503\b/i,
  /\bhttp\s*429\b/i,
  /\bhttp\s*503\b/i,
];

function extractStatusCodeFromText(text) {
  if (typeof text !== 'string') {
    return undefined;
  }

  const match = text.match(/\b(429|503)\b/);
  if (match) {
    const value = Number(match[1]);
    if (RATE_LIMIT_CODES.has(value)) {
      return value;
    }
  }
  return undefined;
}

function detectRateLimitFromError(resp, textParts) {
  if (!resp?.isError) {
    return null;
  }

  const candidates = [];
  const candidateFields = [
    resp?.message,
    resp?.detail,
    resp?.error,
    resp?.error?.message,
    resp?.metadata?.message,
    resp?.metadata?.detail,
    resp?.metadata?.error,
    resp?.metadata?.reason,
  ];

  for (const value of candidateFields) {
    if (typeof value === 'string') {
      candidates.push(value);
    }
  }

  for (const part of textParts) {
    candidates.push(part);
  }

  for (const text of candidates) {
    if (typeof text !== 'string') {
      continue;
    }

    if (RATE_LIMIT_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
      return {
        detail: text,
        statusCode: extractStatusCodeFromText(text),
      };
    }
  }

  return null;
}

export class RateLimitError extends Error {
  constructor(message, { statusCode, detail } = {}) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = statusCode ?? 429;
    this.detail = detail;
  }
}

function coerceResultArray(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === 'object') {
    if (Array.isArray(data.results)) {
      return data.results;
    }
    if (Array.isArray(data.items)) {
      return data.items;
    }
  }

  return null;
}

function normalizeLimit(limit, length) {
  if (!Number.isFinite(limit)) {
    return length;
  }
  const value = Math.trunc(limit);
  if (value <= 0) {
    return length;
  }
  return Math.min(value, length);
}

function resolveDescription(entry) {
  if (!entry) {
    return '';
  }

  const description = typeof entry.description === 'string' ? entry.description : null;
  if (description && description.trim()) {
    return description;
  }

  const content = typeof entry.content === 'string' ? entry.content : null;
  if (content && content.trim()) {
    return content;
  }

  return '';
}

function mapSources(results) {
  return results.map((entry) => ({
    title: entry?.title ?? '',
    url: entry?.url ?? '',
    description: resolveDescription(entry),
  }));
}

export function parseSearchResponse(resp, { query, limit }) {
  const primaryStatusCode = typeof resp?.statusCode === 'number' ? resp.statusCode : undefined;
  const metadataStatusCode =
    typeof resp?.metadata?.statusCode === 'number' ? resp.metadata.statusCode : undefined;
  const knownStatusCode = primaryStatusCode ?? metadataStatusCode;

  if (knownStatusCode && RATE_LIMIT_CODES.has(knownStatusCode)) {
    throw new RateLimitError('Search provider rate limited the request', {
      statusCode: knownStatusCode,
      detail: resp?.message,
    });
  }

  const parts = Array.isArray(resp?.content) ? resp.content : [];
  const textParts = parts
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text);

  const rateLimitFromError = detectRateLimitFromError(resp, textParts);
  if (rateLimitFromError) {
    const statusCodeCandidate = rateLimitFromError.statusCode ?? knownStatusCode;
    const statusCode =
      typeof statusCodeCandidate === 'number' && RATE_LIMIT_CODES.has(statusCodeCandidate)
        ? statusCodeCandidate
        : undefined;
    throw new RateLimitError('Search provider rate limited the request', {
      statusCode,
      detail: rateLimitFromError.detail,
    });
  }

  const jsonPart = parts.find((part) => part?.type === 'json');

  let resultArray = null;

  if (jsonPart) {
    let data = jsonPart.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (error) {
        // fall through to text handling
      }
    }
    resultArray = coerceResultArray(data);
  }

  if (!resultArray) {
    const textPart = parts.find((part) => part?.type === 'text' && typeof part.text === 'string');
    if (textPart) {
      try {
        const parsed = JSON.parse(textPart.text);
        resultArray = coerceResultArray(parsed);
        if (!resultArray) {
          const trimmed = textPart.text.trim();
          return { text: trimmed || `No results for "${query}".`, sources: [] };
        }
      } catch (error) {
        const trimmed = textPart.text.trim();
        return { text: trimmed || `No results for "${query}".`, sources: [] };
      }
    }
  }

  if (Array.isArray(resultArray) && resultArray.length > 0) {
    const sliceLimit = normalizeLimit(limit, resultArray.length);
    const limited = resultArray.slice(0, sliceLimit);
    const sources = mapSources(limited);
    const lines = limited.map((entry, index) => {
      const title = entry?.title ?? '(no title)';
      const url = entry?.url ?? '(no url)';
      const description = resolveDescription(entry);
      const descriptionLine = description ? `\n${description}` : '';
      return `${index + 1}. ${title} — ${url}${descriptionLine}`;
    });

    return {
      text: `RESULTS for "${query}":\n${lines.join('\n\n')}`,
      sources,
    };
  }

  const fallbackText = textParts.map((text) => text.trim()).filter(Boolean)[0];

  return { text: fallbackText || `No results for "${query}".`, sources: [] };
}
