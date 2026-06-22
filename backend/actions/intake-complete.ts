import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireIntakeAuth } from '../utils/intake-auth';
import { queryOne } from '../db-client';
import { forwardAgenticTrigger } from './agentic-trigger';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseIntakeKey(key: string): { serial: string | null; mac: string | null } {
  if (key.startsWith('SN:')) return { serial: key.slice(3), mac: null };
  if (key.startsWith('MAC:')) return { serial: null, mac: key.slice(4) };
  return { serial: null, mac: null };
}

const ROUTE_RE = /^\/api\/intake\/([^/]+)\/complete$/;

const action = defineHttpAction({
  key: 'intake-complete',
  label: 'Intake complete',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Intake complete API</p></div>',
  matches: (p, method) => ROUTE_RE.test(p) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!requireIntakeAuth(req, res)) return;

    const urlPath = (req.url || '').split('?')[0];
    const match = urlPath.match(ROUTE_RE);
    if (!match) return sendJson(res, 404, { error: 'not found' });

    const intakeKey = decodeURIComponent(match[1]);
    const { serial, mac } = parseIntakeKey(intakeKey);
    if (!serial && !mac) {
      return sendJson(res, 422, { error: 'invalid intake key' });
    }

    const itemRow = await queryOne<{
      ItemUUID: string; Artikel_Nummer: string | null;
      Hersteller: string | null; Kurzbeschreibung: string | null;
    }>(
      serial
        ? `SELECT i."ItemUUID", i."Artikel_Nummer", r."Hersteller", r."Kurzbeschreibung"
           FROM items i LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
           WHERE i."SerialNumber" = $1 LIMIT 1`
        : `SELECT i."ItemUUID", i."Artikel_Nummer", r."Hersteller", r."Kurzbeschreibung"
           FROM items i LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
           WHERE i."MacAddress" = $1 LIMIT 1`,
      [serial ?? mac]
    );

    if (!itemRow || !itemRow.Artikel_Nummer) {
      return sendJson(res, 404, { error: 'item not found or missing artikel number' });
    }

    const artikelbeschreibung = [itemRow.Hersteller, itemRow.Kurzbeschreibung]
      .filter(Boolean)
      .join(' ') || itemRow.Artikel_Nummer;

    try {
      const result = await forwardAgenticTrigger(
        {
          artikelNummer: itemRow.Artikel_Nummer,
          artikelbeschreibung,
          actor: 'intake-station',
        },
        {
          context: 'intake-complete',
          logger: console,
          service: {
            getAgenticRun: ctx.getAgenticRun,
            getItemReference: ctx.getItemReference,
            upsertAgenticRun: ctx.upsertAgenticRun,
            updateAgenticRunStatus: ctx.updateAgenticRunStatus,
            logEvent: ctx.logEvent,
            findByMaterial: ctx.findByMaterial,
            logger: console,
            now: () => new Date(),
            invokeModel: ctx.agenticInvokeModel,
          },
        }
      );

      return sendJson(res, result.ok ? 202 : result.status, {
        done: true,
        itemUUID: itemRow.ItemUUID,
        agentic: (result.body as any)?.agentic ?? null,
      });
    } catch (err) {
      console.error('[intake-complete] Agentic trigger failed', { intakeKey, error: err });
      return sendJson(res, 500, { error: 'agentic trigger failed' });
    }
  }
});

export default action;
