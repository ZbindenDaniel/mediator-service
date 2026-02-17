import { z } from 'zod';
import { stringifyLangChainContent } from '../utils/langchain';
import { parseJsonWithSanitizer } from '../utils/json';
import type { ChatModel, ExtractionLogger } from './item-flow-extraction';
import type { AgenticOutput } from './item-flow-schemas';
import { appendTranscriptSection, type AgentTranscriptWriter, type TranscriptSectionPayload } from './transcript';

// TODO(agent): Revisit pricing rule injection once pricing heuristics are validated with real catalog data.
// TODO(agentic-pricing-threshold-tuning): Re-tune confidence/evidence thresholds after collecting production telemetry.
const PricingResponseSchema = z
  .object({
    Verkaufspreis: z.union([z.number(), z.string(), z.null()]).optional(),
    directListingPrice: z.union([z.number(), z.string(), z.null()]).optional(),
    trustedHistoricalPrice: z.union([z.number(), z.string(), z.null()]).optional(),
    confidence: z.union([z.number(), z.string(), z.null()]).optional(),
    evidenceCount: z.union([z.number(), z.string(), z.null()]).optional(),
    sourceUrl: z.string().trim().optional(),
    parseStatus: z.string().trim().optional(),
    zeroIsValid: z.boolean().optional(),
    item: z
      .object({
        Verkaufspreis: z.union([z.number(), z.string(), z.null()]).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const PRICING_TIMEOUT_MS = 15000;
const MIN_CONFIDENCE_FOR_PRICE = 0.6;
const MIN_EVIDENCE_COUNT_FOR_PRICE = 2;

// TODO(agent): Revisit price normalization once locale-specific pricing data is available.
function normalizePriceValue(value: unknown, { allowZero = false }: { allowZero?: boolean } = {}): number | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    if (value === 0 && !allowZero) {
      return null;
    }
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.replace(/\u00A0/g, ' ').trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/[^0-9,.-]/g, '');
  if (!normalized) {
    return null;
  }
  const numeric = normalized.replace(/,/g, '.');
  const match = numeric.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[0]);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed === 0 && !allowZero) {
    return null;
  }
  return parsed;
}

function normalizeScore(value: unknown): number | null {
  const parsed = normalizePriceValue(value, { allowZero: true });
  if (parsed == null) {
    return null;
  }
  if (parsed > 1 && parsed <= 100) {
    return parsed / 100;
  }
  return parsed;
}

function normalizeEvidenceCount(value: unknown): number {
  const parsed = normalizePriceValue(value, { allowZero: true });
  if (parsed == null || !Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
}

type PricingDecisionInput = z.infer<typeof PricingResponseSchema>;

export function resolvePricingDecision(payload: PricingDecisionInput): {
  normalizedPrice: number | null;
  confidence: number;
  evidenceCount: number;
  selectedSource: 'directListingPrice' | 'trustedHistoricalPrice' | 'Verkaufspreis' | 'item.Verkaufspreis' | 'none';
} {
  const allowZero = payload.zeroIsValid === true;
  const directListingPrice = normalizePriceValue(payload.directListingPrice, { allowZero });
  const trustedHistoricalPrice = normalizePriceValue(payload.trustedHistoricalPrice, { allowZero });
  const explicitPrice = normalizePriceValue(payload.Verkaufspreis, { allowZero });
  const nestedPrice = normalizePriceValue(payload.item?.Verkaufspreis, { allowZero });
  const confidence = Math.max(0, Math.min(1, normalizeScore(payload.confidence) ?? 0));
  const evidenceCount = normalizeEvidenceCount(payload.evidenceCount);

  let normalizedPrice: number | null = null;
  let selectedSource: 'directListingPrice' | 'trustedHistoricalPrice' | 'Verkaufspreis' | 'item.Verkaufspreis' | 'none' = 'none';
  if (directListingPrice != null) {
    normalizedPrice = directListingPrice;
    selectedSource = 'directListingPrice';
  } else if (trustedHistoricalPrice != null) {
    normalizedPrice = trustedHistoricalPrice;
    selectedSource = 'trustedHistoricalPrice';
  } else if (explicitPrice != null) {
    normalizedPrice = explicitPrice;
    selectedSource = 'Verkaufspreis';
  } else if (nestedPrice != null) {
    normalizedPrice = nestedPrice;
    selectedSource = 'item.Verkaufspreis';
  }

  if (normalizedPrice != null && (confidence < MIN_CONFIDENCE_FOR_PRICE || evidenceCount < MIN_EVIDENCE_COUNT_FOR_PRICE)) {
    return { normalizedPrice: null, confidence, evidenceCount, selectedSource };
  }

  return { normalizedPrice, confidence, evidenceCount, selectedSource };
}

// TODO(agent): Consolidate LLM-facing field alias helpers across extraction/categorizer/pricing stages.
function mapLangtextToSpezifikationenForLlm(
  payload: AgenticOutput,
  { itemId, logger }: { itemId: string; logger?: ExtractionLogger }
): Record<string, unknown> {
  try {
    const record = payload as unknown as Record<string, unknown>;
    if (!('Langtext' in record)) {
      return record;
    }
    const remapped: Record<string, unknown> = { ...record, Spezifikationen: record.Langtext };
    delete remapped.Langtext;
    logger?.debug?.({ msg: 'mapped Langtext to Spezifikationen for pricing payload', itemId });
    return remapped;
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to map Langtext to Spezifikationen for pricing payload', itemId });
    return payload as unknown as Record<string, unknown>;
  }
}

export function isUsablePrice(value: unknown): boolean {
  const normalized = normalizePriceValue(value, { allowZero: false });
  return typeof normalized === 'number' && Number.isFinite(normalized) && normalized > 0;
}

export interface RunPricingStageOptions {
  llm: ChatModel;
  logger?: ExtractionLogger;
  itemId: string;
  pricingPrompt: string;
  candidate: AgenticOutput;
  searchSummary?: string | null;
  reviewNotes?: string | null;
  transcriptWriter?: AgentTranscriptWriter | null;
}

export async function runPricingStage({
  llm,
  logger,
  itemId,
  pricingPrompt,
  candidate,
  searchSummary,
  reviewNotes,
  transcriptWriter
}: RunPricingStageOptions): Promise<Partial<AgenticOutput> | null> {
  if (!pricingPrompt || !pricingPrompt.trim()) {
    logger?.warn?.({ msg: 'pricing prompt missing, skipping pricing stage', itemId });
    return null;
  }

  logger?.info?.({ msg: 'invoking pricing stage', itemId });

  const instructions: Record<string, unknown> = {};
  const trimmedReviewNotes = typeof reviewNotes === 'string' ? reviewNotes.trim() : '';
  if (trimmedReviewNotes) {
    instructions.reviewNotes = trimmedReviewNotes;
  }
  if (typeof searchSummary === 'string' && searchSummary.trim()) {
    instructions.searchSummary = searchSummary.trim();
  }

  const llmCandidate = mapLangtextToSpezifikationenForLlm(candidate, { itemId, logger });
  const payloadForPricing: Record<string, unknown> = {
    item: llmCandidate,
    ...(Object.keys(instructions).length > 0 ? { instructions } : {})
  };

  let userPayload = '';
  try {
    userPayload = JSON.stringify(payloadForPricing, null, 2);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to serialize pricing payload', itemId });
    try {
      userPayload = JSON.stringify({ item: llmCandidate }, null, 2);
    } catch (fallbackErr) {
      logger?.error?.({ err: fallbackErr, msg: 'pricing payload serialization failed', itemId });
      return null;
    }
  }

  let pricingRes;
  let pricingMessages: Array<{ role: string; content: string }> = [];
  const timeoutMs = PRICING_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  try {
    pricingMessages = [
      { role: 'system', content: pricingPrompt },
      { role: 'user', content: userPayload }
    ];
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger?.warn?.({ msg: 'pricing stage timed out', itemId, timeoutMs });
        resolve(null);
      }, timeoutMs);
    });
    const invokePromise = llm.invoke(pricingMessages).catch((err) => {
      if (!timedOut) {
        logger?.error?.({ err, msg: 'pricing llm invocation failed', itemId });
      }
      return null;
    });
    const raceResult = await Promise.race([invokePromise, timeoutPromise]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (!raceResult) {
      return null;
    }
    pricingRes = raceResult;
  } catch (err) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    logger?.error?.({ err, msg: 'pricing llm invocation failed', itemId });
    return null;
  }

  const raw = stringifyLangChainContent(pricingRes?.content, {
    context: 'itemFlow.pricing',
    logger
  });

  const transcriptPayload: TranscriptSectionPayload = {
    request: payloadForPricing,
    messages: pricingMessages,
    response: raw
  };

  try {
    await appendTranscriptSection(transcriptWriter, 'pricing', transcriptPayload, raw, logger, itemId);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to append pricing transcript section', itemId });
  }

  let parsed: unknown;
  try {
    parsed = parseJsonWithSanitizer(raw, {
      loggerInstance: logger,
      context: { itemId, stage: 'pricing-agent' }
    });
  } catch (err) {
    logger?.warn?.({ err, msg: 'pricing response contained invalid json', itemId });
    return null;
  }

  const validated = PricingResponseSchema.safeParse(parsed);
  if (!validated.success) {
    logger?.warn?.({ msg: 'pricing response validation failed', itemId, issues: validated.error.issues });
    return null;
  }

  let decision;
  try {
    decision = resolvePricingDecision(validated.data);
  } catch (err) {
    logger?.error?.({
      err,
      msg: 'pricing parse/normalize failed',
      itemId,
      sourceUrl: validated.data.sourceUrl ?? null,
      parseStatus: validated.data.parseStatus ?? 'normalization-exception'
    });
    return null;
  }

  if (!isUsablePrice(decision.normalizedPrice)) {
    logger?.info?.({
      msg: 'pricing stage returned no usable price',
      itemId,
      sourceUrl: validated.data.sourceUrl ?? null,
      parseStatus: validated.data.parseStatus ?? 'parsed',
      selectedSource: decision.selectedSource,
      confidence: decision.confidence,
      evidenceCount: decision.evidenceCount
    });
    return null;
  }

  logger?.info?.({
    msg: 'pricing stage resolved price',
    itemId,
    Verkaufspreis: decision.normalizedPrice,
    selectedSource: decision.selectedSource,
    confidence: decision.confidence,
    evidenceCount: decision.evidenceCount,
    sourceUrl: validated.data.sourceUrl ?? null,
    parseStatus: validated.data.parseStatus ?? 'parsed'
  });
  return { Verkaufspreis: decision.normalizedPrice };
}
