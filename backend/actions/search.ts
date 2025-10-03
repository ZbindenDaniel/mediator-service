import type { IncomingMessage, ServerResponse } from 'http';
import { compareTwoStrings } from '../../vendor/string-similarity';
import type { Action } from './index';

function normalize(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function createCandidateCorpus(item: Record<string, unknown>): string[] {
  return [
    normalize(item.Artikelbeschreibung),
    normalize(item.Artikel_Nummer),
    normalize(item.BoxID),
    normalize(item.Location)
  ].filter((entry) => entry.length > 0);
}

function evaluateSimilarity(term: string, corpus: string[]): number {
  if (!term) {
    return 0;
  }

  const normalizedTerm = normalize(term);
  const compactTerm = normalizedTerm.replace(/\s+/g, '');
  const tokens = normalizedTerm.split(' ').filter(Boolean);

  let bestScore = 0;
  let hasTokenCoverage = tokens.length === 0;

  for (const candidate of corpus) {
    const compactCandidate = candidate.replace(/\s+/g, '');
    const directScore = compareTwoStrings(normalizedTerm, candidate);
    const compactScore = compareTwoStrings(compactTerm, compactCandidate);
    const candidateBest = Math.max(directScore, compactScore);
    bestScore = Math.max(bestScore, candidateBest);

    if (tokens.length > 0) {
      const coversAllTokens = tokens.every((token) => {
        const tokenScore = Math.max(
          compareTwoStrings(token, candidate),
          compareTwoStrings(token.replace(/\s+/g, ''), compactCandidate)
        );
        const hasInclusion = candidate.includes(token) || compactCandidate.includes(token.replace(/\s+/g, ''));
        return hasInclusion || tokenScore >= 0.65;
      });
      hasTokenCoverage = hasTokenCoverage || coversAllTokens;
    }
  }

  if (!hasTokenCoverage) {
    return Math.min(bestScore, 0.49);
  }

  return bestScore;
}

const MIN_SIMILARITY_SCORE = 0.6;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'search',
  label: 'Search',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/search' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = new URL(req.url || '', 'http://localhost');
      const term =
        url.searchParams.get('term') ||
        url.searchParams.get('q') ||
        url.searchParams.get('material') ||
        '';
      const trimmedTerm = term.trim();
      if (!trimmedTerm) {
        console.warn('Search aborted: empty term');
        return sendJson(res, 400, { error: 'query term is required' });
      }
      const like = `%${trimmedTerm}%`;
      const items = ctx.db
        .prepare(
          `SELECT i.*, COALESCE(i.Location, b.Location) AS Location
           FROM items i
           LEFT JOIN boxes b ON i.BoxID = b.BoxID
           WHERE i.ItemUUID LIKE ?
              OR i.Artikel_Nummer LIKE ?
              OR i.Artikelbeschreibung LIKE ?
              OR i.BoxID LIKE ?
              OR b.Location LIKE ?`
        )
        .all(like, like, like, like, like);
      const boxes = ctx.db
        .prepare('SELECT BoxID, Location FROM boxes WHERE BoxID LIKE ? OR Location LIKE ?')
        .all(like, like);

      const scoredItems = items
        .map((item: Record<string, unknown>) => {
          const score = evaluateSimilarity(trimmedTerm, createCandidateCorpus(item));
          return { item, score };
        })
        .filter(({ score }) => score >= MIN_SIMILARITY_SCORE)
        .sort((a, b) => b.score - a.score)
        .map(({ item, score }) => ({ ...item, similarityScore: score }));

      const scoredBoxes = boxes
        .map((box: Record<string, unknown>) => {
          const score = evaluateSimilarity(trimmedTerm, createCandidateCorpus(box));
          return { box, score };
        })
        .filter(({ score }) => score >= MIN_SIMILARITY_SCORE)
        .sort((a, b) => b.score - a.score)
        .map(({ box, score }) => ({ ...box, similarityScore: score }));

      console.log('search', trimmedTerm, '→', scoredItems.length, 'items', scoredBoxes.length, 'boxes');
      sendJson(res, 200, { items: scoredItems, boxes: scoredBoxes });
    } catch (err) {
      console.error('Search failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Search API</p></div>'
};

export default action;
