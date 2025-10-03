import type { IncomingMessage, ServerResponse } from 'http';
import { compareTwoStrings } from 'string-similarity';
import type { Action } from './index';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function computeTokenScore(tokens: string[], candidateTokens: string[]): number {
  if (!tokens.length || !candidateTokens.length) {
    return 0;
  }

  let aggregate = 0;
  for (const token of tokens) {
    let best = 0;
    for (const candidate of candidateTokens) {
      const score = compareTwoStrings(token, candidate);
      if (score > best) {
        best = score;
        if (best >= 1) {
          break;
        }
      }
    }
    aggregate += best;
  }

  return aggregate / tokens.length;
}

function computeSimilarityScore(term: string, tokens: string[], candidate: unknown): number {
  const normalizedCandidate = normalize(candidate);
  if (!normalizedCandidate) {
    return 0;
  }

  const baseScore = compareTwoStrings(term, normalizedCandidate);
  const candidateTokens = normalizedCandidate.split(/\s+/).filter(Boolean);
  const tokenScore = computeTokenScore(tokens, candidateTokens);
  const substringScore = tokens.length
    ? tokens.reduce((count, token) => (normalizedCandidate.includes(token) ? count + 1 : count), 0) / tokens.length
    : 0;

  return Math.max(baseScore, tokenScore, substringScore);
}

function scoreItem(term: string, tokens: string[], item: any): number {
  const fields = [
    item?.Artikelbeschreibung,
    item?.Kurzbeschreibung,
    item?.Langtext,
    item?.Artikel_Nummer,
    item?.Hersteller,
    item?.Location,
    item?.BoxID,
    item?.ItemUUID
  ];

  let best = 0;
  for (const field of fields) {
    const similarity = computeSimilarityScore(term, tokens, field);
    if (similarity > best) {
      best = similarity;
      if (best >= 1) {
        break;
      }
    }
  }

  return best;
}

function scoreBox(term: string, tokens: string[], box: any): number {
  const fields = [box?.BoxID, box?.Location];
  let best = 0;
  for (const field of fields) {
    const similarity = computeSimilarityScore(term, tokens, field);
    if (similarity > best) {
      best = similarity;
      if (best >= 1) {
        break;
      }
    }
  }

  return best;
}

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
      if (!term) return sendJson(res, 400, { error: 'query term is required' });
      const trimmed = term.trim();
      if (!trimmed) {
        return sendJson(res, 400, { error: 'query term is required' });
      }
      const wildcardTerm = trimmed.replace(/\s+/g, '%');
      const like = `%${wildcardTerm}%`;
      const rawItems = ctx.db
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
      const rawBoxes = ctx.db
        .prepare('SELECT BoxID, Location FROM boxes WHERE BoxID LIKE ? OR Location LIKE ?')
        .all(like, like);
      const normalizedTerm = trimmed.toLowerCase();
      const tokens = normalizedTerm.split(/\s+/).filter(Boolean);
      const scoredItems = rawItems
        .map((item: any) => ({ item, score: scoreItem(normalizedTerm, tokens, item) }))
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
      const scoredBoxes = rawBoxes
        .map((box: any) => ({ box, score: scoreBox(normalizedTerm, tokens, box) }))
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
      const topItemScore = scoredItems.length ? scoredItems[0].score : 0;
      console.log(
        'search',
        term,
        '→ pattern',
        like,
        '→',
        rawItems.length,
        'items',
        rawBoxes.length,
        'boxes',
        'top score',
        topItemScore.toFixed(3)
      );
      sendJson(res, 200, {
        items: scoredItems.map((entry: { item: any }) => entry.item),
        boxes: scoredBoxes.map((entry: { box: any }) => entry.box)
      });
    } catch (err) {
      console.error('Search failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Search API</p></div>'
};

export default action;
