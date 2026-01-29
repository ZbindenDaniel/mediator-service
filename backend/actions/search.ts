// TODO(agent): add action tests.
// TODO(search-hersteller): Validate Hersteller/Suchbegriff exact-match warnings once deployed.
// TODO(search-suchbegriff): Confirm Suchbegriff search performance and add DB indexes if needed.
// TODO(search-suchbegriff): Re-evaluate Suchbegriff fallback logging volume after monitoring search traffic.
// TODO(agent): Review Langtext search tokenization once structured payload telemetry is available.
// TODO(deep-search): Confirm default deep search behavior once product guidance is finalized.
// TODO(search-deep-fields): Validate Kurzbeschreibung/Langtext weighting after ranking feedback.
import type { IncomingMessage, ServerResponse } from 'http';
import { compareTwoStrings } from 'string-similarity';
import { PUBLIC_ORIGIN } from '../config';
import { defineHttpAction } from './index';
import { ItemEinheit, normalizeItemEinheit } from '../../models';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveSearchSuchbegriff(
  value: unknown,
  fallback: { artikelbeschreibung?: unknown; artikelNummer?: unknown; context: string; itemUUID?: string | null }
): string {
  try {
    const primary = asNonEmptyString(value);
    if (primary) {
      return primary;
    }
    const fallbackArtikelbeschreibung = asNonEmptyString(fallback.artikelbeschreibung);
    if (fallbackArtikelbeschreibung) {
      console.info('[search] Using Artikelbeschreibung fallback for Suchbegriff search normalization', {
        context: fallback.context,
        artikelNummer: fallback.artikelNummer ?? null,
        itemUUID: fallback.itemUUID ?? null
      });
      return fallbackArtikelbeschreibung;
    }
    const fallbackArtikelNummer = asNonEmptyString(fallback.artikelNummer);
    if (fallbackArtikelNummer) {
      console.info('[search] Using Artikel_Nummer fallback for Suchbegriff search normalization', {
        context: fallback.context,
        artikelNummer: fallback.artikelNummer ?? null,
        itemUUID: fallback.itemUUID ?? null
      });
      return fallbackArtikelNummer;
    }
    return '';
  } catch (error) {
    console.error('[search] Failed to resolve Suchbegriff fallback', {
      context: fallback.context,
      artikelNummer: fallback.artikelNummer ?? null,
      itemUUID: fallback.itemUUID ?? null,
      error
    });
    return '';
  }
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

const DEFAULT_SEARCH_EINHEIT: ItemEinheit = ItemEinheit.Stk;
const DEFAULT_ITEM_LIMIT = 5;

function parseSearchLimit(value: string | null, context: string, fallback: number): number {
  if (!value) {
    return fallback;
  }
  try {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    console.warn('[search] Invalid limit parameter; using default.', {
      context,
      provided: value,
      fallback
    });
  } catch (error) {
    console.error('[search] Failed to parse limit parameter; using default.', {
      context,
      provided: value,
      fallback,
      error
    });
  }
  return fallback;
}

// TODO(agent): Consider centralizing Auf_Lager parsing once search response normalization is shared across actions.
function parseAufLagerValue(value: unknown, context: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.error('[search] Failed to parse Auf_Lager value', { context, value, error });
      return 0;
    }
  }
  return 0;
}

function normalizeSearchEinheit(value: unknown, context: string): ItemEinheit {
  try {
    const normalized = normalizeItemEinheit(value);
    if (normalized) {
      return normalized;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      console.warn('[search] Invalid Einheit encountered while preparing response; falling back to default.', {
        context,
        provided: value
      });
    } else if (value !== null && value !== undefined) {
      console.warn('[search] Unexpected Einheit type encountered while preparing response; falling back to default.', {
        context,
        providedType: typeof value
      });
    }
  } catch (error) {
    console.error('[search] Failed to normalize Einheit for response; using default.', {
      context,
      error
    });
  }
  return DEFAULT_SEARCH_EINHEIT;
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

// TODO(search-field-scores): Review field score weighting after observing ranking feedback.
function hasExactMatchFieldValue(values: unknown[]): boolean {
  return values.some(value => {
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }
    return false;
  });
}

function parseDeepSearchParam(value: string | null): boolean {
  if (!value) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  console.warn('[search] Invalid deep search parameter; defaulting to false.', {
    provided: value
  });
  return false;
}

type ItemFieldScores = {
  scoreSuchbegriff: number;
  scoreHersteller: number;
  scoreArtikelbeschreibung: number;
  scoreKurzbeschreibung: number;
  scoreLangtext: number;
  scoreArtikelNummer: number;
  scoreItemUUID: number;
  scoreBoxID: number;
  bestScore: number;
  bestField:
    | 'Suchbegriff'
    | 'Hersteller'
    | 'Artikelbeschreibung'
    | 'Kurzbeschreibung'
    | 'Langtext'
    | 'ArtikelNummer'
    | 'ItemUUID'
    | 'BoxID';
};

// TODO(search-typing): Revisit search score input types if new search fields are introduced.
type SearchScoreField = string | number | null | undefined;

interface SearchScoreItem {
  Artikel_Nummer?: SearchScoreField;
  Artikelbeschreibung?: SearchScoreField;
  Suchbegriff?: SearchScoreField;
  Hersteller?: SearchScoreField;
  Kurzbeschreibung?: SearchScoreField;
  Langtext?: SearchScoreField;
  ItemUUID?: SearchScoreField;
  BoxID?: SearchScoreField;
}

interface SearchScoreReference {
  Artikel_Nummer?: SearchScoreField;
  Artikelbeschreibung?: SearchScoreField;
  Suchbegriff?: SearchScoreField;
  Hersteller?: SearchScoreField;
  Kurzbeschreibung?: SearchScoreField;
  Langtext?: SearchScoreField;
}

type ReferenceFieldScores = {
  scoreSuchbegriff: number;
  scoreHersteller: number;
  scoreArtikelbeschreibung: number;
  scoreKurzbeschreibung: number;
  scoreLangtext: number;
  scoreArtikelNummer: number;
  bestScore: number;
  bestField: 'Suchbegriff' | 'Hersteller' | 'Artikelbeschreibung' | 'Kurzbeschreibung' | 'Langtext' | 'ArtikelNummer';
};

function scoreItem(
  term: string,
  tokens: string[],
  item: SearchScoreItem,
  includeDeepFields: boolean
): ItemFieldScores {
  const suchbegriffCandidate = resolveSearchSuchbegriff(item?.Suchbegriff, {
    artikelbeschreibung: item?.Artikelbeschreibung,
    artikelNummer: item?.Artikel_Nummer,
    context: `item-score-${item?.ItemUUID ?? 'unknown'}`,
    itemUUID: item?.ItemUUID ?? null
  });
  const normalizedTerm = normalize(term);
  const normalizedSuchbegriff = normalize(suchbegriffCandidate);
  let scoreSuchbegriff = computeSimilarityScore(term, tokens, suchbegriffCandidate);
  if (normalizedSuchbegriff && normalizedSuchbegriff === normalizedTerm) {
    console.info('[search] Suchbegriff exact match detected in item score', {
      itemId: item?.ItemUUID ?? null,
      artikelNummer: item?.Artikel_Nummer ?? null
    });
    scoreSuchbegriff = 1;
  }
  const normalizedHersteller = normalize(item?.Hersteller);
  let scoreHersteller = computeSimilarityScore(term, tokens, item?.Hersteller);
  if (normalizedHersteller && normalizedHersteller === normalizedTerm) {
    console.info('[search] Hersteller exact match detected in item score', {
      itemId: item?.ItemUUID ?? null,
      artikelNummer: item?.Artikel_Nummer ?? null
    });
    scoreHersteller = 1;
  }

  const scoreArtikelbeschreibung = computeSimilarityScore(term, tokens, item?.Artikelbeschreibung);
  const scoreKurzbeschreibung = includeDeepFields
    ? computeSimilarityScore(term, tokens, item?.Kurzbeschreibung)
    : 0;
  const scoreLangtext = includeDeepFields ? computeSimilarityScore(term, tokens, item?.Langtext) : 0;
  const scoreArtikelNummer = computeSimilarityScore(term, tokens, item?.Artikel_Nummer);
  const scoreItemUUID = computeSimilarityScore(term, tokens, item?.ItemUUID);
  const scoreBoxID = computeSimilarityScore(term, tokens, item?.BoxID);

  const scoreEntries: Array<{ field: ItemFieldScores['bestField']; score: number }> = [
    { field: 'Suchbegriff', score: scoreSuchbegriff },
    { field: 'Hersteller', score: scoreHersteller },
    { field: 'Artikelbeschreibung', score: scoreArtikelbeschreibung },
    { field: 'Kurzbeschreibung', score: scoreKurzbeschreibung },
    { field: 'Langtext', score: scoreLangtext },
    { field: 'ArtikelNummer', score: scoreArtikelNummer },
    { field: 'ItemUUID', score: scoreItemUUID },
    { field: 'BoxID', score: scoreBoxID }
  ];

  const best = scoreEntries.reduce(
    (current, entry) => (entry.score > current.score ? entry : current),
    scoreEntries[0]
  );

  return {
    scoreSuchbegriff,
    scoreHersteller,
    scoreArtikelbeschreibung,
    scoreKurzbeschreibung,
    scoreLangtext,
    scoreArtikelNummer,
    scoreItemUUID,
    scoreBoxID,
    bestScore: best.score,
    bestField: best.field
  };
}

function scoreBox(term: string, tokens: string[], box: any): number {
  const fields = [box?.BoxID, box?.LocationId, box?.Label];
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

function scoreReference(
  term: string,
  tokens: string[],
  reference: SearchScoreReference,
  includeDeepFields: boolean
): ReferenceFieldScores {
  const suchbegriffCandidate = resolveSearchSuchbegriff(reference?.Suchbegriff, {
    artikelbeschreibung: reference?.Artikelbeschreibung,
    artikelNummer: reference?.Artikel_Nummer,
    context: `ref-score-${reference?.Artikel_Nummer ?? 'unknown'}`
  });
  const normalizedTerm = normalize(term);
  const normalizedSuchbegriff = normalize(suchbegriffCandidate);
  let scoreSuchbegriff = computeSimilarityScore(term, tokens, suchbegriffCandidate);
  if (normalizedSuchbegriff && normalizedSuchbegriff === normalizedTerm) {
    console.info('[search] Suchbegriff exact match detected in reference score', {
      artikelNummer: reference?.Artikel_Nummer ?? null
    });
    scoreSuchbegriff = 1;
  }
  const normalizedHersteller = normalize(reference?.Hersteller);
  let scoreHersteller = computeSimilarityScore(term, tokens, reference?.Hersteller);
  if (normalizedHersteller && normalizedHersteller === normalizedTerm) {
    console.info('[search] Hersteller exact match detected in reference score', {
      artikelNummer: reference?.Artikel_Nummer ?? null
    });
    scoreHersteller = 1;
  }

  const scoreArtikelbeschreibung = computeSimilarityScore(term, tokens, reference?.Artikelbeschreibung);
  const scoreKurzbeschreibung = includeDeepFields
    ? computeSimilarityScore(term, tokens, reference?.Kurzbeschreibung)
    : 0;
  const scoreLangtext = includeDeepFields ? computeSimilarityScore(term, tokens, reference?.Langtext) : 0;
  const scoreArtikelNummer = computeSimilarityScore(term, tokens, reference?.Artikel_Nummer);

  const scoreEntries: Array<{ field: ReferenceFieldScores['bestField']; score: number }> = [
    { field: 'Suchbegriff', score: scoreSuchbegriff },
    { field: 'Hersteller', score: scoreHersteller },
    { field: 'Artikelbeschreibung', score: scoreArtikelbeschreibung },
    { field: 'Kurzbeschreibung', score: scoreKurzbeschreibung },
    { field: 'Langtext', score: scoreLangtext },
    { field: 'ArtikelNummer', score: scoreArtikelNummer }
  ];

  const best = scoreEntries.reduce(
    (current, entry) => (entry.score > current.score ? entry : current),
    scoreEntries[0]
  );

  return {
    scoreSuchbegriff,
    scoreHersteller,
    scoreArtikelbeschreibung,
    scoreKurzbeschreibung,
    scoreLangtext,
    scoreArtikelNummer,
    bestScore: best.score,
    bestField: best.field
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'search',
  label: 'Search',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/search' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      console.log("search...");
      const url = new URL(req.url || '', PUBLIC_ORIGIN);
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
      const suchbegriffFallbackExpr =
        "COALESCE(NULLIF(r.Suchbegriff, ''), r.Artikelbeschreibung, r.Artikel_Nummer, '')";

      const scopeParam = url.searchParams.get("scope");
      const dedupeParam = url.searchParams.get("dedupe");
      const deepSearchParam = url.searchParams.get("deepSearch") || url.searchParams.get("DeepSearch");
      const normalizedScope = scopeParam ? scopeParam.trim().toLowerCase() : null;
      const normalizedDedupe = dedupeParam ? dedupeParam.trim().toLowerCase() : null;
      const deepSearch = parseDeepSearchParam(deepSearchParam);
      const wantsInstances =
        normalizedScope === "instances" ||
        normalizedScope === "instance" ||
        normalizedScope === "items";
      const wantsRefs =
        !wantsInstances &&
        (normalizedScope === "refs" ||
          normalizedScope === "references" ||
          normalizedDedupe === "true" ||
          normalizedDedupe === "1" ||
          normalizedDedupe === "yes");

      const itemLimit = parseSearchLimit(url.searchParams.get("limit"), "items", DEFAULT_ITEM_LIMIT);
      console.info('[search] Deep search', {
        term: trimmed,
        deepSearch,
        source: deepSearchParam ? 'param' : 'default'
      });

      if (wantsRefs) {
        let refTokenPresenceTerms = '';
        let refExactMatchExpr = '';
        let refSql = '';
        let refParams: Array<string | number> = [];
        try {
          const like6 = (t: string) => {
            const p = `%${t}%`;
            return [p, p, p, p, p, p] as const;
          };

          refTokenPresenceTerms = tokens
            .map(
              () => `
    CASE WHEN (
      lower(r.Artikel_Nummer) LIKE ?
      OR lower(COALESCE(r.Artikelbeschreibung, '')) LIKE ?
      OR lower(COALESCE(r.Kurzbeschreibung, '')) LIKE ?
      OR lower(${suchbegriffFallbackExpr}) LIKE ?
      OR lower(COALESCE(r.Langtext, '')) LIKE ?
      OR lower(COALESCE(r.Hersteller, '')) LIKE ?
    ) THEN 1 ELSE 0 END
  `
            )
            .join(" + ");

          refExactMatchExpr = `
    CASE WHEN (
      lower(r.Artikel_Nummer) = ?
      OR lower(COALESCE(r.Artikelbeschreibung, '')) = ?
      OR lower(${suchbegriffFallbackExpr}) = ?
      OR lower(COALESCE(r.Hersteller, '')) = ?
    ) THEN 1 ELSE 0 END
  `;

          refSql = `
    SELECT *
    FROM (
      SELECT
        r.*, 
        (${refTokenPresenceTerms}) AS token_hits,
        ${refExactMatchExpr} AS exact_match,
        CASE
          WHEN ${refExactMatchExpr} = 1 THEN 1.0
          ELSE (CAST((${refTokenPresenceTerms}) AS REAL) / ?) * 0.99
        END AS sql_score,
        (
          SELECT i.ItemUUID
          FROM items i
          WHERE i.Artikel_Nummer = r.Artikel_Nummer
          ORDER BY i.UpdatedAt DESC
          LIMIT 1
        ) AS exemplar_item_uuid,
        (
          SELECT i.BoxID
          FROM items i
          WHERE i.Artikel_Nummer = r.Artikel_Nummer
          AND i.BoxID IS NOT NULL
          ORDER BY i.UpdatedAt DESC
          LIMIT 1
        ) AS exemplar_box_id,
        (
          SELECT COALESCE(i.Location, b.Label)
          FROM items i
          LEFT JOIN boxes b ON i.BoxID = b.BoxID
          WHERE i.Artikel_Nummer = r.Artikel_Nummer
          ORDER BY i.UpdatedAt DESC
          LIMIT 1
        ) AS exemplar_location
      FROM item_refs r
    )
    WHERE token_hits >= ?
    ORDER BY exact_match DESC, sql_score DESC
    LIMIT 25
  `;

          refParams = [
            // token_hits params
            ...tokens.flatMap(like6),
            // exact_match params (equality)
            normalized,
            normalized,
            normalized,
            normalized,
            // sql_score CASE exact_match params (repeat equality)
            normalized,
            normalized,
            normalized,
            normalized,
            // sql_score token_hits terms again (used in ELSE)
            ...tokens.flatMap(like6),
            // divisor = tokens.length
            tokens.length,
            // WHERE threshold
            minTokenHits
          ];
        } catch (error) {
          console.error('[search] Failed to build reference search query', { term: trimmed, error });
          throw error;
        }

        let rawRefs: any[] = [];
        try {
          rawRefs = ctx.db.prepare(refSql).all(...refParams);
        } catch (error) {
          console.error('[search] Failed to execute reference search query', { term: trimmed, error });
          throw error;
        }

        // TODO(search-refs): Validate stored reference score breakdown logging after rollout.
        const deduped = new Map<
          string,
          { ref: Record<string, unknown>; score: number; exact: number; scoreBreakdown: ReferenceFieldScores }
        >();

        for (const row of rawRefs) {
          const {
            token_hits,
            exact_match,
            sql_score,
            exemplar_item_uuid,
            exemplar_box_id,
            exemplar_location,
            ...rest
          } = row as Record<string, any>;
          const reference = {
            ...rest,
            exemplarItemUUID: exemplar_item_uuid ?? null,
            exemplarBoxID: exemplar_box_id ?? null,
            exemplarLocation: exemplar_location ?? null
          } as Record<string, unknown> & { Artikel_Nummer?: string };
          const suchbegriffCheck = resolveSearchSuchbegriff(reference.Suchbegriff, {
            artikelbeschreibung: reference.Artikelbeschreibung,
            artikelNummer: reference.Artikel_Nummer,
            context: `ref-exact-match-${reference.Artikel_Nummer ?? 'unknown'}`
          });
          if (
            typeof token_hits === 'number' &&
            token_hits > 0 &&
            !hasExactMatchFieldValue([
              reference.Artikel_Nummer,
              reference.Artikelbeschreibung,
              suchbegriffCheck,
              reference.Hersteller
            ])
          ) {
            console.warn('[search] Reference token hits without exact-match fields populated', {
              artikelNummer: reference.Artikel_Nummer ?? null,
              tokenHits: token_hits
            });
          }
          const key = reference.Artikel_Nummer;
          if (!key) {
            continue;
          }
          const scoreBreakdown = scoreReference(normalized, tokens, reference, deepSearch);
          const score = scoreBreakdown.bestScore;
          const exactValue = typeof exact_match === "number" ? exact_match : 0;
          const existing = deduped.get(key);
          if (!existing || score > existing.score || (score === existing.score && exactValue > existing.exact)) {
            deduped.set(key, { ref: reference, score, exact: exactValue, scoreBreakdown });
          }
        }

        const sorted = Array.from(deduped.values()).sort((a, b) => {
          if (b.exact !== a.exact) {
            return b.exact - a.exact;
          }
          return b.score - a.score;
        });

        const topRefScore = sorted.length ? sorted[0].score : 0;
        const refs = sorted.slice(0, 10).map((entry) => entry.ref);

        console.log(
          "search",
          term,
          "(refs) →",
          refs.length,
          "references",
          "top score",
          topRefScore.toFixed(3)
        );

        sorted.slice(0, 3).forEach((entry, index) => {
          try {
            const scoreBreakdown = scoreReference(normalized, tokens, entry.ref, deepSearch);
            console.info('[search] Top reference field score', {
              index,
              artikelNummer: (entry.ref as Record<string, unknown>).Artikel_Nummer ?? null,
              bestField: entry.scoreBreakdown.bestField,
              bestScore: entry.scoreBreakdown.bestScore
            });
          } catch (error) {
            console.error('[search] Failed to compute reference field scores for logging', {
              index,
              error
            });
          }
        });

        sendJson(res, 200, {
          items: refs,
          scope: "refs"
        });
        return;
      }

      const likeItem = (t: string) => {
        const p = `%${t}%`;
        return deepSearch ? [p, p, p, p, p, p, p, p] as const : [p, p, p, p, p, p] as const;
      };
      const likeBox = (t: string) => {
        const p = `%${t}%`;
        return [p, p, p] as const;
      };

      // ---------------- ITEMS ----------------
      // token_hits: per-token presence (0/1), not per-field sum
      let itemTokenPresenceTerms = '';
      let itemExactMatchExpr = '';
      let itemSql = '';
      let itemExactParams: string[] = [];
      let itemParams: Array<string | number> = [];
      try {
        itemTokenPresenceTerms = tokens.map(() => `
    CASE WHEN (
      lower(i.ItemUUID)            LIKE ?
      OR lower(i.Artikel_Nummer)   LIKE ?
      OR lower(COALESCE(r.Artikelbeschreibung, '')) LIKE ?
      OR lower(${suchbegriffFallbackExpr}) LIKE ?
      ${deepSearch ? "OR lower(COALESCE(r.Kurzbeschreibung, '')) LIKE ?\n      OR lower(COALESCE(r.Langtext, '')) LIKE ?" : ''}
      OR lower(COALESCE(r.Hersteller, '')) LIKE ?
      OR lower(i.BoxID)            LIKE ?
    ) THEN 1 ELSE 0 END
  `).join(" + ");

        // exact match if ANY field equals the normalized query
        itemExactMatchExpr = `
    CASE WHEN (
      lower(i.ItemUUID)            = ?
      OR lower(i.Artikel_Nummer)   = ?
      OR lower(COALESCE(r.Artikelbeschreibung, '')) = ?
      OR lower(${suchbegriffFallbackExpr}) = ?
      ${deepSearch ? "OR lower(COALESCE(r.Kurzbeschreibung, '')) = ?\n      OR lower(COALESCE(r.Langtext, '')) = ?" : ''}
      OR lower(COALESCE(r.Hersteller, '')) = ?
      OR lower(i.BoxID)            = ?
    ) THEN 1 ELSE 0 END
  `;

        itemSql = `
    SELECT *
    FROM (
      SELECT
        i.ItemUUID,
        i.Artikel_Nummer,
        i.BoxID,
        COALESCE(i.Location, b.Label) AS Location,
        i.UpdatedAt,
        i.Datum_erfasst,
        i.Auf_Lager,
        r.Grafikname,
        r.Artikelbeschreibung,
        r.Verkaufspreis,
        r.Kurzbeschreibung,
        r.Suchbegriff,
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
        r.EntityType,
        (${itemTokenPresenceTerms}) AS token_hits,
        ${itemExactMatchExpr} AS exact_match,
        CASE
          WHEN ${itemExactMatchExpr} = 1 THEN 1.0
          ELSE (CAST((${itemTokenPresenceTerms}) AS REAL) / ?) * 0.99
        END AS sql_score
      FROM items i
      LEFT JOIN boxes b ON i.BoxID = b.BoxID
      LEFT JOIN item_refs r ON i.Artikel_Nummer = r.Artikel_Nummer
    )
    WHERE token_hits >= ?
    ORDER BY exact_match DESC, sql_score DESC
    LIMIT ?
  `;

        itemExactParams = deepSearch
          ? [normalized, normalized, normalized, normalized, normalized, normalized, normalized, normalized]
          : [normalized, normalized, normalized, normalized, normalized, normalized];

        itemParams = [
          // token_hits params
          ...tokens.flatMap(likeItem),
          // exact_match params (equality fields)
          ...itemExactParams,
          // sql_score CASE exact_match params (repeat the equality)
          ...itemExactParams,
          // sql_score token_hits terms again (used in ELSE)
          ...tokens.flatMap(likeItem),
          // divisor = tokens.length
          tokens.length,
          // WHERE threshold
          minTokenHits,
          // LIMIT
          itemLimit
        ];
      } catch (error) {
        console.error('[search] Failed to build item search query', { term: trimmed, error });
        throw error;
      }

      let rawItems: any[] = [];
      try {
        rawItems = ctx.db.prepare(itemSql).all(...itemParams);
      } catch (error) {
        console.error('[search] Failed to execute item search query', { term: trimmed, error });
        throw error;
      }
      if (rawItems.length >= itemLimit) {
        console.info('[search] Item results reached limit; results may be truncated.', {
          term: trimmed,
          limit: itemLimit,
          returned: rawItems.length
        });
      }
      for (const item of rawItems) {
        if (typeof item?.token_hits !== 'number' || item.token_hits <= 0) {
          continue;
        }
        const suchbegriffCheck = resolveSearchSuchbegriff(item?.Suchbegriff, {
          artikelbeschreibung: item?.Artikelbeschreibung,
          artikelNummer: item?.Artikel_Nummer,
          context: `item-exact-match-${item?.ItemUUID ?? 'unknown'}`,
          itemUUID: item?.ItemUUID ?? null
        });
        const exactMatchFields = [
          item?.ItemUUID,
          item?.Artikel_Nummer,
          item?.Artikelbeschreibung,
          suchbegriffCheck,
          item?.Hersteller,
          item?.BoxID
        ];
        if (deepSearch) {
          exactMatchFields.push(item?.Kurzbeschreibung, item?.Langtext);
        }
        if (!hasExactMatchFieldValue(exactMatchFields)) {
          console.warn('[search] Item token hits without exact-match fields populated', {
            itemId: item?.ItemUUID ?? null,
            artikelNummer: item?.Artikel_Nummer ?? null,
            tokenHits: item?.token_hits ?? null
          });
        }
      }

      // ---------------- BOXES ----------------
      const boxTokenPresenceTerms = tokens.map(() => `
    CASE WHEN (
      lower(b.BoxID)    LIKE ?
      OR lower(b.Label) LIKE ?
      OR lower(COALESCE(b.Label, '')) LIKE ?
    ) THEN 1 ELSE 0 END
  `).join(" + ");

      const boxExactMatchExpr = `
    CASE WHEN (
      lower(b.BoxID)    = ?
      OR lower(b.Label) = ?
      OR lower(COALESCE(b.Label, '')) = ?
    ) THEN 1 ELSE 0 END
  `;

      const boxSql = `
    SELECT *
    FROM (
      SELECT
        b.BoxID, b.Label, b.Label,
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
        ...tokens.flatMap(likeBox),
        // exact_match params
        normalized, normalized, normalized,
        // sql_score CASE exact_match params (repeat)
        normalized, normalized, normalized,
        // sql_score token_hits terms again
        ...tokens.flatMap(likeBox),
        // divisor = tokens.length
        tokens.length,
        // WHERE threshold
        minTokenHits,
      ];

      const rawBoxes = ctx.db.prepare(boxSql).all(...boxParams);

      // ----- same JS scoring + response -----
      const scoredItems = rawItems
        .map((item: any, index: number) => {
          const sanitizedItem = {
            ...item,
            Einheit: normalizeSearchEinheit(item.Einheit, `item-${index}`)
          };
          const parsedAufLager = parseAufLagerValue(item.Auf_Lager, `item-${index}`);
          if (sanitizedItem.Einheit !== ItemEinheit.Menge && parsedAufLager > 1) {
            console.warn('[search] Instance item has Auf_Lager > 1', {
              itemId: sanitizedItem.ItemUUID ?? null,
              artikelNumber: sanitizedItem.Artikel_Nummer ?? null,
              aufLager: parsedAufLager
            });
          }
          const scoreBreakdown = scoreItem(normalized, tokens, sanitizedItem, deepSearch);
          return { item: sanitizedItem, score: scoreBreakdown.bestScore, scoreBreakdown };
        })
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

      scoredItems.slice(0, 3).forEach((entry, index) => {
        try {
          console.info('[search] Top item field score', {
            index,
            itemId: entry.item.ItemUUID ?? null,
            artikelNummer: entry.item.Artikel_Nummer ?? null,
            bestField: entry.scoreBreakdown.bestField,
            bestScore: entry.scoreBreakdown.bestScore
          });
        } catch (error) {
          console.error('[search] Failed to log item field scores', {
            index,
            itemId: entry.item?.ItemUUID ?? null,
            error
          });
        }
      });

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
});

export default action;
