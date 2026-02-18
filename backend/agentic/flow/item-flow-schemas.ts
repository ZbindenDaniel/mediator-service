// TODO(agent): Evaluate structured Langtext schema enforcement after helper telemetry stabilizes.
import { z } from 'zod';
import type { LangtextPayload } from '../../../models';
import { parseLangtext } from '../../lib/langtext';
import { searchLimits } from '../config';
import { collectSchemaKeys } from './schema-contract';


function getNormalizationValueType(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

export interface SpezifikationenNormalizationIssue {
  code: 'SPEZIFIKATIONEN_NORMALIZATION_FAILED';
  message: string;
  path: ['Langtext'];
  fromType: string;
  toType: 'string | object';
  keysCount: number;
}

export function normalizeSpezifikationenBoundary(
  payload: unknown,
  context: {
    logger?: Partial<Pick<Console, 'info' | 'warn'>>;
    itemId: string;
    attempt: number;
    stage: string;
  }
): { normalizedPayload: unknown; issue: SpezifikationenNormalizationIssue | null } {
  try {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { normalizedPayload: payload, issue: null };
    }

    const record = payload as Record<string, unknown>;
    const hasLangtext = record.Langtext !== null && record.Langtext !== undefined && record.Langtext !== '';
    if (hasLangtext || !Object.prototype.hasOwnProperty.call(record, 'Spezifikationen')) {
      return { normalizedPayload: payload, issue: null };
    }

    const spezifikationen = record.Spezifikationen;
    const fromType = getNormalizationValueType(spezifikationen);
    const keysCount = spezifikationen && typeof spezifikationen === 'object' && !Array.isArray(spezifikationen)
      ? Object.keys(spezifikationen as Record<string, unknown>).length
      : 0;

    if (typeof spezifikationen === 'string' || (spezifikationen && typeof spezifikationen === 'object' && !Array.isArray(spezifikationen))) {
      const remapped = { ...record, Langtext: spezifikationen };
      delete (remapped as Record<string, unknown>).Spezifikationen;
      context.logger?.info?.({
        msg: 'normalized Spezifikationen boundary value',
        itemId: context.itemId,
        attempt: context.attempt,
        stage: context.stage,
        fromType,
        toType: 'string | object',
        keysCount
      });
      return { normalizedPayload: remapped, issue: null };
    }

    const issue: SpezifikationenNormalizationIssue = {
      code: 'SPEZIFIKATIONEN_NORMALIZATION_FAILED',
      message: `Spezifikationen must be a string or object to normalize into Langtext (received ${fromType})`,
      path: ['Langtext'],
      fromType,
      toType: 'string | object',
      keysCount
    };

    context.logger?.warn?.({
      msg: 'failed to normalize Spezifikationen boundary value',
      itemId: context.itemId,
      attempt: context.attempt,
      stage: context.stage,
      fromType,
      toType: 'string | object',
      keysCount,
      issue
    });

    return { normalizedPayload: payload, issue };
  } catch (err) {
    const issue: SpezifikationenNormalizationIssue = {
      code: 'SPEZIFIKATIONEN_NORMALIZATION_FAILED',
      message: 'Unexpected error while normalizing Spezifikationen into Langtext',
      path: ['Langtext'],
      fromType: 'unknown',
      toType: 'string | object',
      keysCount: 0
    };
    context.logger?.warn?.({
      err,
      msg: 'failed to normalize Spezifikationen boundary value',
      itemId: context.itemId,
      attempt: context.attempt,
      stage: context.stage,
      fromType: issue.fromType,
      toType: issue.toType,
      keysCount: issue.keysCount,
      issue
    });
    return { normalizedPayload: payload, issue };
  }
}

function normalizeLocalizedNumberInput(value: unknown): number | null | unknown {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.replace(/\u00A0/g, ' ').trim();
  if (!trimmed) {
    return null;
  }

  const collapsed = trimmed.replace(/\s+/g, '');
  const cleaned = collapsed.replace(/[^0-9,.-]/g, '');
  if (!cleaned) {
    return null;
  }

  const isNegative = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/-/g, '');
  if (!unsigned) {
    return null;
  }

  const lastComma = unsigned.lastIndexOf(',');
  const lastDot = unsigned.lastIndexOf('.');
  let normalized = unsigned;

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      const commaStripped = unsigned.replace(/\./g, '');
      const commaIndex = commaStripped.lastIndexOf(',');
      normalized = `${commaStripped.slice(0, commaIndex).replace(/,/g, '')}.${commaStripped.slice(commaIndex + 1)}`;
    } else {
      normalized = unsigned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    normalized = unsigned.replace(/\./g, '').replace(/,/g, '.');
  } else {
    normalized = unsigned.replace(/,/g, '');
  }

  if (!normalized) {
    return null;
  }

  const normalizedValue = isNegative ? `-${normalized}` : normalized;
  return normalizedValue;
}

// TODO(agent): Evaluate persisting reviewer instruction normalization after telemetry review cycles ship.
const localizedNumber = z.preprocess((value) => normalizeLocalizedNumberInput(value), z.coerce.number().nullable());

const optionalTrimmedNote = z
  .preprocess((value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    }
    return value ?? undefined;
  }, z.string().min(1))
  .optional();

// LangtextPayload values remain JSON-first: the UI renders slots from the curated metaDataKeys list, so we accept
// either that structured object or the legacy string fallback and rely on parseLangtext to normalize. Keep this in
// sync with models/item.ts and the frontend editor in frontend/src/components/forms/itemFormShared.tsx when updating
// prompt guidance.
const LangtextFieldSchema = z
  .any()
  .transform((value, ctx) => {
    const parsed = parseLangtext(value, {
      logger: console,
      context: 'agentic:target-schema'
    });
    if (parsed === null) {
      if (value === null || value === undefined || value === '') {
        return '' as string | LangtextPayload;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Langtext payload could not be parsed'
      });
      return '' as string | LangtextPayload;
    }
    return parsed as string | LangtextPayload;
  }) as z.ZodType<string | LangtextPayload>;

const AgentSourceSchema = z
  .object({
    title: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    snippet: z.string().min(1).optional()
  })
  .passthrough();

export const TargetSchema = z
  .object({
    Artikel_Nummer: z.string().min(1, 'Artikelnummer is required'),
    Artikelbeschreibung: z.string(),
    Verkaufspreis: localizedNumber,
    Kurzbeschreibung: z.string(),
    Langtext: LangtextFieldSchema,
    Hersteller: z.string(),
    Länge_mm: localizedNumber,
    Breite_mm: localizedNumber,
    Höhe_mm: localizedNumber,
    Gewicht_kg: localizedNumber,
    // TODO(agent): Review category field normalization once categorizer accuracy telemetry is available.
    Hauptkategorien_A: localizedNumber.optional(),
    Unterkategorien_A: localizedNumber.optional(),
    Hauptkategorien_B: localizedNumber.optional(),
    Unterkategorien_B: localizedNumber.optional(),
    reviewNotes: optionalTrimmedNote
  })
  .strict();

export const AgentOutputSchema = TargetSchema.extend({
  Artikel_Nummer: z.string().min(1, 'Artikelnummer is required').optional(),
  __searchQueries: z.array(z.string().min(1).max(512)).max(
    Math.max(1, Math.floor(searchLimits.maxAgentQueriesPerRequest))
  ).optional(),
  sources: z.array(AgentSourceSchema).optional(),
  confidence: z.number().min(0).max(1).optional(),
  confidenceNote: z.string().min(1).max(1024).optional()
}).passthrough();


export function logSchemaKeyTelemetry(
  logger: Partial<Pick<Console, 'warn' | 'info'>> | undefined,
  {
    stage,
    itemId,
    payload
  }: { stage: string; itemId: string; payload: unknown }
): void {
  try {
    logger?.info?.({ msg: 'schema key telemetry', stage, itemId, payloadKeys: collectSchemaKeys(payload) });
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to log schema key telemetry', stage, itemId });
  }
}

export const ShopwareDecisionSchema = z
  .object({
    isMatch: z.boolean(),
    confidence: z.number().min(0).max(1),
    matchedProductId: z.string().min(1).optional(),
    target: TargetSchema.partial({ Artikel_Nummer: true }).optional()
  })
  .superRefine((data, ctx) => {
    if (data.isMatch) {
      if (!data.target) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'target is required when isMatch is true', path: ['target'] });
      }
      if (!data.matchedProductId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'matchedProductId is required when isMatch is true',
          path: ['matchedProductId']
        });
      }
    }
  });

export type AgenticTarget = z.infer<typeof TargetSchema>;
export type AgenticOutput = z.infer<typeof AgentOutputSchema>;
