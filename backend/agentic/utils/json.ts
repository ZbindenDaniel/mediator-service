import fs from 'fs';
import path from 'path';
import { z } from 'zod';

export interface JsonLogger {
  debug?: Console['debug'];
}

// TODO(agent-placeholder): Centralize placeholder token rules with correction prompt assembly.

interface SanitizeOptions {
  loggerInstance?: JsonLogger;
  context?: Record<string, unknown>;
}

interface PlaceholderIssue {
  keyPath: string;
  token: string;
  position: number;
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

function detectPlaceholderTokens(jsonText: string): PlaceholderIssue[] {
  const issues: PlaceholderIssue[] = [];
  const objectPlaceholderRegex = /"([^"\\]+)"\s*:\s*(?!["'])(\.\.\.|—+|–+)(?=\s*[,}\]])/g;
  const arrayPlaceholderRegex = /\[\s*(?!["'])(\.\.\.|—+|–+)(?=\s*[,\]])/g;

  let match: RegExpExecArray | null;
  while ((match = objectPlaceholderRegex.exec(jsonText)) !== null) {
    issues.push({
      keyPath: match[1],
      token: match[2],
      position: match.index ?? -1
    });
  }

  while ((match = arrayPlaceholderRegex.exec(jsonText)) !== null) {
    issues.push({
      keyPath: 'array-value',
      token: match[1],
      position: match.index ?? -1
    });
  }

  return issues;
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
  const { loggerInstance, context } = options ?? {};
  const sanitized = sanitizeJsonInput(rawInput, { loggerInstance, context });
  const placeholderIssues = detectPlaceholderTokens(sanitized);
  if (placeholderIssues.length) {
    const distinctKeys = Array.from(new Set(placeholderIssues.map((issue) => issue.keyPath)));
    const keyPhrase = distinctKeys.includes('array-value') && distinctKeys.length === 1
      ? 'an array value'
      : `key(s): ${distinctKeys.join(', ')}`;
    const placeholderHint = `Placeholder token detected at ${keyPhrase}; replace with null or a string before retrying.`;
    const placeholderError = new Error(placeholderHint);
    (placeholderError as Error & { sanitized?: string }).sanitized = sanitized;
    (placeholderError as Error & { placeholderIssues?: PlaceholderIssue[] }).placeholderIssues = placeholderIssues;
    loggerInstance?.debug?.({
      msg: 'placeholder token detected in sanitized payload',
      keyPaths: distinctKeys,
      issueCount: placeholderIssues.length,
      placeholderPreview: sanitized.slice(0, 200),
      ...context
    });
    throw placeholderError;
  }
  try {
    return JSON.parse(sanitized);
  } catch (err) {
    (err as Error & { sanitized?: string }).sanitized = sanitized;
    loggerInstance?.debug?.({
      msg: 'json parse failed after sanitization',
      error: err instanceof Error ? err.message : String(err),
      ...context
    });

    if (typeof rawInput === 'string') {
      const heuristicActions: string[] = [];
      let heuristicCandidate: string | null = null;

      // TODO(agent-json): Unify heuristic extraction with sanitizer stages to avoid duplication.
      const fencedJsonMatch = rawInput.match(/```json\s*\n?([\s\S]*?)```/i);
      if (fencedJsonMatch?.[1]) {
        heuristicCandidate = fencedJsonMatch[1].trim();
        heuristicActions.push('heuristic-fenced-json');
      } else {
        const firstBrace = rawInput.indexOf('{');
        if (firstBrace !== -1) {
          const extracted = extractBalancedJsonSegment(rawInput, firstBrace);
          if (extracted) {
            heuristicCandidate = extracted.trim();
            heuristicActions.push('heuristic-first-brace-segment');
          }
        }
      }

      if (heuristicCandidate) {
        loggerInstance?.debug?.({
          msg: 'retrying json parse with heuristic slice',
          actions: heuristicActions,
          ...context
        });
        try {
          return JSON.parse(heuristicCandidate);
        } catch (retryErr) {
          (retryErr as Error & { sanitized?: string }).sanitized = heuristicCandidate;
          loggerInstance?.debug?.({
            msg: 'heuristic json parse failed',
            actions: heuristicActions,
            error: retryErr instanceof Error ? retryErr.message : String(retryErr),
            ...context
          });
          throw retryErr;
        }
      }
    }

    throw err;
  }
}

const chatMessageSnapshotSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
  proposedQuery: z.string().min(1).optional()
});

const chatSessionSnapshotSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().optional(),
  messages: z.array(chatMessageSnapshotSchema)
});

export type ChatSessionSnapshot = z.infer<typeof chatSessionSnapshotSchema>;

export interface ChatPersistenceLogger extends JsonLogger {
  warn?: Console['warn'];
  error?: Console['error'];
}

export function validateChatSessionSnapshot(snapshot: unknown): ChatSessionSnapshot {
  // TODO(chat-storage): Replace ad-hoc validation with shared persistence schemas once chat transcripts are written to disk.
  return chatSessionSnapshotSchema.parse(snapshot);
}

export function persistChatSessionSnapshot(
  snapshot: unknown,
  filePath: string,
  logger?: ChatPersistenceLogger
): void {
  try {
    const validated = validateChatSessionSnapshot(snapshot);
    const resolvedPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, JSON.stringify(validated, null, 2), 'utf-8');
    logger?.debug?.({
      msg: 'chat session snapshot persisted',
      path: resolvedPath,
      messageCount: validated.messages.length
    });
  } catch (err) {
    logger?.warn?.({
      msg: 'failed to persist chat session snapshot',
      path: filePath,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
