import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireIntakeAuth } from '../utils/intake-auth';
import { queryOne } from '../db-client';
import { loadGeneralContract, loadSubCategoryContract, assemblyToQualityContract } from '../lib/quality-contracts';
import { getAssemblyContract } from '../contracts/registry';
import { resolveIntakeQuestions } from '../lib/intake-quality-map';
import { collapseRepeatedTokens } from '../lib/intake-naming';
import { searchItemReferences } from './search';
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

async function findRefCandidates(vendor: string | null | undefined, model: string | null | undefined): Promise<IntakeRefCandidate[]> {
  if (!vendor && !model) return [];
  // Reuse the single reference matcher that manual item creation uses
  // (`/api/search?scope=refs`) so intake surfaces the same candidates as everywhere
  // else — token-based fuzzy match across Artikelbeschreibung/Suchbegriff/Hersteller/…,
  // which the old Kurzbeschreibung-only substring query missed for imported refs. The
  // scan embeds the brand in the model ("HP HP ProBook…"); collapse the repeated tokens
  // so the search term is clean.
  const term = collapseRepeatedTokens([vendor, model].filter(Boolean).join(' '));
  const refs = await searchItemReferences(term);
  return refs.map(r => ({
    artikelNummer: String(r.Artikel_Nummer ?? ''),
    hersteller: (r.Hersteller as string | null) ?? null,
    kurzbeschreibung: (r.Kurzbeschreibung as string | null) ?? null,
    hauptkategorienA: r.Hauptkategorien_A != null ? Number(r.Hauptkategorien_A) : null,
    unterkategorienA: r.Unterkategorien_A != null ? Number(r.Unterkategorien_A) : null,
  }));
}

function buildQualityQuestions(unterkategorienA: number | null, scan: IntakeScanPayload): IntakeQuestion[] {
  try {
    const general = loadGeneralContract();
    const subCat = unterkategorienA ? loadSubCategoryContract(unterkategorienA) : null;
    // Assembly (accessory) questions ask about parts — presence drives quality, spec answers
    // fill specs — so the intake questionnaire can produce a complete item, not just quality.
    const assembly = unterkategorienA ? getAssemblyContract(unterkategorienA) : null;
    const assemblyQ = assembly ? assemblyToQualityContract(assembly) : null;
    const allQuestions = [
      ...general.questions,
      ...(subCat?.questions ?? []),
      ...(assemblyQ?.questions ?? [])
    ];
    // Only return questions a human must answer; the rest are auto-resolved at the quality step.
    return resolveIntakeQuestions(allQuestions, scan).ask;
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
      const response: IntakeStartResponse = {
        intakeKey,
        nextStep: 'select_ref',
        candidates,
        // Echo scanned identity so the TUI can pre-fill Hersteller/Kurzbeschreibung
        scan: { vendor: scan.vendor ?? null, model: scan.model ?? null },
      };
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
