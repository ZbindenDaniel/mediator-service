import { z } from 'zod';
import { stringifyLangChainContent } from '../utils/langchain';
import { parseJsonWithSanitizer } from '../utils/json';
import type { ChatModel, ExtractionLogger } from './item-flow-extraction';
import type { AgenticOutput } from './item-flow-schemas';
import type { StandardsContract } from '../../../models/agentic-findings';
import { appendTranscriptSection, type AgentTranscriptWriter, type TranscriptSectionPayload } from './transcript';

// The wording stage runs AFTER extraction. Extraction owns the facts; this pass rewrites the two prose
// fields (Artikelbeschreibung, Kurzbeschreibung) into the house style and strips fluff/marketing/
// source-copied phrases — without adding or changing facts. It is intentionally small: one LLM call,
// prose-only, and a failure returns null so the caller keeps extraction's wording.

const WORDING_TIMEOUT_MS = 20000;

const WordingResponseSchema = z
  .object({
    Artikelbeschreibung: z.union([z.string(), z.null()]).optional(),
    Kurzbeschreibung: z.union([z.string(), z.null()]).optional(),
    // The LLM-facing alias for Langtext; the model may return cleaned-up spec key names/values here.
    Spezifikationen: z.union([z.record(z.unknown()), z.null()]).optional()
  })
  .passthrough();

export interface WordingResult {
  Artikelbeschreibung?: string;
  Kurzbeschreibung?: string;
  // Spec object with tidied key names, mapped back from the model's "Spezifikationen".
  Langtext?: Record<string, unknown>;
}

// Renders the runtime-editable standards into a compact instruction list the wording model applies.
// Kept data-driven so an operator edit to contracts/standards.json changes wording with no redeploy.
export function renderStandardsGuidance(standards: StandardsContract | null): string[] {
  const rules: string[] = [];
  for (const rule of standards?.bannedPhrases ?? []) {
    const phrase = typeof rule?.pattern === 'string' ? rule.pattern.trim() : '';
    if (!phrase || rule.regex) continue; // only surface literal phrases as human guidance
    const reason = typeof rule?.message === 'string' && rule.message.trim() ? ` — ${rule.message.trim()}` : '';
    rules.push(`Avoid the phrasing "${phrase}"${reason}`);
  }
  return rules;
}

// Pure parse of the model's wording response → the two prose fields (trimmed, non-empty only).
// Exported for unit testing without invoking a model.
export function parseWordingResponse(raw: string): WordingResult | null {
  let parsed: unknown;
  try {
    parsed = parseJsonWithSanitizer(raw, { context: { stage: 'wording-agent' } });
  } catch {
    return null;
  }
  const validated = WordingResponseSchema.safeParse(parsed);
  if (!validated.success) return null;

  const result: WordingResult = {};
  const artikel = validated.data.Artikelbeschreibung;
  const kurz = validated.data.Kurzbeschreibung;
  const spez = validated.data.Spezifikationen;
  if (typeof artikel === 'string' && artikel.trim()) result.Artikelbeschreibung = artikel.trim();
  if (typeof kurz === 'string' && kurz.trim()) result.Kurzbeschreibung = kurz.trim();
  // Accept a rewritten spec object only when it's a non-empty plain object — never let the step blank
  // out the specs (an empty/absent Spezifikationen leaves extraction's Langtext untouched upstream).
  if (spez && typeof spez === 'object' && !Array.isArray(spez) && Object.keys(spez).length > 0) {
    result.Langtext = spez as Record<string, unknown>;
  }
  return Object.keys(result).length > 0 ? result : null;
}

export interface RunWordingStageOptions {
  llm: ChatModel;
  logger?: ExtractionLogger;
  itemId: string;
  wordingPrompt: string;
  candidate: AgenticOutput;
  standards: StandardsContract | null;
  reviewNotes?: string | null;
  transcriptWriter?: AgentTranscriptWriter | null;
}

// Builds the facts payload the wording model rewrites from. Only descriptive fields — no price/category.
function buildWordingFacts(candidate: AgenticOutput): Record<string, unknown> {
  const record = candidate as unknown as Record<string, unknown>;
  return {
    Hersteller: record.Hersteller ?? null,
    Artikelbeschreibung: record.Artikelbeschreibung ?? '',
    Kurzbeschreibung: record.Kurzbeschreibung ?? '',
    Spezifikationen: record.Langtext ?? {}
  };
}

export async function runWordingStage({
  llm,
  logger,
  itemId,
  wordingPrompt,
  candidate,
  standards,
  reviewNotes,
  transcriptWriter
}: RunWordingStageOptions): Promise<WordingResult | null> {
  if (!wordingPrompt || !wordingPrompt.trim()) {
    logger?.warn?.({ msg: 'wording prompt missing, skipping wording stage', itemId });
    return null;
  }

  const houseRules = renderStandardsGuidance(standards);
  const trimmedReviewNotes = typeof reviewNotes === 'string' ? reviewNotes.trim() : '';
  const payload: Record<string, unknown> = {
    item: buildWordingFacts(candidate),
    houseRules,
    ...(trimmedReviewNotes ? { reviewerNotes: trimmedReviewNotes } : {})
  };

  let userPayload = '';
  try {
    userPayload = JSON.stringify(payload, null, 2);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to serialize wording payload', itemId });
    return null;
  }

  logger?.info?.({ msg: 'invoking wording stage', itemId, houseRuleCount: houseRules.length });

  const messages = [
    { role: 'system', content: wordingPrompt },
    { role: 'user', content: userPayload }
  ];

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  let wordingRes;
  try {
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger?.warn?.({ msg: 'wording stage timed out', itemId, timeoutMs: WORDING_TIMEOUT_MS });
        resolve(null);
      }, WORDING_TIMEOUT_MS);
    });
    const invokePromise = llm.invoke(messages).catch((err) => {
      if (!timedOut) logger?.error?.({ err, msg: 'wording llm invocation failed', itemId });
      return null;
    });
    wordingRes = await Promise.race([invokePromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  if (!wordingRes) return null;

  const raw = stringifyLangChainContent(wordingRes.content, { context: 'itemFlow.wording', logger });

  const transcriptPayload: TranscriptSectionPayload = { request: payload, messages, response: raw };
  try {
    await appendTranscriptSection(transcriptWriter, 'wording', transcriptPayload, raw, logger, itemId);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to append wording transcript section', itemId });
  }

  const result = parseWordingResponse(raw);
  if (!result) {
    logger?.warn?.({ msg: 'wording stage produced no usable result; keeping extraction wording', itemId });
    return null;
  }
  logger?.info?.({
    msg: 'wording stage rewrote prose',
    itemId,
    changedArtikelbeschreibung: typeof result.Artikelbeschreibung === 'string',
    changedKurzbeschreibung: typeof result.Kurzbeschreibung === 'string'
  });
  return result;
}
