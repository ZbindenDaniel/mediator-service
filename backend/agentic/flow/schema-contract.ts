import { z } from 'zod';

// TODO(agentic-schema): Keep this canonical item schema aligned with prompt docs and item-flow validators.
export const SpezifikationenValueSchema = z.union([z.string(), z.array(z.string())]);
export const SpezifikationenSchema = z.record(z.string(), SpezifikationenValueSchema);

export const CanonicalSpezifikationenItemSchema = z.object({
  Artikel_Nummer: z.string().min(1, 'Artikelnummer is required'),
  Artikelbeschreibung: z.string(),
  Verkaufspreis: z.number().nullable(),
  Kurzbeschreibung: z.string(),
  Spezifikationen: SpezifikationenSchema,
  Hersteller: z.string(),
  Länge_mm: z.number().nullable(),
  Breite_mm: z.number().nullable(),
  Höhe_mm: z.number().nullable(),
  Gewicht_kg: z.number().nullable(),
  Hauptkategorien_A: z.number().nullable().optional(),
  Unterkategorien_A: z.number().nullable().optional(),
  Hauptkategorien_B: z.number().nullable().optional(),
  Unterkategorien_B: z.number().nullable().optional(),
  reviewNotes: z.string().optional()
});

export function collectSchemaKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b));
}
