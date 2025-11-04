import { RateLimitError } from '../tools/searchWeb.js';

export async function collectSearchContexts({ searchTerm, searchInvoker, logger, itemId, FlowError }) {
  const searchQuery = `Gerätedaten ${searchTerm}`;//  Gerätespezifikationen ODER Eckdaten ODER technische Daten ODER Spezifikationen ODER Datenblatt (site:.de OR site:.ch OR site:.at OR site:.com)`;
  logger?.info?.({ msg: 'search start', searchQuery, itemId });

  let searchText = '';
  let primarySources = [];
  try {
    const primaryResult = await searchInvoker(searchQuery, 10, { context: 'primary' });
    searchText = primaryResult?.text ?? '';
    primarySources = Array.isArray(primaryResult?.sources) ? primaryResult.sources : [];
    logger?.info?.({ msg: 'search complete', count: primarySources.length, itemId });
    const truncatedText = typeof searchText === 'string'
      ? `${searchText.slice(0, 500)}${searchText.length > 500 ? '…' : ''}`
      : '';
    const topSourcesForLog = primarySources.slice(0, 3).map((source = {}) => ({
      url: typeof source.url === 'string' ? source.url : undefined,
      title: typeof source.title === 'string'
        ? `${source.title.slice(0, 200)}${source.title.length > 200 ? '…' : ''}`
        : undefined,
    }));
    logger?.debug?.({
      msg: 'primary search context summary',
      itemId,
      textPreview: truncatedText,
      topSources: topSourcesForLog,
    });
  } catch (searchErr) {
    logger?.error?.({ err: searchErr, msg: 'primary search failed', searchQuery, itemId });
    if (searchErr instanceof RateLimitError) {
      throw new FlowError('RATE_LIMITED', 'Search provider rate limited requests', searchErr.statusCode ?? 503);
    }
    throw new FlowError('SEARCH_FAILED', 'Failed to retrieve search results', 502, { cause: searchErr });
  }

  const searchContexts = [{ query: searchQuery, text: searchText, sources: primarySources }];
  const seenSourceKeys = new Set();
  const aggregatedSources = [];

  const recordSources = (newSources = []) => {
    try {
      if (!Array.isArray(newSources)) {
        return;
      }
      for (const source of newSources) {
        if (!source) continue;
        const description = typeof source.description === 'string' && source.description.trim()
          ? source.description.trim()
          : typeof source.content === 'string' && source.content.trim()
            ? source.content.trim()
            : '';
        const key = source.url || `${source.title ?? ''}-${description}`;
        if (key && seenSourceKeys.has(key)) {
          continue;
        }
        if (key) {
          seenSourceKeys.add(key);
        }
        if (description && description !== source.description) {
          aggregatedSources.push({ ...source, description });
        }
        else {
          aggregatedSources.push(source);
        }
      }
    } catch (err) {
      logger?.error?.({ err, msg: 'failed to record sources', itemId });
    }
  };

  recordSources(primarySources);

  const buildAggregatedSearchText = () =>
    searchContexts
      .map((ctx, index) => [`Search query ${index + 1}: ${ctx.query}`, ctx.text].join('\n'))
      .join('\n\n-----\n\n');

  return {
    searchContexts,
    aggregatedSources,
    recordSources,
    buildAggregatedSearchText,
  };
}
