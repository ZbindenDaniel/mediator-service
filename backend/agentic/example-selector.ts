export const STATIC_EXAMPLE_ITEM_BLOCK = [
  '- "Spezifikationen": {"Displaygröße":"15,6\\"","RAM":["DDR5"],"Anschlüsse":["USB-C 3.2","HDMI 2.1"]}',
  '- Leave numeric fields null when missing: {"Gewicht":null,"Tiefe":null}'
].join('\n');

const DEFAULT_MAX_EXAMPLE_CHARS = 1600;

export interface ReviewedExampleCandidate {
  Artikel_Nummer?: unknown;
  Artikelbeschreibung?: unknown;
  Kurzbeschreibung?: unknown;
  Langtext?: unknown;
  Hersteller?: unknown;
  Länge_mm?: unknown;
  Breite_mm?: unknown;
  Höhe_mm?: unknown;
  Gewicht_kg?: unknown;
  Verkaufspreis?: unknown;
  LastReviewDecision?: unknown;
  ReviewedAt?: unknown;
}

export interface ExampleSelectionResult {
  exampleBlock: string;
  selectedExampleId: string | null;
  fallbackReason: string | null;
  wasTruncated: boolean;
}

function normalizeDecision(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeDate(value: unknown): number {
  if (typeof value !== 'string') {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function redactExamplePayload(candidate: ReviewedExampleCandidate): Record<string, unknown> {
  return {
    Artikelbeschreibung: typeof candidate.Artikelbeschreibung === 'string' ? candidate.Artikelbeschreibung.trim() : '',
    Kurzbeschreibung: typeof candidate.Kurzbeschreibung === 'string' ? candidate.Kurzbeschreibung.trim() : '',
    Hersteller: typeof candidate.Hersteller === 'string' ? candidate.Hersteller.trim() : '',
    Verkaufspreis: typeof candidate.Verkaufspreis === 'number' ? candidate.Verkaufspreis : null,
    Länge_mm: typeof candidate.Länge_mm === 'number' ? candidate.Länge_mm : null,
    Breite_mm: typeof candidate.Breite_mm === 'number' ? candidate.Breite_mm : null,
    Höhe_mm: typeof candidate.Höhe_mm === 'number' ? candidate.Höhe_mm : null,
    Gewicht_kg: typeof candidate.Gewicht_kg === 'number' ? candidate.Gewicht_kg : null,
    Spezifikationen: candidate.Langtext ?? {}
  };
}

function serializeExamplePayload(payload: Record<string, unknown>): string {
  return 'Reviewed example item (redacted):\n```json\n' + JSON.stringify(payload, null, 2) + '\n```';
}

export function selectExampleItemBlock({
  candidates,
  currentItemId,
  logger,
  maxExampleChars = DEFAULT_MAX_EXAMPLE_CHARS
}: {
  candidates: ReviewedExampleCandidate[];
  currentItemId: string;
  logger?: { info?: Console['info']; warn?: Console['warn'] };
  maxExampleChars?: number;
}): ExampleSelectionResult {
  try {
    const normalizedCurrentItemId = currentItemId.trim();
    const reviewedCandidates = candidates
      .filter((candidate) => {
        const candidateId = typeof candidate.Artikel_Nummer === 'string' ? candidate.Artikel_Nummer.trim() : '';
        if (!candidateId || candidateId === normalizedCurrentItemId) {
          return false;
        }
        return normalizeDecision(candidate.LastReviewDecision) === 'approved';
      })
      .sort((left, right) => normalizeDate(right.ReviewedAt) - normalizeDate(left.ReviewedAt));

    const selected = reviewedCandidates[0];
    if (!selected) {
      logger?.info?.({
        msg: 'agentic example selector fallback to static block',
        itemId: normalizedCurrentItemId,
        fallbackReason: 'no-reviewed-example'
      });
      return {
        exampleBlock: STATIC_EXAMPLE_ITEM_BLOCK,
        selectedExampleId: null,
        fallbackReason: 'no-reviewed-example',
        wasTruncated: false
      };
    }

    const selectedExampleId = typeof selected.Artikel_Nummer === 'string' ? selected.Artikel_Nummer.trim() : null;
    const payload = redactExamplePayload(selected);
    const serialized = serializeExamplePayload(payload);
    const safeLimit = Number.isFinite(maxExampleChars) && maxExampleChars > 0 ? Math.floor(maxExampleChars) : DEFAULT_MAX_EXAMPLE_CHARS;
    const wasTruncated = serialized.length > safeLimit;
    const exampleBlock = wasTruncated ? `${serialized.slice(0, safeLimit)}\n…` : serialized;

    logger?.info?.({
      msg: 'agentic example selector chose reviewed example',
      itemId: normalizedCurrentItemId,
      selectedExampleId,
      fallbackReason: null,
      wasTruncated,
      payloadLength: serialized.length,
      emittedLength: exampleBlock.length
    });

    return {
      exampleBlock,
      selectedExampleId,
      fallbackReason: null,
      wasTruncated
    };
  } catch (err) {
    logger?.warn?.({
      err,
      msg: 'agentic example selector failed, falling back to static block',
      itemId: currentItemId,
      fallbackReason: 'selector-error'
    });
    return {
      exampleBlock: STATIC_EXAMPLE_ITEM_BLOCK,
      selectedExampleId: null,
      fallbackReason: 'selector-error',
      wasTruncated: false
    };
  }
}
