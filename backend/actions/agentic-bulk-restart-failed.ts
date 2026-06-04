import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { query } from '../db-client';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'agentic-bulk-restart-failed',
  label: 'Agentic bulk restart failed',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/agentic/restart-failed' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    let rawBody = '';
    try {
      for await (const chunk of req) rawBody += chunk;
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }

    let actor = '';
    if (rawBody) {
      try {
        const body = JSON.parse(rawBody);
        actor = typeof body.actor === 'string' ? body.actor.trim() : '';
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }
    }

    if (!actor) {
      return sendJson(res, 400, { error: 'actor is required' });
    }

    let failedRuns: Array<{ Artikel_Nummer: string }> = [];
    try {
      failedRuns = await query<{ Artikel_Nummer: string }>(
        `SELECT "Artikel_Nummer" FROM agentic_runs WHERE "Status" = 'failed' AND "Artikel_Nummer" IS NOT NULL`,
        []
      );
    } catch (err) {
      console.error('[agentic-bulk-restart-failed] Failed to query failed runs', err);
      return sendJson(res, 500, { error: 'Failed to load failed runs' });
    }

    if (failedRuns.length === 0) {
      return sendJson(res, 200, { ok: true, restarted: 0, skipped: 0 });
    }

    const nowIso = new Date().toISOString();
    let restarted = 0;
    let skipped = 0;

    for (const run of failedRuns) {
      try {
        const identifier = run.Artikel_Nummer?.trim();
        if (!identifier) { skipped++; continue; }

        await ctx.upsertAgenticRun({
          Artikel_Nummer: identifier,
          SearchQuery: null,
          Status: 'queued',
          LastModified: nowIso,
          ReviewState: 'not_required',
          ReviewedBy: null,
          LastReviewDecision: null,
          LastReviewNotes: null,
          LastSearchLinksJson: null,
        });

        try {
          await ctx.logEvent({
            Actor: actor,
            EntityType: 'Item',
            EntityId: identifier,
            Event: 'AgenticSearchQueued',
            Meta: JSON.stringify({ mode: 'bulk-restart-failed' })
          });
        } catch (logErr) {
          console.error('[agentic-bulk-restart-failed] Failed to log event', identifier, logErr);
        }

        restarted++;
      } catch (err) {
        console.error('[agentic-bulk-restart-failed] Failed to requeue run', run.Artikel_Nummer, err);
        skipped++;
      }
    }

    sendJson(res, 200, { ok: true, restarted, skipped });
  },
  view: () => '<div class="card"><p class="muted">Agentic bulk restart failed API</p></div>'
});

export default action;
