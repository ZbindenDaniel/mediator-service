import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { FlowError } from './errors';
import { stringifyLangChainContent } from '../utils/langchain';
import { parseJsonWithSanitizer } from '../utils/json';
import type { ChatModel, ExtractionLogger } from './item-flow-extraction';
import type { AgenticOutput } from './item-flow-schemas';

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

async function loadCategoryReference(logger: ExtractionLogger | undefined, itemId: string): Promise<string> {
  if (cachedReference) {
    return cachedReference;
  }

  try {
    const reference = await fs.readFile(CATEGORY_REFERENCE_PATH, 'utf8');
    cachedReference = reference;
    logger?.debug?.({ msg: 'category reference loaded', itemId, referencePath: CATEGORY_REFERENCE_PATH });
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
}

export async function runCategorizerStage({
  llm,
  logger,
  itemId,
  categorizerPrompt,
  candidate,
  reviewNotes,
  skipSearch
}: RunCategorizerStageOptions): Promise<Partial<AgenticOutput>> {
  logger?.debug?.({ msg: 'invoking categorizer agent', itemId });

  const taxonomyReference = await loadCategoryReference(logger, itemId);
  const sanitizedReviewerNotes = typeof reviewNotes === 'string' ? reviewNotes.trim() : '';
  const searchSkipped = Boolean(skipSearch);

  let payloadForCategorizer: Record<string, unknown> = { item: candidate };
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
    payloadForCategorizer = { item: candidate };
  }

  let userPayload = '';
  try {
    userPayload = JSON.stringify(payloadForCategorizer, null, 2);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to serialize categorizer payload', itemId });
    try {
      userPayload = JSON.stringify({ item: candidate }, null, 2);
    } catch (fallbackErr) {
      logger?.error?.({ err: fallbackErr, msg: 'categorizer payload serialization fallback failed', itemId });
      throw new FlowError('CATEGORIZER_PAYLOAD_SERIALIZATION_FAILED', 'Failed to serialize categorizer payload', 500, {
        cause: fallbackErr
      });
    }
  }
  let categorizeRes;
  try {
    categorizeRes = await llm.invoke([
      {
        role: 'system',
        content: `${categorizerPrompt}\n\nKategorie-Referenz:\n${taxonomyReference}`
      },
      { role: 'user', content: userPayload }
    ]);
  } catch (err) {
    logger?.error?.({ err, msg: 'categorizer llm invocation failed', itemId });
    throw new FlowError('CATEGORIZER_INVOKE_FAILED', 'Categorizer stage failed to invoke model', 502, { cause: err });
  }

  const raw = stringifyLangChainContent(categorizeRes?.content, {
    context: 'itemFlow.categorizer',
    logger
  });

  let parsed: unknown;
  try {
    parsed = parseJsonWithSanitizer(raw, {
      loggerInstance: logger,
      context: { itemId, stage: 'categorizer-agent' }
    });
  } catch (err) {
    logger?.error?.({ err, msg: 'categorizer returned invalid JSON', itemId, rawSnippet: raw.slice(0, 500) });
    throw new FlowError('CATEGORIZER_INVALID_JSON', 'Categorizer agent returned invalid JSON', 500, { cause: err });
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

  logger?.info?.({
    msg: 'categorizer completed',
    itemId,
    assignedCategories: {
      Hauptkategorien_A: result.Hauptkategorien_A ?? candidate.Hauptkategorien_A ?? null,
      Unterkategorien_A: result.Unterkategorien_A ?? candidate.Unterkategorien_A ?? null,
      Hauptkategorien_B: result.Hauptkategorien_B ?? candidate.Hauptkategorien_B ?? null,
      Unterkategorien_B: result.Unterkategorien_B ?? candidate.Unterkategorien_B ?? null
    }
  });

  return result;
}
