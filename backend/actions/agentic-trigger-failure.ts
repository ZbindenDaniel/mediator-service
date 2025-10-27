import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', (err) => reject(err));
  });
}

const action: Action = {
  key: 'agentic-trigger-failure',
  label: 'Agentic trigger failure',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => method === 'POST' && /^\/api\/items\/[^/]+\/agentic\/trigger-failure$/.test(path),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = req.url || '';
      const match = url.match(/^\/api\/items\/([^/]+)\/agentic\/trigger-failure$/);
      const itemId = match ? decodeURIComponent(match[1]) : '';

      if (!itemId) {
        console.warn('Agentic trigger failure called without item id');
        return sendJson(res, 400, { error: 'Invalid item id' });
      }

      let parsedBody: any = {};
      try {
        const raw = await readRequestBody(req);
        if (raw) {
          parsedBody = JSON.parse(raw);
        }
      } catch (bodyErr) {
        console.error('Failed to parse agentic trigger failure payload', bodyErr);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }

      const actor = typeof parsedBody.actor === 'string' && parsedBody.actor.trim() ? parsedBody.actor.trim() : 'agentic';
      const contextLabel = typeof parsedBody.context === 'string' && parsedBody.context.trim()
        ? parsedBody.context.trim()
        : null;
      const searchTerm = typeof parsedBody.search === 'string' && parsedBody.search.trim()
        ? parsedBody.search.trim()
        : (typeof parsedBody.searchTerm === 'string' && parsedBody.searchTerm.trim()
          ? parsedBody.searchTerm.trim()
          : null);

      const statusCode = typeof parsedBody.status === 'number' ? parsedBody.status : null;
      const responseBody = typeof parsedBody.responseBody === 'string' && parsedBody.responseBody.trim()
        ? parsedBody.responseBody
        : null;

      let errorText = '';
      const bodyError = parsedBody.error ?? parsedBody.errorMessage ?? null;
      if (typeof bodyError === 'string' && bodyError.trim()) {
        errorText = bodyError.trim();
      } else if (bodyError && typeof bodyError === 'object') {
        try {
          errorText = JSON.stringify(bodyError);
        } catch (stringifyErr) {
          console.warn('Failed to stringify agentic trigger failure error payload', stringifyErr);
        }
      }

      if (!errorText && statusCode) {
        errorText = `Agentic trigger failed with status ${statusCode}`;
      }

      const failureSummary = errorText || null;

      let failedAt: string | null = null;
      try {
        const row = ctx.db.prepare("SELECT datetime('now') as now").get();
        failedAt = row?.now ?? null;
      } catch (timeErr) {
        console.error('Failed to compute failure timestamp from database', timeErr);
      }
      if (!failedAt) {
        failedAt = new Date().toISOString();
      }

      const nowIso = failedAt || new Date().toISOString();
      const runUpdate = {
        ItemUUID: itemId,
        Status: 'failed',
        SearchQuery: searchTerm,
        LastModified: nowIso,
        ReviewState: 'not_required',
        ReviewedBy: null
      };

      try {
        const updateResult = ctx.updateAgenticRunStatus.run(runUpdate);
        if (!updateResult?.changes) {
          console.warn('Agentic run missing during failure update, creating new record', itemId);
          ctx.upsertAgenticRun.run({
            ...runUpdate,
          });
        }
      } catch (updateErr) {
        console.error('Failed to update agentic run after trigger failure', updateErr);
        return sendJson(res, 500, { error: 'Failed to update agentic run' });
      }

      ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: itemId,
        Event: 'AgenticTriggerFailed',
        Meta: JSON.stringify({
          context: contextLabel,
          searchTerm,
          error: failureSummary,
          status: statusCode,
          responseBody
        })
      });

      let updatedRun: any = null;
      try {
        updatedRun = ctx.getAgenticRun.get(itemId) || null;
      } catch (loadErr) {
        console.error('Failed to load updated agentic run after failure', loadErr);
      }

      return sendJson(res, 200, { agentic: updatedRun });
    } catch (err) {
      console.error('Agentic trigger failure handler crashed', err);
      return sendJson(res, 500, { error: 'Internal error' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic trigger failure API</p></div>'
};

export default action;
