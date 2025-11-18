import { Op } from './types';

// TODO: Extend Kivitendo schema detection when additional export variants surface.
// TODO(agent): Monitor upcoming timestamp columns from Kivitendo exports to keep fallback coverage current.
const KIVITENDO_HEADER_PROFILES = [
  {
    name: 'full',
    headers: ['partnumber', 'sellprice', 'onhand', 'unit', 'itime'],
    relaxed: false,
  },
  {
    name: 'inventory-insertdate',
    headers: ['partnumber', 'onhand', 'unit', 'insertdate'],
    relaxed: true,
    // Accepts exports that omit sellprice/itime but still expose insertdate-driven stock snapshots.
  },
] as const;

type KivitendoHeaderProfile = (typeof KIVITENDO_HEADER_PROFILES)[number];

function resolveKivitendoSchemaProfile(row: Record<string, string>): KivitendoHeaderProfile | null {
  for (const profile of KIVITENDO_HEADER_PROFILES) {
    const matches = profile.headers.every((key) => Object.prototype.hasOwnProperty.call(row, key));
    if (matches) {
      return profile;
    }
  }
  return null;
}

function normalizeValue(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === '\\N') {
    return null;
  }
  return trimmed;
}

function normalizeBooleanFlag(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const lowered = value.toLowerCase();
  if (['1', 'true', 't', 'yes', 'ja', 'y', 'on'].includes(lowered)) {
    return '1';
  }
  if (['0', 'false', 'f', 'no', 'nein', 'n', 'off'].includes(lowered)) {
    return '0';
  }
  const parsedNumber = Number.parseFloat(value);
  if (Number.isFinite(parsedNumber)) {
    return parsedNumber !== 0 ? '1' : '0';
  }
  return value;
}

function sanitizeImageName(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const separatorIndex = value.indexOf('|');
  if (separatorIndex >= 0) {
    return value.slice(0, separatorIndex).trim();
  }
  return value;
}

export const name = 'detect-kivitendo-schema';

export const apply: Op['apply'] = (row, ctx) => {
  try {
    const schemaProfile = resolveKivitendoSchemaProfile(row);
    if (!schemaProfile) {
      return { ok: true, row };
    }

    ctx.log('[detect-kivitendo-schema] detected Kivitendo schema row', {
      id: row.id,
      partnumber: row.partnumber,
      profile: schemaProfile.name,
    });

    if (schemaProfile.relaxed) {
      try {
        ctx.log('[detect-kivitendo-schema] using relaxed Kivitendo header profile', {
          profile: schemaProfile.name,
          headers: schemaProfile.headers,
          id: row.id,
          partnumber: row.partnumber,
        });
      } catch (loggingError) {
        console.error('[detect-kivitendo-schema] failed to log relaxed header profile match', loggingError);
      }
    }

    const mappedRow: Record<string, string> = { ...row };

    const artikelNummer = normalizeValue(row.partnumber);
    if (artikelNummer) {
      mappedRow['Artikel-Nummer'] = artikelNummer;
    }

    const beschreibung = normalizeValue(row.description);
    if (beschreibung) {
      mappedRow['Artikelbeschreibung'] = beschreibung;
    }

    const langtext = normalizeValue(row.notes);
    if (langtext) {
      mappedRow['Langtext'] = langtext;
    }

    const verkaufspreis = normalizeValue(row.sellprice);
    if (verkaufspreis) {
      mappedRow['Verkaufspreis'] = verkaufspreis;
    }

    const gewicht = normalizeValue(row.weight);
    if (gewicht) {
      mappedRow['Gewicht(kg)'] = gewicht;
    }

    const einheit = normalizeValue(row.unit);
    if (einheit) {
      mappedRow['Einheit'] = einheit;
    }

    const aufLager = normalizeValue(row.onhand);
    if (aufLager) {
      mappedRow['Auf_Lager'] = aufLager;
    }

    const normalizedItime = normalizeValue(row.itime);
    const timestampFallbackFields = ['insertdate', 'mtime', 'Datum erfasst', 'Datum_erfasst', 'idate'] as const;
    let datumErfasstSourceField: string | null = null;
    let datumErfasst = normalizedItime;
    if (!datumErfasst) {
      for (const field of timestampFallbackFields) {
        const fallbackValue = normalizeValue((row as Record<string, string | undefined>)[field]);
        if (!fallbackValue) {
          continue;
        }
        datumErfasst = fallbackValue;
        datumErfasstSourceField = field;
        break;
      }
      if (datumErfasst && datumErfasstSourceField) {
        try {
          ctx.log('[detect-kivitendo-schema] filled missing itime from timestamp fallback', {
            id: row.id,
            partnumber: row.partnumber,
            fallbackField: datumErfasstSourceField,
          });
        } catch (loggingError) {
          console.error('[detect-kivitendo-schema] failed to log timestamp fallback usage', loggingError);
        }
      }
    }
    if (datumErfasst) {
      mappedRow['Datum erfasst'] = datumErfasst;
      mappedRow.idate = datumErfasst;
    }

    const image = sanitizeImageName(normalizeValue(row.image));
    if (image) {
      mappedRow['Grafikname(n)'] = image;
    }

    const shopFlag = normalizeBooleanFlag(normalizeValue(row.shop));
    if (shopFlag) {
      mappedRow['Veröffentlicht_Status'] = shopFlag;
      mappedRow['Shopartikel'] = shopFlag;
    }

    const binIdRaw = row.bin_id;
    const binId = normalizeValue(binIdRaw);
    if (binIdRaw !== undefined) {
      if (binId) {
        mappedRow.BoxID = `BIN-${binId}`;
      } else {
        ctx.log('[detect-kivitendo-schema] bin_id missing or malformed; skipping BoxID mapping', {
          id: row.id,
          partnumber: row.partnumber,
          bin_id: binIdRaw,
        });
      }
    }

    const normalizedId = normalizeValue(row.id);
    if (normalizedId) {
      mappedRow.itemUUID = `kivitendo-${normalizedId}`;
    } else if (artikelNummer) {
      mappedRow.itemUUID = `kivitendo-${artikelNummer}`;
      ctx.log('[detect-kivitendo-schema] falling back to Artikel-Nummer for itemUUID', {
        id: row.id,
        partnumber: row.partnumber,
      });
    } else {
      ctx.log('[detect-kivitendo-schema] unable to derive itemUUID from row', {
        id: row.id,
        partnumber: row.partnumber,
      });
    }

    ctx.log('[detect-kivitendo-schema] mapped row', mappedRow);
    return { ok: true, row: mappedRow };
  } catch (err) {
    console.error('[detect-kivitendo-schema] failed to map Kivitendo schema row', err);
    return { ok: false, errors: [String(err)] };
  }
};

export default { name, apply } satisfies Op;
