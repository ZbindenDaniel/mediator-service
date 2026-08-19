import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import {
  listAgenticRunSnapshots,
  getAgenticRunSnapshotById,
  insertAgenticRunSnapshot,
  pruneAgenticRunSnapshots,
  getItemReference,
  persistItemReference,
  getAgenticRun,
  logEvent
} from '../db';
import { AGENTIC_SNAPSHOT_SCHEMA_VERSION, type ItemRef } from '../../models';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const LIST_RE = /^\/api\/(?:items|item-refs)\/([^/]+)\/agentic\/snapshots$/;
const RESTORE_RE = /^\/api\/(?:items|item-refs)\/([^/]+)\/agentic\/snapshots\/(\d+)\/restore$/;

function stripQuery(url: string): string {
  const q = url.indexOf('?');
  return q >= 0 ? url.slice(0, q) : url;
}

const action = defineHttpAction({
  key: 'agentic-snapshots',
  label: 'Agentic run snapshots',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => {
    const p = stripQuery(path);
    return (method === 'GET' && LIST_RE.test(p)) || (method === 'POST' && RESTORE_RE.test(p));
  },
  async handle(req: IncomingMessage, res: ServerResponse, _ctx: unknown) {
    if (!req.url) {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
    const path = stripQuery(req.url);

    // GET: list snapshots (newest first) for the item.
    const listMatch = path.match(LIST_RE);
    if (req.method === 'GET' && listMatch) {
      const artikelNummer = decodeURIComponent(listMatch[1]).trim();
      if (!artikelNummer || artikelNummer.startsWith('I-')) {
        return sendJson(res, 400, { error: 'Artikelnummer required' });
      }
      try {
        const snapshots = await listAgenticRunSnapshots(artikelNummer);
        return sendJson(res, 200, { snapshots });
      } catch (err) {
        console.error('[agentic-snapshots] Failed to list snapshots', { artikelNummer, error: err });
        return sendJson(res, 500, { error: 'Failed to list snapshots' });
      }
    }

    // POST: non-destructive restore — write a snapshot's fields back to the item AND record a new
    // `restore` snapshot so history is never lost.
    const restoreMatch = path.match(RESTORE_RE);
    if (req.method === 'POST' && restoreMatch) {
      const artikelNummer = decodeURIComponent(restoreMatch[1]).trim();
      const snapshotId = Number.parseInt(restoreMatch[2], 10);
      if (!artikelNummer || artikelNummer.startsWith('I-')) {
        return sendJson(res, 400, { error: 'Artikelnummer required' });
      }

      let rawBody = '';
      try {
        for await (const chunk of req) rawBody += chunk;
      } catch (err) {
        console.error('[agentic-snapshots] Failed to read restore body', err);
        return sendJson(res, 400, { error: 'Invalid request body' });
      }
      let payload: Record<string, unknown> = {};
      if (rawBody) {
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          return sendJson(res, 400, { error: 'Invalid JSON body' });
        }
      }
      const actor = typeof payload.actor === 'string' && payload.actor.trim() ? payload.actor.trim() : null;

      try {
        const snapshot = await getAgenticRunSnapshotById(snapshotId, artikelNummer);
        if (!snapshot) {
          return sendJson(res, 404, { error: 'Snapshot not found' });
        }
        const current = await getItemReference(artikelNummer);
        if (!current) {
          return sendJson(res, 404, { error: 'Item reference not found' });
        }

        // Overlay only the snapshot's captured fields; everything else on the ref is preserved.
        const restoredRef = { ...current, ...snapshot.Fields } as ItemRef;
        await persistItemReference(restoredRef);

        // Record the restore itself as a new version (non-destructive history).
        const run = await getAgenticRun(artikelNummer);
        await insertAgenticRunSnapshot({
          Artikel_Nummer: artikelNummer,
          RunId: run?.Id ?? null,
          Reason: 'restore',
          CapturedReviewState: run?.ReviewState ?? null,
          Actor: actor,
          TriggerReason: `restore-from:${snapshot.Id}`,
          SchemaVersion: AGENTIC_SNAPSHOT_SCHEMA_VERSION,
          Fields: snapshot.Fields
        });
        await pruneAgenticRunSnapshots(artikelNummer);

        try {
          await logEvent({
            Actor: actor ?? 'agentic-snapshots',
            EntityType: 'Item',
            EntityId: artikelNummer,
            Event: 'AgenticSnapshotRestored',
            Meta: JSON.stringify({ restoredFrom: snapshot.Id, restoredFromCreatedAt: snapshot.CreatedAt })
          });
        } catch (err) {
          console.warn('[agentic-snapshots] Failed to log restore event', { artikelNummer, error: err });
        }

        return sendJson(res, 200, { restoredFrom: snapshot.Id });
      } catch (err) {
        console.error('[agentic-snapshots] Failed to restore snapshot', { artikelNummer, snapshotId, error: err });
        return sendJson(res, 500, { error: 'Failed to restore snapshot' });
      }
    }

    return sendJson(res, 404, { error: 'Not found' });
  },
  view: () => '<div class="card"><p class="muted">Agentic run snapshots API</p></div>'
});

export default action;
