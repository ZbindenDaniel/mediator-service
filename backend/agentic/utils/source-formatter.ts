export interface SourceFormatterLogger {
  warn?: Console['warn'];
  error?: Console['error'];
}

export interface SearchSource {
  title?: string | null;
  url?: string | null;
  description?: string | null;
  content?: string | null;
  [key: string]: unknown;
}

function resolveLogger(log?: SourceFormatterLogger): SourceFormatterLogger {
  if (log && typeof log.warn === 'function' && typeof log.error === 'function') {
    return log;
  }
  return console;
}

export function formatSourcesForRetry(sources: unknown, log?: SourceFormatterLogger): string[] {
  const logger = resolveLogger(log);
  if (!Array.isArray(sources)) {
    logger.warn?.({ msg: 'formatSourcesForRetry received non-array input' });
    return [];
  }

  try {
    return sources.map((source, index) => {
      if (!source || typeof source !== 'object') {
        logger.warn?.({ msg: 'formatSourcesForRetry encountered invalid source', index, source });
        return `Source ${index + 1}: (unavailable)`;
      }

      const typed = source as SearchSource;
      const title = typeof typed.title === 'string' && typed.title.trim() ? typed.title.trim() : '(no title)';
      const url = typeof typed.url === 'string' && typed.url.trim() ? typed.url.trim() : '(no url)';
      const descriptionCandidate =
        typeof typed.description === 'string' && typed.description.trim()
          ? typed.description.trim()
          : typeof typed.content === 'string' && typed.content.trim()
            ? typed.content.trim()
            : null;

      const lines = [`${index + 1}. ${title}`, `URL: ${url}`];
      lines.push(descriptionCandidate ? `Description: ${descriptionCandidate}` : 'Description: (none)');
      return lines.join('\n');
    });
  } catch (err) {
    logger.error?.({ err, msg: 'failed to format sources for retry block' });
    return sources.map((source, index) => `Source ${index + 1}: ${JSON.stringify(source)}`);
  }
}
