import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { FlowError } from './errors';
import { stringifyLangChainContent } from '../utils/langchain';
import { parseJsonWithSanitizer } from '../utils/json';
import type { ChatModel, ExtractionLogger } from './item-flow-extraction';
import { logSchemaKeyTelemetry, type AgenticOutput } from './item-flow-schemas';
import { appendTranscriptSection, type AgentTranscriptWriter, type TranscriptSectionPayload } from './transcript';

// TODO(agent): Monitor categorizer drift once evaluation datasets are curated.
const CATEGORY_REFERENCE_PATH = path.resolve(__dirname, '../prompts/docs/data_struct.md');

// TODO(agent): Replace ad-hoc categorizer schema once upstream agent contract is stabilized.
const CategorizerResponseSchema = z
  .object({
    Hauptkategorien_A: z.union([z.number(), z.string()]).nullish(),
    Unterkategorien_A: z.union([z.number(), z.string()]).nullish(),
    Hauptkategorien_B: z.union([z.number(), z.string()]).nullish(),
    Unterkategorien_B: z.union([z.number(), z.string()]).nullish(),
    Hauptkategorien: z.union([z.number(), z.string()]).nullish(),
    Unterkategorien: z.union([z.number(), z.string()]).nullish()
  })
  .passthrough();

type CategorizerResponse = z.infer<typeof CategorizerResponseSchema>;

const CategorizerPayloadSchema = z.union([
  CategorizerResponseSchema,
  z
    .object({
      item: CategorizerResponseSchema
    })
    .passthrough()
]);

let cachedReference: string | null = null;

const CATEGORY_HEADING_RE = /^##\s*(\d+)\s*[–—-]\s*(.+)$/;
const SUBCATEGORY_BULLET_RE = /^-\s*\*\*(\d+)\*\*\s*[–—-]\s*(.+)$/;

// docs/data_struct.md doubles as human-facing documentation (linked from docs/OVERVIEW.md) and as
// the categorizer's taxonomy reference, so we don't trim the source file. Instead this strips it
// down to just what the categorization task needs: the numbering-convention sentence plus every
// code/name pair, dropping the CSV-import normalization section (irrelevant to picking a category
// from an item description) and the markdown bullet/heading formatting overhead. This is the
// single largest fixed cost in the categorizer prompt — cutting it materially reduces the risk of
// overflowing the model's context window (which manifests as an empty/truncated completion).
// Every code present in the source must survive; falls back to the raw text if parsing goes wrong
// rather than risk silently dropping a valid category.
export function compactTaxonomyReference(raw: string): string {
  try {
    const introLines: string[] = [];
    const categoryLines: string[] = [];
    let mode: 'intro' | 'skip-section' | 'categories' = 'intro';
    let currentHeading: { code: string; name: string } | null = null;
    let currentSubs: string[] = [];

    const flushCurrent = () => {
      if (!currentHeading) {
        return;
      }
      // Semicolon-joined, not comma-joined: several subcategory names contain commas of their own
      // (e.g. "5G-, LTE-, UMTS-, GPRS-, GMS-Modems"), which would make a comma-separated list
      // ambiguous about where one entry ends and the next begins.
      const subsText = currentSubs.length > 0 ? `: ${currentSubs.join('; ')}` : ' (keine Unterkategorien)';
      categoryLines.push(`${currentHeading.code} ${currentHeading.name}${subsText}`);
      currentHeading = null;
      currentSubs = [];
    };

    for (const rawLine of raw.split('\n')) {
      const trimmed = rawLine.trim();
      const headingMatch = trimmed.match(CATEGORY_HEADING_RE);

      if (headingMatch) {
        flushCurrent();
        currentHeading = { code: headingMatch[1], name: headingMatch[2].trim() };
        mode = 'categories';
        continue;
      }

      if (mode === 'intro') {
        if (trimmed.startsWith('## ')) {
          // A non-numbered heading before the first category (e.g. the CSV-import notes) — drop it and its body.
          mode = 'skip-section';
          continue;
        }
        if (trimmed && !trimmed.startsWith('#')) {
          introLines.push(trimmed);
        }
        continue;
      }

      if (mode === 'skip-section') {
        continue;
      }

      if (mode === 'categories' && currentHeading) {
        const subMatch = trimmed.match(SUBCATEGORY_BULLET_RE);
        if (subMatch) {
          currentSubs.push(`${subMatch[1]} ${subMatch[2].trim()}`);
        }
      }
    }
    flushCurrent();

    if (categoryLines.length === 0) {
      // Parsing found no categories at all — trust the raw reference over a possibly-empty result.
      return raw;
    }

    return [...introLines, '', ...categoryLines].join('\n').trim();
  } catch {
    return raw;
  }
}

async function loadCategoryReference(logger: ExtractionLogger | undefined, itemId: string): Promise<string> {
  if (cachedReference) {
    return cachedReference;
  }

  try {
    const rawReference = await fs.readFile(CATEGORY_REFERENCE_PATH, 'utf8');
    const reference = compactTaxonomyReference(rawReference);
    cachedReference = reference;
    logger?.debug?.({
      msg: 'category reference loaded',
      itemId,
      referencePath: CATEGORY_REFERENCE_PATH,
      rawLength: rawReference.length,
      compactedLength: reference.length
    });
    return reference;
  } catch (err) {
    logger?.error?.({ err, msg: 'failed to load category reference', itemId, referencePath: CATEGORY_REFERENCE_PATH });
    throw new FlowError('CATEGORIZER_REFERENCE_UNAVAILABLE', 'Failed to load category taxonomy reference', 500, {
      cause: err
    });
  }
}

function isFieldLocked(candidate: AgenticOutput, field: string): boolean {
  const locked = (candidate as AgenticOutput & { __locked?: unknown }).__locked;
  if (!Array.isArray(locked)) {
    return false;
  }
  return locked.includes(field);
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
    logger?.debug?.({ msg: 'mapped Langtext to Spezifikationen for categorizer payload', itemId });
    return remapped;
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to map Langtext to Spezifikationen for categorizer payload', itemId });
    return payload as unknown as Record<string, unknown>;
  }
}

// Model sometimes returns markdown bullets instead of JSON (e.g. "* **Kategorie:** 160 (...)").
// Parse the known label patterns into the expected schema so the stage doesn't hard-fail.
function repairCategorizerMarkdown(raw: string): string | null {
  if (raw.includes('{')) return null; // looks like JSON already, skip
  const result: Record<string, number | null> = {
    Hauptkategorien_A: null,
    Unterkategorien_A: null,
    Hauptkategorien_B: null,
    Unterkategorien_B: null
  };
  let matched = false;
  for (const line of raw.split('\n')) {
    const lower = line.toLowerCase();
    const numMatch = line.match(/(\d{2,5})/);
    if (!numMatch) continue;
    const code = parseInt(numMatch[1], 10);
    if (lower.includes('unterkategor') || lower.includes('subcategor')) {
      result[result.Unterkategorien_A == null ? 'Unterkategorien_A' : 'Unterkategorien_B'] = code;
      matched = true;
    } else if (lower.includes('hauptkategor') || lower.includes('kategor') || lower.includes('categor')) {
      result[result.Hauptkategorien_A == null ? 'Hauptkategorien_A' : 'Hauptkategorien_B'] = code;
      matched = true;
    }
  }
  return matched ? JSON.stringify(result) : null;
}

const CANONICAL_CATEGORY_KEYS = [
  'Hauptkategorien_A',
  'Unterkategorien_A',
  'Hauptkategorien_B',
  'Unterkategorien_B',
  'Hauptkategorien',
  'Unterkategorien'
] as const;

// Whether the parsed payload (or its nested "item" wrapper) contains at least one field the
// stage actually knows how to read. Passthrough zod schemas validate any object shape, so this
// check is the real gate against silently accepting a well-formed-but-wrong-shape response.
function hasCanonicalCategoryShape(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (CANONICAL_CATEGORY_KEYS.some((key) => key in record)) {
    return true;
  }
  if (record.item && typeof record.item === 'object' && !Array.isArray(record.item)) {
    return CANONICAL_CATEGORY_KEYS.some((key) => key in (record.item as Record<string, unknown>));
  }
  return false;
}

// Observed failure mode: model wraps codes as { assigned_categories: { primary, secondary } }
// (or similarly named variants) instead of the four flat fields. Remap it onto the canonical
// shape so a correctly-categorized response isn't discarded just because of key naming.
// Taxonomy convention: subcategory codes are the main code with a running suffix
// (e.g. 1603 belongs to main category 160), so the main code is derivable as floor(sub / 10).
function normalizeCategorizerAltShape(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const wrapper = record.assigned_categories ?? record.assignedCategories ?? record.categories;
  if (!wrapper || typeof wrapper !== 'object' || Array.isArray(wrapper)) {
    return null;
  }
  const wrapperRecord = wrapper as Record<string, unknown>;
  const primary = extractNumericCode(
    wrapperRecord.primary ?? wrapperRecord.main ?? wrapperRecord.Hauptkategorie ?? wrapperRecord.hauptkategorie
  );
  const secondary = extractNumericCode(
    wrapperRecord.secondary ?? wrapperRecord.sub ?? wrapperRecord.Unterkategorie ?? wrapperRecord.unterkategorie
  );
  if (primary == null && secondary == null) {
    return null;
  }
  const deriveMain = (code: number | null | undefined): number | null =>
    typeof code === 'number' && code >= 1000 ? Math.floor(code / 10) : null;
  return {
    Hauptkategorien_A: deriveMain(primary),
    Unterkategorien_A: primary ?? null,
    Hauptkategorien_B: deriveMain(secondary),
    Unterkategorien_B: secondary ?? null
  };
}

function extractNumericCode(value: unknown): number | null | undefined {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const match = trimmed.match(/(-?\d{2,5})/);
    if (!match) {
      return undefined;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export interface RunCategorizerStageOptions {
  llm: ChatModel;
  logger?: ExtractionLogger;
  itemId: string;
  categorizerPrompt: string;
  candidate: AgenticOutput;
  reviewNotes?: string | null;
  skipSearch?: boolean;
  transcriptWriter?: AgentTranscriptWriter | null;
}

export async function runCategorizerStage({
  llm,
  logger,
  itemId,
  categorizerPrompt,
  candidate,
  reviewNotes,
  skipSearch,
  transcriptWriter
}: RunCategorizerStageOptions): Promise<Partial<AgenticOutput>> {
  logger?.debug?.({ msg: 'invoking categorizer agent', itemId });

  const taxonomyReference = await loadCategoryReference(logger, itemId);
  const sanitizedReviewerNotes = typeof reviewNotes === 'string' ? reviewNotes.trim() : '';
  const searchSkipped = Boolean(skipSearch);

  const llmCandidate = mapLangtextToSpezifikationenForLlm(candidate, { itemId, logger });
  let payloadForCategorizer: Record<string, unknown> = { item: llmCandidate };
  try {
    const instructions: Record<string, unknown> = {};
    if (sanitizedReviewerNotes) {
      instructions.reviewerNotes = sanitizedReviewerNotes;
    }
    if (searchSkipped) {
      instructions.searchSkipped = true;
    }
    if (Object.keys(instructions).length > 0) {
      payloadForCategorizer = { ...payloadForCategorizer, instructions };
      logger?.info?.({
        msg: 'categorizer received reviewer guidance',
        itemId,
        hasReviewerNotes: Boolean(sanitizedReviewerNotes),
        searchSkipped
      });
    }
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to append reviewer instructions to categorizer payload', itemId });
    payloadForCategorizer = { item: llmCandidate };
  }

  let userPayload = '';
  try {
    userPayload = JSON.stringify(payloadForCategorizer, null, 2);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to serialize categorizer payload', itemId });
    try {
      userPayload = JSON.stringify({ item: llmCandidate }, null, 2);
    } catch (fallbackErr) {
      logger?.error?.({ err: fallbackErr, msg: 'categorizer payload serialization fallback failed', itemId });
      throw new FlowError('CATEGORIZER_PAYLOAD_SERIALIZATION_FAILED', 'Failed to serialize categorizer payload', 500, {
        cause: fallbackErr
      });
    }
  }
  let categorizeRes;
  let categorizerMessages: Array<{ role: string; content: string }> = [];
  try {
    categorizerMessages = [
      {
        role: 'system',
        content: `${categorizerPrompt}\n\nKategorie-Referenz:\n${taxonomyReference}`
      },
      { role: 'user', content: userPayload }
    ];
    categorizeRes = await llm.invoke(categorizerMessages);
  } catch (err) {
    logger?.error?.({ err, msg: 'categorizer llm invocation failed', itemId });
    throw new FlowError('CATEGORIZER_INVOKE_FAILED', 'Categorizer stage failed to invoke model', 502, { cause: err });
  }

  const raw = stringifyLangChainContent(categorizeRes?.content, {
    context: 'itemFlow.categorizer',
    logger
  });

  const transcriptPayload: TranscriptSectionPayload = {
    request: payloadForCategorizer,
    messages: categorizerMessages,
    response: raw
  };

  await appendTranscriptSection(transcriptWriter, 'categorizer', transcriptPayload, raw, logger, itemId);

  const repairedRaw = repairCategorizerMarkdown(raw);
  if (repairedRaw) {
    logger?.warn?.({ msg: 'categorizer returned markdown; repaired to JSON', itemId, rawSnippet: raw.slice(0, 200) });
  }
  let parsed: unknown;
  try {
    parsed = parseJsonWithSanitizer(repairedRaw ?? raw, {
      loggerInstance: logger,
      context: { itemId, stage: 'categorizer-agent' }
    });
  } catch (err) {
    logger?.error?.({ err, msg: 'categorizer returned invalid JSON', itemId, rawSnippet: raw.slice(0, 500) });
    throw new FlowError('CATEGORIZER_INVALID_JSON', 'Categorizer agent returned invalid JSON', 500, { cause: err });
  }

  logSchemaKeyTelemetry(logger, { stage: 'categorizer', itemId, payload: parsed });

  if (!hasCanonicalCategoryShape(parsed)) {
    const altShape = normalizeCategorizerAltShape(parsed);
    if (altShape) {
      logger?.warn?.({
        msg: 'categorizer used non-canonical response shape; remapped to canonical fields',
        itemId,
        responseKeys: Object.keys(parsed as Record<string, unknown>),
        remapped: altShape
      });
      parsed = altShape;
    }
  }

  const validated = CategorizerPayloadSchema.safeParse(parsed);
  if (!validated.success) {
    logger?.error?.({
      msg: 'categorizer schema validation failed',
      itemId,
      issues: validated.error.issues
    });
    throw new FlowError('CATEGORIZER_SCHEMA_FAILED', 'Categorizer agent returned malformed payload', 422, {
      cause: validated.error
    });
  }

  // The schema is deliberately permissive (passthrough + nullish fields) so it validates any
  // object shape. Without this check, a well-formed-but-wrong-shape response (e.g. a renamed
  // wrapper key the alt-shape remap above doesn't recognize) would silently resolve to an empty
  // patch and the run would complete with null categories instead of surfacing a failure.
  if (!hasCanonicalCategoryShape(validated.data)) {
    logger?.error?.({
      msg: 'categorizer response had no recognizable category fields',
      itemId,
      responseKeys: Object.keys(validated.data as Record<string, unknown>)
    });
    throw new FlowError(
      'CATEGORIZER_UNRECOGNIZED_SHAPE',
      'Categorizer agent returned a response with no recognizable category fields',
      422,
      { context: { responseKeys: Object.keys(validated.data as Record<string, unknown>) } }
    );
  }

  const result: Partial<AgenticOutput> = {};
  const nestedPayload = 'item' in validated.data ? validated.data.item : undefined;
  const response: CategorizerResponse = {
    ...(validated.data as CategorizerResponse),
    ...(nestedPayload ? (nestedPayload as CategorizerResponse) : {})
  };

  if (nestedPayload) {
    logger?.debug?.({ msg: 'categorizer response contains nested item payload', itemId });
  }

  logger?.debug?.({ msg: 'categorizer response parsed', itemId, response });
  const fieldMap: Array<{
    field: keyof AgenticOutput;
    aliases: (keyof CategorizerResponse)[];
  }> = [
    { field: 'Hauptkategorien_A', aliases: ['Hauptkategorien_A', 'Hauptkategorien'] },
    { field: 'Unterkategorien_A', aliases: ['Unterkategorien_A', 'Unterkategorien'] },
    { field: 'Hauptkategorien_B', aliases: ['Hauptkategorien_B'] },
    { field: 'Unterkategorien_B', aliases: ['Unterkategorien_B'] }
  ];

  for (const { field, aliases } of fieldMap) {
    if (isFieldLocked(candidate, field.toString())) {
      logger?.debug?.({ msg: 'skipping locked category field', itemId, field });
      continue;
    }

    const existingValue = candidate[field];
    let nextValue: number | null | undefined;
    for (const alias of aliases) {
      const candidateValue = response[alias];
      if (candidateValue !== undefined) {
        nextValue = extractNumericCode(candidateValue);
        if (nextValue !== undefined) {
          break;
        }
      }
    }

    if (nextValue === undefined) {
      if (aliases.some((alias) => response[alias] !== undefined)) {
        logger?.warn?.({
          msg: 'categorizer produced unresolvable category code',
          itemId,
          field,
          rawValue: aliases.map((alias) => response[alias]).find((value) => value !== undefined)
        });
      }
      continue;
    }

    if (nextValue === null && typeof existingValue === 'number') {
      logger?.debug?.({
        msg: 'retaining existing category because categorizer returned null',
        itemId,
        field,
        existingValue
      });
      continue;
    }

    if (nextValue !== null && nextValue <= 0) {
      logger?.warn?.({ msg: 'categorizer returned non-positive category code', itemId, field, nextValue });
      continue;
    }

    result[field] = nextValue === null ? null : nextValue;
  }

  const assignedCategories = {
    Hauptkategorien_A: result.Hauptkategorien_A ?? candidate.Hauptkategorien_A ?? null,
    Unterkategorien_A: result.Unterkategorien_A ?? candidate.Unterkategorien_A ?? null,
    Hauptkategorien_B: result.Hauptkategorien_B ?? candidate.Hauptkategorien_B ?? null,
    Unterkategorien_B: result.Unterkategorien_B ?? candidate.Unterkategorien_B ?? null
  };

  logger?.info?.({
    msg: 'categorizer completed',
    itemId,
    assignedCategories
  });

  return result;
}
