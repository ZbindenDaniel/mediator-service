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
  logEvent,
} from '../db';
import { queryOne, execute } from '../db-client';
import { generateItemUUID } from '../lib/itemIds';
import { syncInDeviceComponents } from '../lib/in-device-components';
import { loadGeneralContract, loadSubCategoryContract, buildQualityCheckResponse, assemblyToQualityContract } from '../lib/quality-contracts';
import { getAssemblyContract } from '../contracts/registry';
import { resolveIntakeQuestions, deriveInstanceSpecsFromScan, normalizeScanComponents } from '../lib/intake-quality-map';
import type { IntakeAnswerBody, IntakeAnswerResponse, IntakeScanPayload, IntakeQuestion, IntakeDetectedSpecView } from '../../models/intake';
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
  newRef: { Hersteller: string; Artikelbeschreibung?: string; Kurzbeschreibung?: string; Hauptkategorien_A: number; Unterkategorien_A: number } | undefined,
  scannedModel?: string | null
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

  // The operator types the description into the station's Artikelbeschreibung field — that value
  // is AUTHORITATIVE and must win over the (often garbage) scanned model. Previously only
  // `Kurzbeschreibung` was read, so the operator's typed `Artikelbeschreibung` was silently dropped
  // and the scanned model always came through. Precedence: operator text → supplied Kurzbeschreibung
  // → scanned model → Hersteller (last resort so the required field is never empty).
  const operatorDesc = (newRef.Artikelbeschreibung ?? '').trim();
  const suppliedKurz = (newRef.Kurzbeschreibung ?? '').trim();
  const artikelbeschreibung =
    operatorDesc || suppliedKurz || (scannedModel ?? '').trim() || (newRef.Hersteller ?? '').trim();
  // Kurzbeschreibung stays the short model name (scan) when the operator didn't supply one.
  const kurzbeschreibung = suppliedKurz || (scannedModel ?? '').trim() || operatorDesc;
  if (!artikelbeschreibung.trim()) {
    throw new Error('newRef needs a description (Artikelbeschreibung/Kurzbeschreibung), scan model, or Hersteller');
  }
  await persistItemReference({
    Artikel_Nummer: nextArtikelNummer,
    Artikelbeschreibung: artikelbeschreibung,
    Hersteller: newRef.Hersteller,
    Kurzbeschreibung: kurzbeschreibung,
    Hauptkategorien_A: newRef.Hauptkategorien_A,
    Unterkategorien_A: newRef.Unterkategorien_A,
    Suchbegriff: artikelbeschreibung,
  });

  return {
    artikelNummer: nextArtikelNummer,
    unterkategorienA: newRef.Unterkategorien_A ?? null,
    hersteller: newRef.Hersteller ?? null,
    kurzbeschreibung: kurzbeschreibung || null,
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

  // Intake was creating items with no event, so intaked devices had empty histories (bug fix).
  await logEvent({
    Actor: 'intake-station',
    EntityType: 'Item',
    EntityId: itemUUID,
    Event: 'Created',
    Meta: JSON.stringify({ source: 'intake', artikelNummer, serial: serial ?? null, mac: mac ?? null }),
  });

  return itemUUID;
}

function buildQualityQuestions(
  unterkategorienA: number | null,
  scan: IntakeScanPayload
): { ask: IntakeQuestion[]; detectedSpecs: IntakeDetectedSpecView[] } {
  try {
    const general = loadGeneralContract();
    const subCat = unterkategorienA ? loadSubCategoryContract(unterkategorienA) : null;
    const assembly = unterkategorienA ? getAssemblyContract(unterkategorienA) : null;
    const assemblyQ = assembly ? assemblyToQualityContract(assembly) : null;
    const resolution = resolveIntakeQuestions(
      [...general.questions, ...(subCat?.questions ?? []), ...(assemblyQ?.questions ?? [])],
      scan
    );
    // Structured line: what the scan answered vs. what a scan-answerable field failed to answer
    // (non-empty unresolvedAutoFill = mis-scan, e.g. NVMe size=0, not an operator judgement).
    console.log('[intake] question resolution', {
      subCategory: unterkategorienA,
      asked: resolution.ask.map(q => q.id),
      detected: resolution.detected.map(d => `${d.label}=${d.value}`),
      unresolvedAutoFill: resolution.unresolvedAutoFill,
    });
    return {
      ask: resolution.ask,
      detectedSpecs: resolution.detected.map(d => ({ label: d.label, value: d.value })),
    };
  } catch {
    return { ask: [], detectedSpecs: [] };
  }
}

// Merged contract questions for a subcategory — used to compute the auto-answers at the
// quality step (same set the questionnaire was built from).
function mergedContractQuestions(unterkategorienA: number | null) {
  const general = loadGeneralContract();
  const subCat = unterkategorienA ? loadSubCategoryContract(unterkategorienA) : null;
  const assembly = unterkategorienA ? getAssemblyContract(unterkategorienA) : null;
  const assemblyQ = assembly ? assemblyToQualityContract(assembly) : null;
  return [...general.questions, ...(subCat?.questions ?? []), ...(assemblyQ?.questions ?? [])];
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

      const ref = await findOrCreateRef(refBody.artikelNummer, refBody.newRef, scan.model);
      if (!ref) {
        return sendJson(res, 422, { error: 'artikelNummer or newRef required' });
      }

      const itemUUID = await ensureItem(ref.artikelNummer, serial, mac);

      // Persist the raw scan so the later quality step can auto-resolve scan-answerable questions
      // without the script re-sending it. Non-fatal.
      try {
        await execute(`UPDATE items SET "IntakeScan" = $1 WHERE "ItemUUID" = $2`, [JSON.stringify(scan), itemUUID]);
      } catch (err) {
        console.warn('[intake-answer] Failed to persist intake scan', { itemUUID, err });
      }

      // Once the parent machine item exists, materialize its scanned sub-devices that have a
      // usable serial as in-device components (idempotent on re-scan). Serialless components
      // (e.g. PCI cards) fill assembly info instead. Non-fatal: a failure must not block catalog.
      try {
        await syncInDeviceComponents(itemUUID, normalizeScanComponents(scan), { logEvent });
      } catch (err) {
        console.warn('[intake-answer] Failed to sync in-device components', { itemUUID, err });
      }

      const { ask, detectedSpecs } = buildQualityQuestions(ref.unterkategorienA, scan);

      const response: IntakeAnswerResponse = {
        nextStep: 'quality',
        itemUUID,
        qualityQuestions: ask,
        detectedSpecs,
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
        Unterkategorien_A: number | null; IntakeScan: string | null;
      }>(
        serial
          ? `SELECT i."ItemUUID", i."Artikel_Nummer", r."Hersteller", r."Kurzbeschreibung",
                    r."Unterkategorien_A"::integer AS "Unterkategorien_A", i."IntakeScan"
             FROM items i LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
             WHERE i."SerialNumber" = $1 LIMIT 1`
          : `SELECT i."ItemUUID", i."Artikel_Nummer", r."Hersteller", r."Kurzbeschreibung",
                    r."Unterkategorien_A"::integer AS "Unterkategorien_A", i."IntakeScan"
             FROM items i LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
             WHERE i."MacAddress" = $1 LIMIT 1`,
        [serial ?? mac]
      );

      if (!itemRow) {
        return sendJson(res, 404, { error: 'item not found — complete ref step first' });
      }

      // Resolve the scan for auto-answering: prefer an echoed scanPayload, else the one persisted
      // at the ref step. Falls back to just the intake key so we never crash on a missing scan.
      let resolvedScan: IntakeScanPayload = { serial, mac };
      if (qualBody.scanPayload) {
        resolvedScan = qualBody.scanPayload;
      } else if (itemRow.IntakeScan) {
        try { resolvedScan = JSON.parse(itemRow.IntakeScan); } catch { /* keep fallback */ }
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
      // Accessory questions contribute to both quality (presence) and specs (spec answers).
      const assemblyContract = itemRow.Unterkategorien_A ? getAssemblyContract(itemRow.Unterkategorien_A) : null;
      const assemblyQualityContract = assemblyContract ? assemblyToQualityContract(assemblyContract) : null;

      // Auto-resolve the questions we didn't ask (skipAtIntake / autoFill), then let the
      // submitted answers win over them, so quality + specs are complete without the operator
      // re-entering scan-known data. Drop empty ("don't know") submitted answers first, so a
      // skipped question neither clobbers a scan-derived auto-answer nor scores as a real value.
      const { autoAnswers } = resolveIntakeQuestions(mergedContractQuestions(itemRow.Unterkategorien_A), resolvedScan);
      const submittedAnswers = Object.fromEntries(
        Object.entries(qualityAnswers).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
      );
      const mergedAnswers = { ...autoAnswers, ...submittedAnswers };
      const checkResponse = buildQualityCheckResponse(generalContract, subCatContract, mergedAnswers, assemblyQualityContract);

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

      await logEvent({
        Actor: 'intake-station',
        EntityType: 'Item',
        EntityId: itemRow.ItemUUID,
        Event: 'QualityAssessed',
        Meta: JSON.stringify({
          source: 'intake',
          quality: checkResponse.qualityValue,
          qualityTag: checkResponse.qualityTag ?? null,
        }),
      });

      // Spec precedence (lowest → highest): scan-derived (device booted, so present) <
      // questionnaire-derived < explicit script/operator instanceSpecs.
      const scanSpecs = deriveInstanceSpecsFromScan(resolvedScan);
      const mergedSpecs = { ...scanSpecs, ...checkResponse.derivedSpecs, ...(instanceSpecs ?? {}) };
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
