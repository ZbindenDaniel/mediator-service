// TODO(agent): Revisit item flow orchestration once planner surfaces richer item metadata requirements.
import { agentActorId, autoApproveConfig } from '../config';
import type { AgenticResultPayload } from '../result-handler';
import { createRateLimiter, DEFAULT_DELAY_MS, type RateLimiterLogger } from '../utils/rate-limiter';
import { FlowError } from './errors';
import { type AgenticTarget } from './item-flow-schemas';
import { resolveShopwareMatch } from './item-flow-shopware';
import {
  collectSearchContexts,
  evaluateSearchPlanner,
  identifyMissingSchemaFields,
  type PlannerDecision,
  type SearchInvoker,
  type SearchInvokerMetadata
} from './item-flow-search';
import type { SearchSource } from '../utils/source-formatter';
import { runExtractionAttempts, type ChatModel, type ExtractionLogger } from './item-flow-extraction';
import { runOcrExtraction } from './item-flow-ocr';
import { searchShopwareRaw, isShopwareConfigured, type ShopwareSearchResult } from '../tools/shopware';
import { prepareItemContext } from './context';
import { loadPrompts } from './prompts';
import { dispatchAgenticResult } from './result-dispatch';
import { appendTranscriptSection, createTranscriptWriter, type AgentTranscriptWriter } from './transcript';
import { getSpecContract } from '../..//contracts/registry';
import { canonicalizeSpecKeyRecord } from '../../../models/spec-contract';

const REVIEW_CONTEXT_NOTE_LIMIT = 2_000;

function sanitizeReviewContextNotes(reviewNotes: string | null): { value: string | null; truncated: boolean } {
  if (!reviewNotes) {
    return { value: null, truncated: false };
  }

  const compact = reviewNotes.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return { value: null, truncated: false };
  }

  if (compact.length <= REVIEW_CONTEXT_NOTE_LIMIT) {
    return { value: compact, truncated: false };
  }

  return {
    value: `${compact.slice(0, REVIEW_CONTEXT_NOTE_LIMIT)}…`,
    truncated: true
  };
}

function parseDirectiveCount(reviewNotes: string, prefix: string): number {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = reviewNotes.match(new RegExp(`${escapedPrefix}\\s*([^.]*)\\.?`, 'i'));
  if (!match?.[1]) {
    return 0;
  }

  return match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean).length;
}

function summarizeReviewDirectives(reviewNotes: string | null): { missingSpecCount?: number; unneededSpecCount?: number } {
  if (!reviewNotes) {
    return {};
  }

  const missingSpecCount = parseDirectiveCount(reviewNotes, 'Missing spec fields to prioritize:');
  const unneededSpecCount = parseDirectiveCount(reviewNotes, 'Spec fields to remove if present:');
  return {
    ...(missingSpecCount > 0 ? { missingSpecCount } : {}),
    ...(unneededSpecCount > 0 ? { unneededSpecCount } : {})
  };
}

export interface ItemFlowLogger extends ExtractionLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
  debug?: Console['debug'];
}

export interface ItemFlowDependencies {
  llm: ChatModel;
  visionLlm?: ChatModel;
  correctionLlm?: ChatModel;
  logger?: ItemFlowLogger;
  searchInvoker: SearchInvoker;
  rateLimiterLogger?: RateLimiterLogger;
  searchRateLimitDelayMs?: number;
  applyAgenticResult?: (payload: AgenticResultPayload) => Promise<void> | void;
  saveRequestPayload: (itemId: string, payload: unknown) => Promise<void> | void;
  markNotificationSuccess: (itemId: string) => Promise<void> | void;
  markNotificationFailure: (itemId: string, errorMessage: string) => Promise<void> | void;
  shopwareSearch?: (query: string, limit: number, logger?: ItemFlowLogger) => Promise<ShopwareSearchResult>;
  persistLastError?: (itemId: string, errorMessage: string, attemptAt?: string) => Promise<void> | void;
  // Persist retrieved search results immediately (before extraction), so a later failure still leaves
  // them stored for a search-free automatic retry.
  persistSearchLinks?: (itemId: string, sources: SearchSource[]) => Promise<void> | void;
}

export interface RunItemFlowInput {
  target: unknown;
  // TODO(agent): Align RunItemFlowInput with stronger target typing once downstream callers are updated.
  instanceSpecs?: Record<string, unknown> | null;
  search?: string | null;
  reviewNotes?: string | null;
  missingSpecFields?: string[];
  unneededSpecFields?: string[];
  // Targeted rework: keys to regenerate. Non-empty ⇒ rework mode (partial update; skip cat/pricing).
  reworkSpecFields?: string[];
  reworkInstructions?: string | null;
  skipSearch?: boolean;
  storedSources?: SearchSource[];
  maxAttempts?: number;
  cancellationSignal?: AbortSignal | null;
  exampleItemBlock?: string | null;
  imageData?: string | null;
}

export interface SpecContext {
  missingRequired: string[];
  missingDesired: string[];
  ambiguousFields: Record<string, { itemValue: string; intakeValue: string }>;
  // Contract `description` per missing field key — lets the extraction prompt explain what a bare
  // key name like "Speicher" actually expects (e.g. "Storage size and type (e.g. 256 GB SSD)")
  // instead of leaving the model to guess format/content from the key alone.
  missingFieldDescriptions: Record<string, string>;
}

// Maps InstanceSpecs keys (written by intake quality answers) to spec contract field keys.
// Only reference-level fields included — instance data (serial, battery, quality) stays separate.
const INTAKE_TO_SPEC: Record<string, string> = {
  ram_gb: 'RAM',
  storage_gb: 'Speicher',
  drive_type: 'Speichertyp',
};

function formatIntakeSpecValue(key: string, rawValue: unknown): string | null {
  if (rawValue === null || rawValue === undefined) return null;
  const v = String(rawValue).trim();
  if (!v) return null;
  if (key === 'ram_gb') return `${v} GB`;
  if (key === 'storage_gb') return `${v} GB`;
  return v;
}

function buildSpecContext(
  target: Record<string, unknown>,
  subcategoryCode: number | null,
  instanceSpecs: Record<string, unknown> | null
): SpecContext {
  const result: SpecContext = {
    missingRequired: [],
    missingDesired: [],
    ambiguousFields: {},
    missingFieldDescriptions: {}
  };

  if (!subcategoryCode) return result;
  const specContract = getSpecContract(subcategoryCode);
  if (!specContract) return result;

  const rawLangtext = target.Langtext && typeof target.Langtext === 'object' && !Array.isArray(target.Langtext)
    ? (target.Langtext as Record<string, unknown>)
    : {};
  // Canonicalize spec keys up front so a value under a variant ("CPU") is seen by every stage under
  // its canonical contract key ("Prozessor") — and write it back onto the target so the stored output
  // carries a single canonical name, not a duplicate variant sibling.
  const langtext = canonicalizeSpecKeyRecord(rawLangtext);
  if (target.Langtext && typeof target.Langtext === 'object' && !Array.isArray(target.Langtext)) {
    target.Langtext = langtext;
  }

  for (const field of specContract.fields) {
    const itemRaw = langtext[field.key];
    const itemValue = itemRaw !== undefined && itemRaw !== null && String(itemRaw).trim() !== ''
      ? String(itemRaw).trim()
      : null;

    // Find the corresponding InstanceSpecs key for this contract field
    const intakeKey = Object.entries(INTAKE_TO_SPEC).find(([, v]) => v === field.key)?.[0] ?? null;
    const intakeValue = intakeKey && instanceSpecs ? formatIntakeSpecValue(intakeKey, instanceSpecs[intakeKey]) : null;

    if (itemValue !== null && intakeValue !== null && itemValue !== intakeValue) {
      // Both sources disagree — surface as ambiguous, don't inject either
      result.ambiguousFields[field.key] = { itemValue, intakeValue };
      continue;
    }

    const resolvedValue = itemValue ?? intakeValue;
    if (resolvedValue !== null) {
      // Inject the known value into Langtext so all pipeline stages see it
      (langtext as Record<string, unknown>)[field.key] = resolvedValue;
      if (target.Langtext && typeof target.Langtext === 'object') {
        (target.Langtext as Record<string, unknown>)[field.key] = resolvedValue;
      } else {
        target.Langtext = { ...langtext, [field.key]: resolvedValue };
      }
    } else {
      if (field.required) {
        result.missingRequired.push(field.key);
      } else {
        result.missingDesired.push(field.key);
      }
      if (field.description) {
        result.missingFieldDescriptions[field.key] = field.description;
      }
    }
  }

  return result;
}

// TODO(agent): Revisit target guard expectations once agentic callers provide strict typing.
const coerceTargetRecord = (
  target: unknown,
  logger: ItemFlowLogger,
  context: string
): Record<string, unknown> | null => {
  if (target && typeof target === 'object' && !Array.isArray(target)) {
    return target as Record<string, unknown>;
  }
  logger.warn?.({
    msg: 'item flow target is not an object',
    context,
    targetType: typeof target
  });
  return null;
};

function buildCallbackPayload({
  artikelNummer,
  itemData,
  searchQuery,
  status,
  needsReview,
  summary,
  reviewDecision,
  reviewNotes,
  reviewedBy,
  error,
  sources,
  actor,
  autoApprovable,
  specContractVersion
}: {
  artikelNummer: string;
  itemData: AgenticTarget;
  searchQuery: string;
  status?: string;
  needsReview?: boolean;
  summary?: string;
  reviewDecision?: string | null;
  reviewNotes?: string | null;
  reviewedBy?: string | null;
  error?: string | null;
  sources?: unknown;
  actor?: string | null;
  autoApprovable?: boolean;
  specContractVersion?: number | null;
}): AgenticResultPayload {
  const resolvedStatus = status ?? (needsReview ? 'needs_review' : 'completed');
  const resolvedNeedsReview = typeof needsReview === 'boolean' ? needsReview : resolvedStatus !== 'completed';
  const resolvedSummary = summary ?? (resolvedNeedsReview ? 'Manual review required' : 'Item flow completed successfully');
  const resolvedReviewDecision = reviewDecision ?? (resolvedNeedsReview ? 'changes_requested' : 'approved');
  const resolvedReviewNotes = reviewNotes ?? null;
  const resolvedReviewedBy = reviewedBy ?? (resolvedReviewNotes ? 'supervisor-agent' : null);
  const resolvedActor = actor ?? agentActorId;
  const resolvedError = resolvedNeedsReview ? (error ?? 'Manual review required') : error ?? null;

  const itemPayload: Record<string, unknown> & { Artikel_Nummer: string } = {
    ...(itemData ?? {}),
    Artikel_Nummer: artikelNummer,
    searchQuery
  };

  if (Array.isArray(sources) && sources.length > 0) {
    itemPayload.sources = sources;
  }

  return {
    artikelNummer,
    status: resolvedStatus,
    error: resolvedError,
    needsReview: resolvedNeedsReview,
    summary: resolvedSummary,
    reviewDecision: resolvedReviewDecision,
    reviewNotes: resolvedReviewNotes,
    reviewedBy: resolvedReviewedBy,
    actor: resolvedActor,
    item: itemPayload,
    autoApprovable: autoApprovable === true,
    specContractVersion: specContractVersion ?? null
  };
}

// Builds the final item for a targeted rework: keeps every original value and overlays the model's
// output ONLY for the selected keys (a selected key may be a top-level field like Artikelbeschreibung
// or a Langtext spec sub-key). Deterministic preservation — the model cannot alter unselected fields.
// Exported for unit testing of the preservation guarantee.
export function applyReworkPartialUpdate(
  target: Record<string, unknown>,
  modelData: Record<string, unknown> | null | undefined,
  reworkSpecFields: string[],
  itemId: string
): AgenticTarget {
  const result: Record<string, unknown> = { ...target, Artikel_Nummer: itemId };
  const model = (modelData && typeof modelData === 'object') ? (modelData as Record<string, unknown>) : {};
  const originalLangtext = target.Langtext && typeof target.Langtext === 'object' && !Array.isArray(target.Langtext)
    ? { ...(target.Langtext as Record<string, unknown>) }
    : {};
  const modelLangtext = model.Langtext && typeof model.Langtext === 'object' && !Array.isArray(model.Langtext)
    ? (model.Langtext as Record<string, unknown>)
    : {};
  const mergedLangtext: Record<string, unknown> = { ...originalLangtext };
  for (const key of reworkSpecFields) {
    // Top-level field selected (e.g. Artikelbeschreibung, Kurzbeschreibung) — Langtext itself is
    // handled via mergedLangtext below, so it is excluded here.
    if (key !== 'Langtext' && key !== 'Spezifikationen' && Object.prototype.hasOwnProperty.call(model, key)) {
      result[key] = model[key];
    }
    // Langtext spec key selected — overlay the model's value for that key only when present.
    if (Object.prototype.hasOwnProperty.call(modelLangtext, key)) {
      mergedLangtext[key] = modelLangtext[key];
    }
  }
  result.Langtext = mergedLangtext;
  return result as AgenticTarget;
}

export async function runItemFlow(input: RunItemFlowInput, deps: ItemFlowDependencies): Promise<AgenticResultPayload> {
  const logger = deps.logger ?? console;
  let resolvedItemId: string | null = null;
  const fallbackTarget = coerceTargetRecord(input.target, logger, 'runItemFlow');
  const fallbackItemId =
    fallbackTarget && typeof fallbackTarget.Artikel_Nummer === 'string'
      ? fallbackTarget.Artikel_Nummer.trim()
      : fallbackTarget && typeof fallbackTarget.artikelNummer === 'string'
        ? fallbackTarget.artikelNummer.trim()
        : null;
  const reviewerNotes = typeof input.reviewNotes === 'string' && input.reviewNotes.trim().length
    ? input.reviewNotes.trim()
    : null;
  const skipSearch = Boolean(input.skipSearch);

  // Targeted rework: when set, only these keys are accepted from the model output (all other fields
  // keep their originals) and the categorizer/pricing stages are skipped.
  const reworkSpecFields = Array.isArray(input.reworkSpecFields)
    ? input.reworkSpecFields.map((k) => String(k).trim()).filter((k) => k.length > 0)
    : [];
  const reworkMode = reworkSpecFields.length > 0;
  const reworkInstructions = typeof input.reworkInstructions === 'string' && input.reworkInstructions.trim()
    ? input.reworkInstructions.trim()
    : null;

  try {
    const context = prepareItemContext(input, logger);
    const { itemId, target, searchTerm, checkCancellation } = context;
    resolvedItemId = itemId;

    let transcriptWriter: AgentTranscriptWriter | null = null;
    try {
      transcriptWriter = await createTranscriptWriter(itemId, logger);
    } catch (err) {
      logger.warn?.({ err, msg: 'failed to initialize transcript writer', itemId });
    }

    try {
      const sanitizedReviewContext = sanitizeReviewContextNotes(reviewerNotes);
      const reviewDirectiveSummary = summarizeReviewDirectives(sanitizedReviewContext.value);
      await appendTranscriptSection(
        transcriptWriter,
        'review-context',
        {
          reviewNotes: sanitizedReviewContext.value,
          reviewNotesTruncated: sanitizedReviewContext.truncated,
          skipSearch,
          ...reviewDirectiveSummary
        },
        'Initial reviewer directives captured',
        logger,
        itemId
      );
    } catch (err) {
      logger.warn?.({ err, msg: 'failed to append review-context transcript section', itemId });
    }

    const rateLimiter = createRateLimiter({
      delayMs: deps.searchRateLimitDelayMs ?? DEFAULT_DELAY_MS,
      logger: deps.rateLimiterLogger ?? logger
    });

    const baseSearchInvoker = deps.searchInvoker;
    const searchInvoker: SearchInvoker = async (query: string, limit: number, metadata?: SearchInvokerMetadata) => {
      checkCancellation();
      const result = await rateLimiter(() => baseSearchInvoker(query, limit, metadata), {
        ...metadata,
        query,
        maxResults: limit
      });
      checkCancellation();
      return result as Awaited<ReturnType<SearchInvoker>>;
    };

    const shopwareAvailable = isShopwareConfigured();
    const { format, extract, supervisor, categorizer, pricing, jsonCorrection, searchPlanner, shopware } = await loadPrompts({
      itemId,
      logger,
      includeShopware: shopwareAvailable
    });

    checkCancellation();

    let shopwareResult: ShopwareSearchResult = { text: '', products: [] };
    if (shopwareAvailable) {
      try {
        checkCancellation();
        const searchFn = deps.shopwareSearch ?? searchShopwareRaw;
        shopwareResult = await searchFn(searchTerm, 5, logger);
        logger.info?.({ msg: 'shopware search attempted', productCount: shopwareResult.products.length, itemId });
        checkCancellation();
      } catch (err) {
        logger.error?.({ err, msg: 'shopware search invocation failed', itemId });
      }
    } else {
      logger.debug?.({ msg: 'shopware search skipped - configuration missing', itemId });
    }

    const shopwareShortcut = await resolveShopwareMatch({
      llm: deps.llm,
      logger,
      searchTerm,
      targetFormat: format,
      shopwarePrompt: shopware ?? null,
      shopwareResult,
      normalizedTarget: target,
      itemId
    });

    checkCancellation();

    if (shopwareShortcut) {
      const payload = buildCallbackPayload({
        artikelNummer: itemId,
        itemData: shopwareShortcut.finalData,
        searchQuery: searchTerm,
        status: 'completed',
        needsReview: false,
        summary: shopwareShortcut.summary,
        reviewDecision: 'approved',
        reviewNotes: shopwareShortcut.reviewNotes ?? reviewerNotes,
        reviewedBy: shopwareShortcut.reviewedBy,
        error: null,
        sources: shopwareShortcut.sources
      });

      await dispatchAgenticResult({
        artikelNummer: itemId,
        payload,
        logger,
        saveRequestPayload: deps.saveRequestPayload,
        applyAgenticResult: deps.applyAgenticResult,
        markNotificationSuccess: deps.markNotificationSuccess,
        markNotificationFailure: deps.markNotificationFailure,
        checkCancellation
      });

      return payload;
    }

    checkCancellation();

    let deviceLabelText: string | null = null;
    if (input.imageData) {
      try {
        const ocrResult = await runOcrExtraction({ llm: deps.visionLlm ?? deps.llm, imageData: input.imageData, logger });
        deviceLabelText = ocrResult?.text ?? null;
        if (deviceLabelText) {
          logger.info?.({ msg: 'OCR label extraction succeeded', itemId, chars: deviceLabelText.length });
        }
      } catch (err) {
        logger.warn?.({ err, msg: 'OCR label extraction failed; continuing without label context', itemId });
      }
    }

    await appendTranscriptSection(
      transcriptWriter,
      'ocr-extraction',
      {
        imageProvided: Boolean(input.imageData),
        extracted: Boolean(deviceLabelText),
        chars: deviceLabelText?.length ?? 0,
        text: deviceLabelText ?? null
      },
      deviceLabelText
        ? `Typenschild erkannt (${deviceLabelText.length} Zeichen)`
        : input.imageData
          ? 'OCR ohne Ergebnis (kein Text erkannt oder Fehler)'
          : 'Kein Bild bereitgestellt — OCR übersprungen',
      logger,
      itemId
    );

    const subcategoryCode = typeof target.Unterkategorien_A === 'number' ? target.Unterkategorien_A : null;
    const instanceSpecs = input.instanceSpecs && typeof input.instanceSpecs === 'object' ? input.instanceSpecs : null;
    // Spec contract version this run runs against — stamped on the run so an idle sweep can later detect
    // items enriched against an outdated contract (getSpecContract is cached, so this is cheap).
    const specContractVersion = subcategoryCode ? (getSpecContract(subcategoryCode)?.version ?? null) : null;
    const categoryGuidance = subcategoryCode ? (getSpecContract(subcategoryCode)?.guidance ?? []) : [];
    const specCtx = buildSpecContext(target, subcategoryCode, instanceSpecs);
    logger.debug?.({ msg: 'spec context built', itemId, subcategoryCode, missingRequired: specCtx.missingRequired, missingDesired: specCtx.missingDesired, ambiguousCount: Object.keys(specCtx.ambiguousFields).length });

    // Contract-aware missing fields replace the generic null-field scan; fall back to generic scan when no contract
    const contractMissingFields = [...specCtx.missingRequired, ...specCtx.missingDesired];
    const missingSchemaFields = contractMissingFields.length > 0 ? contractMissingFields : identifyMissingSchemaFields(target);

    // TODO(agent): Feed planner gating outcomes into telemetry once available.
    let plannerDecision: PlannerDecision | null = null;
    let plannerShouldSearch = true;

    if (searchPlanner && searchPlanner.trim()) {
      try {
        checkCancellation();
        plannerDecision = await evaluateSearchPlanner({
          llm: deps.llm,
          plannerPrompt: searchPlanner,
          itemId,
          searchTerm,
          reviewerNotes: reviewerNotes ?? '',
          target,
          missingFields: missingSchemaFields,
          ambiguousFields: Object.keys(specCtx.ambiguousFields),
          deviceLabelText,
          logger
        });
        checkCancellation();
        if (plannerDecision) {
          plannerShouldSearch = plannerDecision.shouldSearch;
        }
      } catch (err) {
        plannerDecision = null;
        plannerShouldSearch = true;
        logger.error?.({ err, msg: 'search planner evaluation failed', itemId });
      }
    }

    if (plannerDecision) {
      await appendTranscriptSection(
        transcriptWriter,
        'search-planner',
        {
          shouldSearch: plannerDecision.shouldSearch,
          planCount: plannerDecision.plans?.length ?? 0,
          plans: plannerDecision.plans?.map((p) => ({
            query: p.query,
            context: p.metadata?.context ?? null,
            missingFields: p.metadata?.missingFields ?? []
          })) ?? [],
          deviceLabelText: deviceLabelText ?? null
        },
        plannerDecision.shouldSearch
          ? `Suche geplant: ${plannerDecision.plans?.length ?? 0} Abfrage(n)`
          : 'Suche übersprungen laut Planer',
        logger,
        itemId
      );
    }

    const finalShouldSearch = !skipSearch && plannerShouldSearch;

    try {
      logger.info?.({
        msg: 'search gating resolved',
        itemId,
        reviewerSkip: skipSearch,
        plannerShouldSearch: plannerDecision?.shouldSearch ?? null,
        finalShouldSearch,
        missingFields: missingSchemaFields.slice(0, 10)
      });
    } catch (err) {
      logger.warn?.({ err, msg: 'failed to log search gating resolution', itemId });
    }

    const { searchContexts, aggregatedSources, recordSources, buildAggregatedSearchText } = await collectSearchContexts({
      searchTerm,
      searchInvoker,
      logger,
      itemId,
      target,
      reviewNotes: reviewerNotes,
      shouldSearch: finalShouldSearch,
      plannerDecision,
      missingSchemaFields,
      reviewerSkip: skipSearch,
      storedSources: input.storedSources,
      transcriptWriter
    });

    // Persist the freshly retrieved search results now (only when a live search actually ran), so a
    // downstream failure still leaves them stored for a search-free automatic retry. A skipSearch run
    // reused already-stored results, so there is nothing new to write.
    if (finalShouldSearch && Array.isArray(aggregatedSources) && aggregatedSources.length > 0) {
      try {
        await deps.persistSearchLinks?.(itemId, aggregatedSources);
      } catch (persistErr) {
        logger.warn?.({ err: persistErr, msg: 'failed to persist retrieved search links', itemId });
      }
    }

    checkCancellation();

    const extractionResult = await runExtractionAttempts({
      llm: deps.llm,
      logger,
      // TODO(agent): Revisit whether pricing summary reuse is needed once supervisor feedback loops expand.
      itemId,
      maxAttempts: input.maxAttempts && input.maxAttempts > 0 ? Math.min(input.maxAttempts, 3) : 3,
      searchContexts,
      aggregatedSources,
      recordSources,
      buildAggregatedSearchText,
      extractPrompt: extract,
      correctionPrompt: jsonCorrection,
      targetFormat: format,
      supervisorPrompt: supervisor,
      categorizerPrompt: categorizer,
      pricingPrompt: pricing,
      searchInvoker,
      target,
      reviewNotes: reviewerNotes,
      missingSpecFields: [
        ...(Array.isArray(input.missingSpecFields) ? input.missingSpecFields : []),
        ...specCtx.missingRequired
      ],
      ambiguousFields: specCtx.ambiguousFields,
      missingSpecFieldDescriptions: specCtx.missingFieldDescriptions,
      categoryGuidance,
      unneededSpecFields: Array.isArray(input.unneededSpecFields) ? input.unneededSpecFields : [],
      reworkSpecFields,
      reworkInstructions,
      skipSearch,
      exampleItemBlock: input.exampleItemBlock ?? null,
      correctionModel: deps.correctionLlm,
      transcriptWriter
    });

    checkCancellation();

    // In rework mode, produce a partial update deterministically: start from the ORIGINAL item and
    // accept the model's output ONLY for the selected keys. This preserves every other field
    // regardless of what the model returned — no reliance on the model honouring "locked" fields.
    const finalData: AgenticTarget = reworkMode
      ? applyReworkPartialUpdate(target, extractionResult.data, reworkSpecFields, itemId)
      : { ...target, ...extractionResult.data, Artikel_Nummer: itemId };
    // Canonicalize spec keys on the final output so any variant the model emitted (e.g. "CPU") is
    // folded onto the canonical contract key ("Prozessor") before persistence — one name, no dupes.
    if (finalData.Langtext && typeof finalData.Langtext === 'object' && !Array.isArray(finalData.Langtext)) {
      finalData.Langtext = canonicalizeSpecKeyRecord(
        finalData.Langtext as Record<string, unknown>
      ) as typeof finalData.Langtext;
    }

    // "Clearly good" signal for auto-approval: supervisor PASS + no missing-required + no ambiguous
    // fields + extraction confidence at/above the configured threshold. The final on/off gate lives
    // in the result handler (AUTO_APPROVE); here we only compute whether the data qualifies.
    const extractionConfidence =
      typeof (extractionResult.data as { confidence?: unknown })?.confidence === 'number'
        ? ((extractionResult.data as { confidence: number }).confidence)
        : null;
    const autoApprovable =
      extractionResult.success &&
      specCtx.missingRequired.length === 0 &&
      Object.keys(specCtx.ambiguousFields).length === 0 &&
      extractionConfidence !== null &&
      extractionConfidence >= autoApproveConfig.minConfidence;

    const payload = buildCallbackPayload({
      artikelNummer: itemId,
      itemData: finalData,
      searchQuery: searchTerm,
      status: extractionResult.success ? 'completed' : 'needs_review',
      needsReview: !extractionResult.success,
      summary: extractionResult.success
        ? 'Item flow extraction completed successfully'
        : 'Supervisor requested manual review',
      reviewDecision: extractionResult.success ? 'approved' : 'changes_requested',
      reviewNotes: extractionResult.supervisor || reviewerNotes,
      reviewedBy: 'supervisor-agent',
      error: extractionResult.success ? null : 'Supervisor flagged issues',
      sources: extractionResult.sources,
      autoApprovable,
      specContractVersion
    });

    await dispatchAgenticResult({
      artikelNummer: itemId,
      payload,
      logger,
      saveRequestPayload: deps.saveRequestPayload,
      applyAgenticResult: deps.applyAgenticResult,
      markNotificationSuccess: deps.markNotificationSuccess,
      markNotificationFailure: deps.markNotificationFailure,
      checkCancellation
    });

    return payload;
  } catch (err) {
    const log = deps.logger ?? console;
    const itemId = resolvedItemId ?? fallbackItemId;
    const failureMessage = err instanceof Error ? err.message : 'Unexpected failure';

    if (itemId && !(err instanceof FlowError && err.code === 'RUN_CANCELLED')) {
      // TODO(agentic-failure-telemetry): Consider enriching persisted error context with retry counters once available.
      const attemptAt = new Date().toISOString();
      try {
        await deps.persistLastError?.(itemId, failureMessage, attemptAt);
      } catch (persistErr) {
        log.warn?.({ err: persistErr, msg: 'failed to persist agentic flow error outcome', itemId });
      }
    }

    if (err instanceof FlowError) {
      // TODO(agent): Expand FlowError context logging across orchestrators for consistent observability.
      const preview = (value: unknown) => (typeof value === 'string' ? value.slice(0, 1000) : value);
      const flowLog: Record<string, unknown> = {
        err,
        code: err.code,
        itemId: resolvedItemId ?? fallbackItemId ?? null
      };

      if (err.code === 'INVALID_JSON' && err.context) {
        if (err.context.invalidJsonPayload !== undefined) {
          flowLog.invalidJsonPayload = preview(err.context.invalidJsonPayload);
        }
        if (err.context.invalidThinkContent !== undefined) {
          flowLog.invalidThinkContent = preview(err.context.invalidThinkContent);
        }
      }

      if (err.code === 'RUN_CANCELLED') {
        log.warn?.({ ...flowLog, msg: 'run aborted due to cancellation' });
      } else {
        log.error?.(flowLog);
      }
      throw err;
    }
    log.error?.({ err, itemId: resolvedItemId ?? fallbackItemId ?? null });
    throw new FlowError('INTERNAL_ERROR', 'Unexpected failure', 500, { cause: err });
  }
}
