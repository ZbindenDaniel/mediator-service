function resolveLogger(log) {
  if (log && typeof log.warn === 'function' && typeof log.error === 'function') {
    return log;
  }
  return console;
}

export function formatSourcesForRetry(sources = [], log) {
  const logger = resolveLogger(log);
  if (!Array.isArray(sources)) {
    logger.warn({ msg: 'formatSourcesForRetry received non-array input' });
    return [];
  }

  try {
    return sources.map((source, index) => {
      if (!source || typeof source !== 'object') {
        logger.warn({ msg: 'formatSourcesForRetry encountered invalid source', index, source });
        return `Source ${index + 1}: (unavailable)`;
      }

      const title = typeof source.title === 'string' && source.title.trim() ? source.title.trim() : '(no title)';
      const url = typeof source.url === 'string' && source.url.trim() ? source.url.trim() : '(no url)';
      const descriptionCandidate =
        typeof source.description === 'string' && source.description.trim()
          ? source.description.trim()
          : typeof source.content === 'string' && source.content.trim()
            ? source.content.trim()
            : null;

      const lines = [`${index + 1}. ${title}`, `URL: ${url}`];
      lines.push(descriptionCandidate ? `Description: ${descriptionCandidate}` : 'Description: (none)');
      return lines.join('\n');
    });
  } catch (err) {
    logger.error({ err, msg: 'failed to format sources for retry block' });
    return sources.map((source, index) => `Source ${index + 1}: ${JSON.stringify(source)}`);
  }
}
