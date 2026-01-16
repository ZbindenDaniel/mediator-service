import { Op, OpContext } from './types';

// TODO(agent): Log mapped Produkt schema fields with row identity once row-number context is threaded into ops.

// TODO: Extend Produkt schema detection when additional export variants appear.
const PRODUKT_SCHEMA_KEYS = [
  'Produkt-Nr.',
  'Menge',
  'Artikel-Bezeichnung',
  'Beschreibung aus Kurz-Produktbeschreibung',
  'Behältnis-Nr.',
  'Lager-Behältnis',
  'Lagerraum'
];

const PRODUKT_SCHEMA_MAPPINGS = [
  { source: 'Produkt-Nr.', target: 'Artikel-Nummer' },
  { source: 'Menge', target: 'Auf_Lager', isQuantity: true },
  { source: 'Artikel-Bezeichnung', target: 'Artikelbeschreibung' },
  { source: 'Beschreibung aus Kurz-Produktbeschreibung', target: 'Langtext' },
  { source: 'Behältnis-Nr.', target: 'BoxID' },
] as const;

const NOTES_STATE_KEY = 'detect-produkt-schema:notesByContainer';

function resolveNotesMap(ctx: OpContext): Map<string, string[]> {
  let map = ctx.runState.get(NOTES_STATE_KEY) as Map<string, string[]> | undefined;
  if (!map) {
    map = new Map<string, string[]>();
    ctx.runState.set(NOTES_STATE_KEY, map);
  }
  return map;
}

function hasProduktSchema(row: Record<string, string>): boolean {
  return PRODUKT_SCHEMA_KEYS.some((key) => {
    const value = row[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function normalizeSegment(segment: string | undefined): string | null {
  if (!segment) return null;
  const trimmed = segment.trim();
  return trimmed.length ? trimmed : null;
}

function mergeSegments(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing);
  const merged = [...existing];
  for (const segment of incoming) {
    if (!seen.has(segment)) {
      merged.push(segment);
      seen.add(segment);
    }
  }
  return merged;
}

export const name = 'detect-produkt-schema';

export const apply: Op['apply'] = (row, ctx) => {
  try {
    if (!hasProduktSchema(row)) {
      return { ok: true, row };
    }

    ctx.log('[detect-produkt-schema] detected Produkt schema row', row);
    const mappedRow: Record<string, string> = { ...row };
    const mappingUpdates: Record<string, string> = {};
    const mappedColumns: Array<{
      source: string;
      target: string;
      value: string;
      isQuantity?: boolean;
    }> = [];

    try {
      for (const mapping of PRODUKT_SCHEMA_MAPPINGS) {
        const rawValue = normalizeSegment(row[mapping.source]);
        if (!rawValue) {
          continue;
        }
        mappingUpdates[mapping.target] = rawValue;
        mappedColumns.push({ ...mapping, value: rawValue });
      }

      Object.assign(mappedRow, mappingUpdates);
    } catch (mappingError) {
      console.error('[detect-produkt-schema] failed to map Produkt schema columns', mappingError);
      return { ok: true, row };
    }

    if (mappedColumns.length > 0) {
      ctx.log('[detect-produkt-schema] mapped legacy columns to current fields', {
        mappedColumns: mappedColumns.map(({ source, target }) => ({ source, target })),
      });
      const quantityMapping = mappedColumns.find((entry) => entry.isQuantity);
      if (quantityMapping) {
        ctx.log('[detect-produkt-schema] mapped legacy quantity for instance/bulk handling', {
          source: quantityMapping.source,
          target: quantityMapping.target,
          value: quantityMapping.value,
        });
      }
    }

    const containerId = mappingUpdates.BoxID ?? normalizeSegment(row['Behältnis-Nr.']);

    const noteSegments: string[] = [];
    const existingNotes = normalizeSegment(row['Notes']);
    if (existingNotes) {
      for (const raw of existingNotes.split(/\s*\|\s*/)) {
        const seg = normalizeSegment(raw);
        if (seg) noteSegments.push(seg);
      }
    }

    const lagerBehaeltnis = normalizeSegment(row['Lager-Behältnis']);
    if (lagerBehaeltnis) {
      noteSegments.push(`Lager-Behältnis: ${lagerBehaeltnis}`);
    }

    const lagerRaum = normalizeSegment(row['Lagerraum']);
    if (lagerRaum) {
      noteSegments.push(`Lagerraum: ${lagerRaum}`);
    }

    const notesByContainer = resolveNotesMap(ctx);

    if (containerId) {
      const existing = notesByContainer.get(containerId) || [];
      if (noteSegments.length) {
        const mergedSegments = mergeSegments(existing, noteSegments);
        notesByContainer.set(containerId, mergedSegments);
        mappedRow['Notes'] = mergedSegments.join(' | ');
      } else if (existing.length) {
        mappedRow['Notes'] = existing.join(' | ');
      }
    } else if (noteSegments.length) {
      const mergedSegments = mergeSegments([], noteSegments);
      mappedRow['Notes'] = mergedSegments.join(' | ');
    }

    if (!mappedRow.itemUUID) {
      const artikelNummer = mappedRow['Artikel-Nummer'] || mappingUpdates['Artikel-Nummer'];
      if (artikelNummer) {
        mappedRow.itemUUID = `080925-${artikelNummer}`;
      }
    }

    ctx.log('[detect-produkt-schema] mapped row', mappedRow);
    return { ok: true, row: mappedRow };
  } catch (err) {
    console.error('[detect-produkt-schema] failed to map Produkt schema row', err);
    return { ok: false, errors: [String(err)] };
  }
};

export default { name, apply } satisfies Op;
