import { z } from 'zod';

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

const localizedNumber = z.preprocess((value) => normalizeLocalizedNumberInput(value), z.coerce.number().nullable());

const AgentSourceSchema = z
  .object({
    title: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    snippet: z.string().min(1).optional()
  })
  .passthrough();

export const TargetSchema = z
  .object({
    itemUUid: z.string(),
    Artikelbeschreibung: z.string(),
    Marktpreis: localizedNumber,
    Kurzbeschreibung: z.string(),
    Langtext: z.string(),
    Hersteller: z.string(),
    Länge_mm: localizedNumber,
    Breite_mm: localizedNumber,
    Höhe_mm: localizedNumber,
    Gewicht_kg: localizedNumber
  })
  .strict();

export const AgentOutputSchema = TargetSchema.extend({
  itemUUid: z.string().optional(),
  __searchQueries: z.array(z.string().min(1).max(512)).max(3).optional(),
  sources: z.array(AgentSourceSchema).optional(),
  confidence: z.number().min(0).max(1).optional(),
  confidenceNote: z.string().min(1).max(1024).optional()
}).passthrough();

export const ShopwareDecisionSchema = z
  .object({
    isMatch: z.boolean(),
    confidence: z.number().min(0).max(1),
    matchedProductId: z.string().min(1).optional(),
    target: TargetSchema.partial({ itemUUid: true }).optional()
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
