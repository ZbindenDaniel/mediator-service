import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireIntakeAuth } from '../utils/intake-auth';
import {
  persistItemReference,
  persistItemInstance,
  insertQualityAssessment,
  updateItemQualityAssessment,
  updateItemInstanceSpecs,
  getMaxArtikelNummer,
  getMaxItemId,
} from '../db';
import { queryOne } from '../db-client';
import { generateItemUUID } from '../lib/itemIds';
import { loadGeneralContract, loadSubCategoryContract, buildQualityCheckResponse } from '../lib/quality-contracts';
import { preFillQualityQuestions } from '../lib/intake-quality-map';
import type { IntakeAnswerBody, IntakeAnswerResponse, IntakeScanPayload, IntakeQuestion } from '../../models/intake';
import { QUALITY_LABELS } from '../../models/quality';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// intakeKey format: SN:{serial} or MAC:{mac}
function parseIntakeKey(key: string): { serial: string | null; mac: string | null } {
  if (key.startsWith('SN:')) return { serial: key.slice(3), mac: null };
  if (key.startsWith('MAC:')) return { serial: null, mac: key.slice(4) };
  return { serial: null, mac: null };
}

async function findOrCreateRef(
  artikelNummer: string | undefined,
  newRef: { Hersteller: string; Kurzbeschreibung: string; Hauptkategorien_A: number; Unterkategorien_A: number } | undefined
): Promise<{ artikelNummer: string; unterkategorienA: number | null; hersteller: string | null; kurzbeschreibung: string | null } | null> {
  if (artikelNummer) {
    const row = await queryOne<{
      Artikel_Nummer: string; Hersteller: string | null; Kurzbeschreibung: string | null; Unterkategorien_A: string | null;
    }>(
      `SELECT "Artikel_Nummer", "Hersteller", "Kurzbeschreibung", "Unterkategorien_A"
       FROM item_refs WHERE "Artikel_Nummer" = $1 LIMIT 1`,
      [artikelNummer]
    );
    if (!row) return null;
    return {
      artikelNummer: row.Artikel_Nummer,
      unterkategorienA: row.Unterkategorien_A ? Number(row.Unterkategorien_A) : null,
      hersteller: row.Hersteller,
      kurzbeschreibung: row.Kurzbeschreibung,
    };
  }

  if (!newRef) return null;

  const maxArtikel = await getMaxArtikelNummer();
  const nextArtikelNummer = String((maxArtikel ? parseInt(maxArtikel, 10) : 0) + 1);

  const artikelbeschreibung = [newRef.Hersteller, newRef.Kurzbeschreibung].filter(Boolean).join(' ');
  if (!artikelbeschreibung.trim()) {
    throw new Error('Hersteller and Kurzbeschreibung cannot both be empty');
  }
  await persistItemReference({
    Artikel_Nummer: nextArtikelNummer,
    Artikelbeschreibung: artikelbeschreibung,
    Hersteller: newRef.Hersteller,
    Kurzbeschreibung: newRef.Kurzbeschreibung,
    Hauptkategorien_A: newRef.Hauptkategorien_A,
    Unterkategorien_A: newRef.Unterkategorien_A,
    Suchbegriff: artikelbeschreibung,
  });

  return {
    artikelNummer: nextArtikelNummer,
    unterkategorienA: newRef.Unterkategorien_A ?? null,
    hersteller: newRef.Hersteller ?? null,
    kurzbeschreibung: newRef.Kurzbeschreibung ?? null,
  };
}

async function ensureItem(
  artikelNummer: string,
  serial: string | null,
  mac: string | null
): Promise<string> {
  // Check if item already exists for this serial/mac
  const existing = await queryOne<{ ItemUUID: string }>(
    serial
      ? `SELECT "ItemUUID" FROM items WHERE "SerialNumber" = $1 LIMIT 1`
      : `SELECT "ItemUUID" FROM items WHERE "MacAddress" = $1 LIMIT 1`,
    [serial ?? mac]
  );
  if (existing) return existing.ItemUUID;

  const itemUUID = await generateItemUUID(artikelNummer, {
    getMaxItemId: async (params) => {
      const result = await getMaxItemId(params.pattern, params.sequenceStartIndex);
      return result ? { ItemUUID: result } : null;
    }
  });

  await persistItemInstance({
    ItemUUID: itemUUID,
    Artikel_Nummer: artikelNummer,
    BoxID: null,
    Location: null,
    UpdatedAt: new Date(),
    Datum_erfasst: new Date(),
    Auf_Lager: 1,
    SerialNumber: serial ?? undefined,
    MacAddress: mac ?? undefined,
  });

  return itemUUID;
}

function buildQualityQuestions(unterkategorienA: number | null, scan: IntakeScanPayload): IntakeQuestion[] {
  try {
    const general = loadGeneralContract();
    const subCat = unterkategorienA ? loadSubCategoryContract(unterkategorienA) : null;
    return preFillQualityQuestions([...general.questions, ...(subCat?.questions ?? [])], scan);
  } catch {
    return [];
  }
}

const ROUTE_RE = /^\/api\/intake\/([^/]+)\/answer$/;

const action = defineHttpAction({
  key: 'intake-answer',
  label: 'Intake answer',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Intake answer API</p></div>',
  matches: (p, method) => ROUTE_RE.test(p) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireIntakeAuth(req, res)) return;

    const urlPath = (req.url || '').split('?')[0];
    const match = urlPath.match(ROUTE_RE);
    if (!match) return sendJson(res, 404, { error: 'not found' });

    const intakeKey = decodeURIComponent(match[1]);
    const { serial, mac } = parseIntakeKey(intakeKey);
    if (!serial && !mac) {
      return sendJson(res, 422, { error: 'invalid intake key' });
    }

    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body: Partial<IntakeAnswerBody> = {};
    try { body = JSON.parse(raw || '{}'); } catch {
      return sendJson(res, 400, { error: 'invalid JSON' });
    }

    if (body.type === 'ref') {
      const refBody = body as any;
      const scan: IntakeScanPayload = refBody.scanPayload ?? { serial, mac };

      const ref = await findOrCreateRef(refBody.artikelNummer, refBody.newRef);
      if (!ref) {
        return sendJson(res, 422, { error: 'artikelNummer or newRef required' });
      }

      const itemUUID = await ensureItem(ref.artikelNummer, serial, mac);
      const questions = buildQualityQuestions(ref.unterkategorienA, scan);

      const response: IntakeAnswerResponse = {
        nextStep: 'quality',
        itemUUID,
        qualityQuestions: questions,
      };
      return sendJson(res, 200, response);
    }

    if (body.type === 'quality') {
      const qualBody = body as any;
      const qualityAnswers: Record<string, string> = qualBody.qualityAnswers ?? {};
      const instanceSpecs: Record<string, string> | undefined = qualBody.instanceSpecs;

      // Fetch item for this intakeKey
      const itemRow = await queryOne<{
        ItemUUID: string; Artikel_Nummer: string | null;
        Hersteller: string | null; Kurzbeschreibung: string | null;
        Unterkategorien_A: number | null;
      }>(
        serial
          ? `SELECT i."ItemUUID", i."Artikel_Nummer", r."Hersteller", r."Kurzbeschreibung",
                    r."Unterkategorien_A"::integer AS "Unterkategorien_A"
             FROM items i LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
             WHERE i."SerialNumber" = $1 LIMIT 1`
          : `SELECT i."ItemUUID", i."Artikel_Nummer", r."Hersteller", r."Kurzbeschreibung",
                    r."Unterkategorien_A"::integer AS "Unterkategorien_A"
             FROM items i LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
             WHERE i."MacAddress" = $1 LIMIT 1`,
        [serial ?? mac]
      );

      if (!itemRow) {
        return sendJson(res, 404, { error: 'item not found — complete ref step first' });
      }

      let generalContract;
      try {
        generalContract = loadGeneralContract();
      } catch {
        return sendJson(res, 500, { error: 'failed to load quality contract' });
      }

      const subCatContract = itemRow.Unterkategorien_A
        ? loadSubCategoryContract(itemRow.Unterkategorien_A)
        : null;
      const checkResponse = buildQualityCheckResponse(generalContract, subCatContract, qualityAnswers);

      const assessment = {
        tag: checkResponse.qualityTag as import('../../models/quality').QualityTag,
        value: checkResponse.qualityValue,
        is_complete: true as boolean | null,
        has_defects: null as boolean | null,
        is_functional: null as boolean | null,
        notes: null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'intake-station',
        checkResponse,
      };

      const id = await insertQualityAssessment(assessment);
      await updateItemQualityAssessment(itemRow.ItemUUID, id, checkResponse.qualityValue);

      const mergedSpecs = { ...checkResponse.derivedSpecs, ...(instanceSpecs ?? {}) };
      if (Object.keys(mergedSpecs).length > 0) {
        await updateItemInstanceSpecs(itemRow.ItemUUID, mergedSpecs).catch((err) => {
          console.warn('[intake-answer] Failed to store derived specs', { itemUUID: itemRow.ItemUUID, err });
        });
      }

      const qualityTag = QUALITY_LABELS[checkResponse.qualityValue] ?? null;
      const response: IntakeAnswerResponse = {
        nextStep: 'phase2',
        summary: {
          itemUUID: itemRow.ItemUUID,
          artikelNummer: itemRow.Artikel_Nummer ?? '',
          hersteller: itemRow.Hersteller,
          kurzbeschreibung: itemRow.Kurzbeschreibung,
          quality: checkResponse.qualityValue,
          qualityTag,
        },
      };
      return sendJson(res, 200, response);
    }

    return sendJson(res, 400, { error: 'type must be "ref" or "quality"' });
  }
});

export default action;
