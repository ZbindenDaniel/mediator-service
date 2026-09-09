import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireIntakeAuth } from '../utils/intake-auth';
import { queryOne, query } from '../db-client';
import { IN_DEVICE_COMPONENT_SQL } from '../db';
import { loadGeneralContract, loadSubCategoryContract, assemblyToQualityContract } from '../lib/quality-contracts';
import { getAssemblyContract } from '../contracts/registry';
import { resolveIntakeQuestions } from '../lib/intake-quality-map';
import { searchItemReferences } from './search';
import type { IntakeScanPayload, IntakeStartResponse, IntakeRefCandidate, IntakeInstanceCandidate, IntakeQuestion, IntakeDetectedSpecView } from '../../models/intake';
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
      Hersteller: string | null; Artikelbeschreibung: string | null;
      Hauptkategorien_A: number | null; Unterkategorien_A: number | null;
    }>(
      `SELECT i."ItemUUID", i."Artikel_Nummer", i."SerialNumber", i."MacAddress",
              i."Quality", i."QualityId",
              r."Hersteller", r."Artikelbeschreibung",
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
      Hersteller: string | null; Artikelbeschreibung: string | null;
      Hauptkategorien_A: number | null; Unterkategorien_A: number | null;
    }>(
      `SELECT i."ItemUUID", i."Artikel_Nummer", i."SerialNumber", i."MacAddress",
              i."Quality", i."QualityId",
              r."Hersteller", r."Artikelbeschreibung",
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
  const term = [vendor, model].filter(Boolean).join(' ');
  const refs = await searchItemReferences(term);
  const candidates: IntakeRefCandidate[] = refs.map(r => ({
    artikelNummer: String(r.Artikel_Nummer ?? ''),
    hersteller: (r.Hersteller as string | null) ?? null,
    artikelbeschreibung: (r.Artikelbeschreibung as string | null) ?? null,
    hauptkategorienA: r.Hauptkategorien_A != null ? Number(r.Hauptkategorien_A) : null,
    unterkategorienA: r.Unterkategorien_A != null ? Number(r.Unterkategorien_A) : null,
  }));
  await attachMatchableInstances(candidates);
  return candidates;
}

// Cap the number of matchable instances surfaced per reference — a ref with many serial-less
// instances is unusual, and the operator only needs a short "is it one of these?" list.
const MAX_MATCHABLE_INSTANCES_PER_REF = 10;

// For each candidate reference, find existing instances with NO serial and NO MAC on file — the
// devices catalogued before the intake API (or by hand) that the scanned unit might actually be.
// An instance with a serial/MAC would have matched by identifier already (step 1) or is a genuinely
// different unit, so it is excluded. In-device components and zero-stock (removed) items are excluded.
async function attachMatchableInstances(candidates: IntakeRefCandidate[]): Promise<void> {
  const nums = candidates.map(c => c.artikelNummer).filter(Boolean);
  if (nums.length === 0) return;
  let rows: Array<{
    ItemUUID: string; Artikel_Nummer: string | null; BoxID: string | null;
    BoxLabel: string | null; Location: string | null; Quality: number | null; Datum_erfasst: string | null;
  }> = [];
  try {
    rows = await query(
      `SELECT i."ItemUUID", i."Artikel_Nummer", i."BoxID", b."Label" AS "BoxLabel",
              i."Location", i."Quality", i."Datum_erfasst"
       FROM items i
       LEFT JOIN boxes b ON i."BoxID" = b."BoxID"
       WHERE i."Artikel_Nummer" = ANY($1)
         AND i."SerialNumber" IS NULL
         AND i."MacAddress" IS NULL
         AND COALESCE(i."Auf_Lager", 0) > 0
         AND NOT ${IN_DEVICE_COMPONENT_SQL}
       ORDER BY i."Datum_erfasst" DESC NULLS LAST`,
      [nums]
    );
  } catch (err) {
    // Matching is an aid, not a gate — a lookup failure must not block the select_ref step.
    console.warn('[intake-start] Failed to load matchable instances', err);
    return;
  }
  const byRef = new Map<string, IntakeInstanceCandidate[]>();
  for (const row of rows) {
    const key = String(row.Artikel_Nummer ?? '');
    const list = byRef.get(key) ?? [];
    if (list.length >= MAX_MATCHABLE_INSTANCES_PER_REF) continue;
    list.push({
      itemUUID: row.ItemUUID,
      artikelNummer: key,
      boxId: row.BoxID,
      boxLabel: row.BoxLabel,
      location: row.Location,
      quality: row.Quality != null ? Number(row.Quality) : null,
      datumErfasst: row.Datum_erfasst,
    });
    byRef.set(key, list);
  }
  for (const c of candidates) {
    const list = byRef.get(c.artikelNummer);
    if (list && list.length > 0) c.matchableInstances = list;
  }
}

function buildQualityQuestions(
  unterkategorienA: number | null,
  scan: IntakeScanPayload
): { ask: IntakeQuestion[]; detectedSpecs: IntakeDetectedSpecView[] } {
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
    const resolution = resolveIntakeQuestions(allQuestions, scan);
    logIntakeResolution(unterkategorienA, resolution);
    return {
      ask: resolution.ask,
      detectedSpecs: resolution.detected.map(d => ({ label: d.label, value: d.value })),
    };
  } catch {
    return { ask: [], detectedSpecs: [] };
  }
}

/** One structured line per questionnaire build: what the scan answered vs. what it couldn't.
 *  A non-empty `unresolvedAutoFill` means a scan-answerable field (e.g. NVMe size) wasn't in the
 *  scan — the fingerprint of a mis-scan (build_scan_payload), not an operator judgement call. */
function logIntakeResolution(
  unterkategorienA: number | null,
  resolution: ReturnType<typeof resolveIntakeQuestions>
): void {
  console.log('[intake] question resolution', {
    subCategory: unterkategorienA,
    asked: resolution.ask.map(q => q.id),
    detected: resolution.detected.map(d => `${d.label}=${d.value}`),
    unresolvedAutoFill: resolution.unresolvedAutoFill,
  });
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
      // Forward BOTH sub-device shapes: `components[]` is the canonical list, `disks[]` the
      // shorthand. Dropping `components` here made storageSize/storageType signals return null,
      // so a drive reported only via components[] wrongly triggered the storage/drive-type questions.
      components: body.components ?? null,
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
        scan: { vendor: scan.vendor ?? null, model: scan.model ?? null },
      };
      return sendJson(res, 200, response);
    }

    if (!item.QualityId) {
      // Step 2: item exists but no quality assessment yet
      const { ask, detectedSpecs } = buildQualityQuestions(item.Unterkategorien_A, scan);
      const response: IntakeStartResponse = {
        intakeKey,
        nextStep: 'quality',
        itemUUID: item.ItemUUID,
        qualityQuestions: ask,
        detectedSpecs,
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
        artikelbeschreibung: item.Artikelbeschreibung,
        quality: item.Quality,
      },
    };
    return sendJson(res, 200, response);
  }
});

export default action;
