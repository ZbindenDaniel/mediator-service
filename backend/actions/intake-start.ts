import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireIntakeAuth } from '../utils/intake-auth';
import { query, queryOne } from '../db-client';
import { loadGeneralContract, loadSubCategoryContract } from '../lib/quality-contracts';
import { preFillQualityQuestions } from '../lib/intake-quality-map';
import type { IntakeScanPayload, IntakeStartResponse, IntakeRefCandidate, IntakeQuestion } from '../../models/intake';
import { QUALITY_LABELS } from '../../models/quality';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function makeIntakeKey(serial: string | null | undefined, mac: string | null | undefined): string | null {
  if (serial?.trim()) return `SN:${serial.trim()}`;
  if (mac?.trim()) return `MAC:${mac.trim()}`;
  return null;
}

async function findItemByIdentifier(serial: string | null, mac: string | null) {
  if (serial) {
    const row = await queryOne<{
      ItemUUID: string; Artikel_Nummer: string | null; SerialNumber: string | null;
      MacAddress: string | null; Quality: number | null; QualityId: number | null;
      Hersteller: string | null; Kurzbeschreibung: string | null;
      Hauptkategorien_A: number | null; Unterkategorien_A: number | null;
    }>(
      `SELECT i."ItemUUID", i."Artikel_Nummer", i."SerialNumber", i."MacAddress",
              i."Quality", i."QualityId",
              r."Hersteller", r."Kurzbeschreibung",
              r."Hauptkategorien_A"::integer AS "Hauptkategorien_A",
              r."Unterkategorien_A"::integer AS "Unterkategorien_A"
       FROM items i
       LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
       WHERE i."SerialNumber" = $1 LIMIT 1`,
      [serial]
    );
    if (row) return row;
  }
  if (mac) {
    return queryOne<{
      ItemUUID: string; Artikel_Nummer: string | null; SerialNumber: string | null;
      MacAddress: string | null; Quality: number | null; QualityId: number | null;
      Hersteller: string | null; Kurzbeschreibung: string | null;
      Hauptkategorien_A: number | null; Unterkategorien_A: number | null;
    }>(
      `SELECT i."ItemUUID", i."Artikel_Nummer", i."SerialNumber", i."MacAddress",
              i."Quality", i."QualityId",
              r."Hersteller", r."Kurzbeschreibung",
              r."Hauptkategorien_A"::integer AS "Hauptkategorien_A",
              r."Unterkategorien_A"::integer AS "Unterkategorien_A"
       FROM items i
       LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
       WHERE i."MacAddress" = $1 LIMIT 1`,
      [mac]
    );
  }
  return null;
}

async function findRefCandidates(vendor: string | null, model: string | null): Promise<IntakeRefCandidate[]> {
  if (!vendor && !model) return [];
  const term = `%${[vendor, model].filter(Boolean).join(' ')}%`;
  const rows = await query<{
    Artikel_Nummer: string; Hersteller: string | null;
    Kurzbeschreibung: string | null; Hauptkategorien_A: string | null; Unterkategorien_A: string | null;
  }>(
    `SELECT r."Artikel_Nummer", r."Hersteller", r."Kurzbeschreibung",
            r."Hauptkategorien_A", r."Unterkategorien_A"
     FROM item_refs r
     WHERE (r."Kurzbeschreibung" ILIKE $1 OR r."Hersteller" ILIKE $1)
     ORDER BY r."Artikel_Nummer" DESC LIMIT 3`,
    [term]
  );
  return rows.map(r => ({
    artikelNummer: r.Artikel_Nummer,
    hersteller: r.Hersteller,
    kurzbeschreibung: r.Kurzbeschreibung,
    hauptkategorienA: r.Hauptkategorien_A ? Number(r.Hauptkategorien_A) : null,
    unterkategorienA: r.Unterkategorien_A ? Number(r.Unterkategorien_A) : null,
  }));
}

function buildQualityQuestions(unterkategorienA: number | null, scan: IntakeScanPayload): IntakeQuestion[] {
  try {
    const general = loadGeneralContract();
    const subCat = unterkategorienA ? loadSubCategoryContract(unterkategorienA) : null;
    const allQuestions = [
      ...general.questions,
      ...(subCat?.questions ?? [])
    ];
    return preFillQualityQuestions(allQuestions, scan);
  } catch {
    return [];
  }
}

const action = defineHttpAction({
  key: 'intake-start',
  label: 'Intake start',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Intake start API</p></div>',
  matches: (p, method) => p === '/api/intake/start' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireIntakeAuth(req, res)) return;

    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body: Partial<IntakeScanPayload & { serial?: string; mac?: string }> = {};
    try { body = JSON.parse(raw || '{}'); } catch {
      return sendJson(res, 400, { error: 'invalid JSON' });
    }

    const serial = body.serial?.trim() || null;
    const mac = body.mac?.trim() || null;
    const intakeKey = makeIntakeKey(serial, mac);
    if (!intakeKey) {
      return sendJson(res, 422, { error: 'serial or mac required' });
    }

    const scan: IntakeScanPayload = {
      serial,
      mac,
      vendor: body.vendor ?? null,
      model: body.model ?? null,
      cpu: body.cpu ?? null,
      ramMb: body.ramMb ?? null,
      disks: body.disks ?? null,
      batteryPercent: body.batteryPercent ?? null,
    };

    const item = await findItemByIdentifier(serial, mac);

    if (!item) {
      // Step 1: unknown device — find ref candidates
      const candidates = await findRefCandidates(scan.vendor, scan.model);
      const response: IntakeStartResponse = { intakeKey, nextStep: 'select_ref', candidates };
      return sendJson(res, 200, response);
    }

    if (!item.QualityId) {
      // Step 2: item exists but no quality assessment yet
      const questions = buildQualityQuestions(item.Unterkategorien_A, scan);
      const response: IntakeStartResponse = {
        intakeKey,
        nextStep: 'quality',
        itemUUID: item.ItemUUID,
        qualityQuestions: questions,
      };
      return sendJson(res, 200, response);
    }

    // Step 3: quality done — always return phase2 so tests can run / re-run
    const qualityTag = item.Quality != null ? (QUALITY_LABELS[item.Quality] ?? null) : null;
    const response: IntakeStartResponse = {
      intakeKey,
      nextStep: 'phase2',
      itemUUID: item.ItemUUID,
      item: {
        itemUUID: item.ItemUUID,
        artikelNummer: item.Artikel_Nummer ?? '',
        hersteller: item.Hersteller,
        kurzbeschreibung: item.Kurzbeschreibung,
        quality: item.Quality,
      },
    };
    return sendJson(res, 200, response);
  }
});

export default action;
