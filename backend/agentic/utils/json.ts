export interface JsonLogger {
  debug?: Console['debug'];
}

interface SanitizeOptions {
  loggerInstance?: JsonLogger;
  context?: Record<string, unknown>;
}

function extractBalancedJsonSegment(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  let segmentStart = -1;

  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];

    if (segmentStart === -1) {
      if (char === '{') {
        segmentStart = i;
        depth = 1;
        continue;
      }
      continue;
    }

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(segmentStart, i + 1);
      }
      continue;
    }
  }

  return segmentStart !== -1 ? text.slice(segmentStart) : null;
}

export function sanitizeJsonInput(rawInput: unknown, { loggerInstance, context }: SanitizeOptions = {}): string {
  if (typeof rawInput !== 'string') {
    throw new TypeError('sanitizeJsonInput expects a string input');
  }

  let working = rawInput;
  const actions: string[] = [];

  const trimmed = working.trim();
  if (trimmed !== working) {
    working = trimmed;
    actions.push('trimmed-whitespace');
  }

  if (working.startsWith('```')) {
    const fenceEnd = working.lastIndexOf('```');
    if (fenceEnd > 0) {
      const firstLineBreak = working.indexOf('\n');
      if (firstLineBreak !== -1 && firstLineBreak < fenceEnd) {
        const candidate = working.slice(firstLineBreak + 1, fenceEnd);
        if (candidate.trim().length) {
          working = candidate.trim();
          actions.push('removed-code-fence');
        }
      }
    }
  }

  const firstBrace = working.indexOf('{');
  if (firstBrace !== -1) {
    const extracted = extractBalancedJsonSegment(working, firstBrace);
    if (extracted && extracted !== working) {
      working = extracted.trim();
      actions.push('extracted-braced-substring');
    }
  }

  if (actions.length) {
    loggerInstance?.debug?.({ msg: 'json sanitizer applied cleanup', actions, ...context });
  }

  return working;
}

export function parseJsonWithSanitizer(rawInput: unknown, options?: SanitizeOptions): any {
  const sanitized = sanitizeJsonInput(rawInput, options);
  try {
    return JSON.parse(sanitized);
  } catch (err) {
    (err as Error & { sanitized?: string }).sanitized = sanitized;
    throw err;
  }
}
