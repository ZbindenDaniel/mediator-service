import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { AgenticRun } from '../../models';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'agentic-restart',
  label: 'Agentic restart',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => method === 'POST' && /^\/api\/items\/[^/]+\/agentic\/restart$/.test(path),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!req.url) {
      console.warn('Agentic restart called without URL');
      return sendJson(res, 400, { error: 'Invalid request' });
    }

    const match = req.url.match(/^\/api\/items\/([^/]+)\/agentic\/restart$/);
    const itemId = match ? decodeURIComponent(match[1]) : '';
    if (!itemId) {
      console.warn('Agentic restart missing item id');
      return sendJson(res, 400, { error: 'Invalid item id' });
    }

    let rawBody = '';
    try {
      for await (const chunk of req) rawBody += chunk;
    } catch (err) {
      console.error('Failed to read agentic restart payload', err);
      return sendJson(res, 400, { error: 'Invalid request body' });
    }

    let payload: any = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (err) {
        console.error('Failed to parse agentic restart payload', err);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }
    }

    const actor = typeof payload.actor === 'string' ? payload.actor.trim() : '';
    if (!actor) {
      console.warn('Agentic restart missing actor');
      return sendJson(res, 400, { error: 'actor is required' });
    }

    let existingRun: AgenticRun | undefined;
    try {
      existingRun = ctx.getAgenticRunForItem.get(itemId) as AgenticRun | undefined;
    } catch (err) {
      console.error('Failed to load existing agentic run for restart', err);
      return sendJson(res, 500, { error: 'Failed to load agentic run' });
    }

    if (!existingRun) {
      console.warn('Agentic restart requested for missing run', itemId);
      return sendJson(res, 404, { error: 'Agentic run not found' });
    }

    const restartTransaction = ctx.db.transaction((itemUUID: string) => {
      const resetStmt = ctx.db.prepare(`
        UPDATE agentic_runs
           SET Status='queued',
               TriggeredAt=datetime('now'),
               StartedAt=NULL,
               CompletedAt=NULL,
               FailedAt=NULL,
               NeedsReview=0,
               ReviewedBy=NULL,
               ReviewedAt=NULL,
               ReviewDecision=NULL,
               ReviewNotes=NULL
         WHERE ItemUUID = ?
      `);
      const result = resetStmt.run(itemUUID);
      if (!result || result.changes === 0) {
        throw new Error('No agentic run updated');
      }

      try {
        ctx.logEvent.run({
          Actor: actor,
          EntityType: 'Item',
          EntityId: itemUUID,
          Event: 'AgenticRunRestarted',
          Meta: JSON.stringify({ previousStatus: existingRun?.Status ?? null })
        });
      } catch (logErr) {
        console.error('Failed to log agentic restart event', logErr);
      }
    });

    try {
      restartTransaction(itemId);
    } catch (err) {
      console.error('Failed to reset agentic run state', err);
      return sendJson(res, 500, { error: 'Failed to restart agentic run' });
    }

    try {
      const refreshed = ctx.getAgenticRunForItem.get(itemId) || null;
      return sendJson(res, 200, { agentic: refreshed });
    } catch (err) {
      console.error('Failed to load refreshed agentic run after restart', err);
      return sendJson(res, 500, { error: 'Failed to load refreshed agentic run' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic restart API</p></div>'
};

export default action;
