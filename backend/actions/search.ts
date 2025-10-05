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
  if (!normalizedCandidate) return 0;

  const normalizedTerm = normalize(term);
  if (normalizedCandidate === normalizedTerm) return 1; // exact only

  // Whole-string similarity (never reaches 1 unless exact)
  const baseScore = Math.min(compareTwoStrings(normalizedTerm, normalizedCandidate), 0.99);

  const candidateTokens = normalizedCandidate.split(/\s+/).filter(Boolean);
  const queryTokens = (tokens && tokens.length ? tokens : normalizedTerm.split(/\s+/)).filter(Boolean);

  // For each query token, find its best fuzzy match in candidate tokens
  const perTokenBest: number[] = queryTokens.map(qt => {
    let best = 0;
    for (const ct of candidateTokens) best = Math.max(best, compareTwoStrings(qt, ct));
    // ignore tiny accidental similarities (noise/extra words)
    return best >= 0.35 ? best : 0;
  });

  // Soft-OR aggregation: 1 - Π(1 - s_i)
  // Extra tokens with 0 similarity do not reduce the score.
  const softRecall = 1 - perTokenBest.reduce((prod, s) => prod * (1 - s), 1);

  // Combine conservatively
  return Math.max(baseScore, softRecall);
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
  console.log("scoreBox")
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
      console.log("search...");
      const url = new URL(req.url || "", "http://localhost");
      const term =
        url.searchParams.get("term") ||
        url.searchParams.get("q") ||
        url.searchParams.get("material") ||
        "";
      if (!term) return sendJson(res, 400, { error: "query term is required" });

      const trimmed = term.trim();
      if (!trimmed) {
        return sendJson(res, 400, { error: "query term is required" });
      }

      const normalized = trimmed.toLowerCase();
      const tokens = normalized.split(/\s+/).filter(Boolean);
      if (!tokens.length) {
        return sendJson(res, 400, { error: "query term is required" });
      }

      // require at least 50% of tokens (min 1)
      const minTokenHits = Math.max(1, Math.ceil(tokens.length * 0.5));

      const like4 = (t: string) => {
        const p = `%${t}%`;
        return [p, p, p, p] as const;
      };
      const like2 = (t: string) => {
        const p = `%${t}%`;
        return [p, p] as const;
      };

      // ---------------- ITEMS ----------------
      // token_hits: per-token presence (0/1), not per-field sum
      const itemTokenPresenceTerms = tokens.map(() => `
    CASE WHEN (
      lower(q.ItemUUID)            LIKE ?
      OR lower(r.Artikel_Nummer)   LIKE ?
      OR lower(r.Artikelbeschreibung) LIKE ?
      OR lower(q.BoxID)            LIKE ?
    ) THEN 1 ELSE 0 END
  `).join(" + ");

      // exact match if ANY field equals the normalized query
      const itemExactMatchExpr = `
    CASE WHEN (
      lower(q.ItemUUID)            = ?
      OR lower(r.Artikel_Nummer)   = ?
      OR lower(r.Artikelbeschreibung) = ?
      OR lower(q.BoxID)            = ?
    ) THEN 1 ELSE 0 END
  `;

      const itemSql = `
    SELECT *
    FROM (
      SELECT
        q.ItemUUID,
        q.BoxID,
        COALESCE(q.Location, b.Location) AS Location,
        q.UpdatedAt,
        q.Datum_erfasst,
        q.Auf_Lager,
        r.Artikel_Nummer,
        r.Grafikname,
        r.Artikelbeschreibung,
        r.Verkaufspreis,
        r.Kurzbeschreibung,
        r.Langtext,
        r.Hersteller,
        r.Länge_mm,
        r.Breite_mm,
        r.Höhe_mm,
        r.Gewicht_kg,
        r.Hauptkategorien_A,
        r.Unterkategorien_A,
        r.Hauptkategorien_B,
        r.Unterkategorien_B,
        r.Veröffentlicht_Status,
        r.Shopartikel,
        r.Artikeltyp,
        r.Einheit,
        r.WmsLink,
        r.EntityType,
        (${itemTokenPresenceTerms}) AS token_hits,
        ${itemExactMatchExpr} AS exact_match,
        CASE
          WHEN ${itemExactMatchExpr} = 1 THEN 1.0
          ELSE (CAST((${itemTokenPresenceTerms}) AS REAL) / ?) * 0.99
        END AS sql_score
      FROM item_quants q
      JOIN item_refs r ON q.RefID = r.RefID
      LEFT JOIN boxes b ON q.BoxID = b.BoxID
    )
    WHERE token_hits >= ?
    ORDER BY exact_match DESC, sql_score DESC
    LIMIT 5
  `;

      const itemParams = [
        // token_hits params
        ...tokens.flatMap(like4),
        // exact_match params (equality, 4 fields)
        normalized, normalized, normalized, normalized,
        // sql_score CASE exact_match params (repeat the equality)
        normalized, normalized, normalized, normalized,
        // sql_score token_hits terms again (used in ELSE)
        ...tokens.flatMap(like4),
        // divisor = tokens.length
        tokens.length,
        // WHERE threshold
        minTokenHits,
      ];

      const rawItems = ctx.db.prepare(itemSql).all(...itemParams);

      // ---------------- BOXES ----------------
      const boxTokenPresenceTerms = tokens.map(() => `
    CASE WHEN (
      lower(b.BoxID)    LIKE ?
      OR lower(b.Location) LIKE ?
    ) THEN 1 ELSE 0 END
  `).join(" + ");

      const boxExactMatchExpr = `
    CASE WHEN (
      lower(b.BoxID)    = ?
      OR lower(b.Location) = ?
    ) THEN 1 ELSE 0 END
  `;

      const boxSql = `
    SELECT *
    FROM (
      SELECT
        b.BoxID, b.Location,
        (${boxTokenPresenceTerms}) AS token_hits,
        ${boxExactMatchExpr} AS exact_match,
        CASE
          WHEN ${boxExactMatchExpr} = 1 THEN 1.0
          ELSE (CAST((${boxTokenPresenceTerms}) AS REAL) / ?) * 0.99
        END AS sql_score
      FROM boxes b
    )
    WHERE token_hits >= ?
    ORDER BY exact_match DESC, sql_score DESC
    LIMIT 5
  `;

      const boxParams = [
        // token_hits params
        ...tokens.flatMap(like2),
        // exact_match params
        normalized, normalized,
        // sql_score CASE exact_match params (repeat)
        normalized, normalized,
        // sql_score token_hits terms again
        ...tokens.flatMap(like2),
        // divisor = tokens.length
        tokens.length,
        // WHERE threshold
        minTokenHits,
      ];

      const rawBoxes = ctx.db.prepare(boxSql).all(...boxParams);

      // ----- same JS scoring + response -----
      const scoredItems = rawItems
        .map((item: any) => ({ item, score: scoreItem(normalized, tokens, item) }))
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

      const scoredBoxes = rawBoxes
        .map((box: any) => ({ box, score: scoreBox(normalized, tokens, box) }))
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

      const topItemScore = scoredItems.length ? scoredItems[0].score : 0;
      console.log(
        "search",
        term,
        "→",
        rawItems.length,
        "items",
        rawBoxes.length,
        "boxes",
        "top score",
        topItemScore.toFixed(3)
      );

      sendJson(res, 200, {
        items: scoredItems.map((entry: { item: any }) => entry.item),
        boxes: scoredBoxes.map((entry: { box: any }) => entry.box),
      });
    } catch (err) {
      console.error("Search failed", err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Search API</p></div>'
};

export default action;
