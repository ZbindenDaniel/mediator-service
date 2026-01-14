import { z } from 'zod';
import { stringifyLangChainContent } from '../utils/langchain';
import { parseJsonWithSanitizer } from '../utils/json';
import type { ChatModel, ExtractionLogger } from './item-flow-extraction';
import type { AgenticOutput } from './item-flow-schemas';
import { appendTranscriptSection, type AgentTranscriptWriter, type TranscriptSectionPayload } from './transcript';

// TODO(agent): Revisit pricing rule injection once pricing heuristics are validated with real catalog data.
const PricingResponseSchema = z
  .object({
    Verkaufspreis: z.union([z.number(), z.string(), z.null()]).optional()
  })
  .passthrough();

// TODO(agent): Revisit price normalization once locale-specific pricing data is available.
function normalizePriceValue(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
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
  return Number.isFinite(parsed) ? parsed : null;
}

export function isUsablePrice(value: unknown): boolean {
  const normalized = normalizePriceValue(value);
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

  const payloadForPricing: Record<string, unknown> = {
    item: candidate,
    ...(Object.keys(instructions).length > 0 ? { instructions } : {})
  };

  let userPayload = '';
  try {
    userPayload = JSON.stringify(payloadForPricing, null, 2);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to serialize pricing payload', itemId });
    try {
      userPayload = JSON.stringify({ item: candidate }, null, 2);
    } catch (fallbackErr) {
      logger?.error?.({ err: fallbackErr, msg: 'pricing payload serialization failed', itemId });
      return null;
    }
  }

  let pricingRes;
  let pricingMessages: Array<{ role: string; content: string }> = [];
  try {
    pricingMessages = [
      { role: 'system', content: pricingPrompt },
      { role: 'user', content: userPayload }
    ];
    pricingRes = await llm.invoke(pricingMessages);
  } catch (err) {
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

  const candidatePayload = validated.data as { Verkaufspreis?: unknown; item?: { Verkaufspreis?: unknown } };
  const priceValue =
    candidatePayload.Verkaufspreis !== undefined
      ? candidatePayload.Verkaufspreis
      : candidatePayload.item?.Verkaufspreis;
  const normalizedPrice = normalizePriceValue(priceValue);

  if (!isUsablePrice(normalizedPrice)) {
    logger?.info?.({ msg: 'pricing stage returned no usable price', itemId });
    return null;
  }

  logger?.info?.({ msg: 'pricing stage resolved price', itemId, Verkaufspreis: normalizedPrice });
  return { Verkaufspreis: normalizedPrice };
}
