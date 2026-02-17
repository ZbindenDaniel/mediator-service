import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { AGENTIC_RUN_STATUS_FAILED } from '../../models';
import { normalizeAgenticStatusUpdate } from '../agentic';
import type { AgenticRun } from '../../models';

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

function parseAgenticTriggerFailureRoute(path: string): { itemId: string; legacyRoute: boolean } | null {
  const legacyMatch = path.match(/^\/api\/items\/([^/]+)\/agentic\/trigger-failure$/);
  if (legacyMatch) {
    return { itemId: decodeURIComponent(legacyMatch[1]), legacyRoute: true };
  }
  const refMatch = path.match(/^\/api\/item-refs\/([^/]+)\/agentic\/trigger-failure$/);
  if (refMatch) {
    return { itemId: decodeURIComponent(refMatch[1]), legacyRoute: false };
  }
  return null;
}

function resolveArtikelNummerForAgentic(itemId: string, legacyRoute: boolean): string | null {
  const trimmed = typeof itemId === 'string' ? itemId.trim() : '';
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('I-')) {
    console.warn('[agentic-trigger-failure] Rejecting ItemUUID for agentic trigger failure', {
      itemId: trimmed,
      legacyRoute
    });
    return null;
  }
  return trimmed;
}

const action = defineHttpAction({
  key: 'agentic-trigger-failure',
  label: 'Agentic trigger failure',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) =>
    method === 'POST'
    && (
      /^\/api\/items\/[^/]+\/agentic\/trigger-failure$/.test(path)
      || /^\/api\/item-refs\/[^/]+\/agentic\/trigger-failure$/.test(path)
    ),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = req.url || '';
      const route = parseAgenticTriggerFailureRoute(url);
      const itemId = route?.itemId ? route.itemId.trim() : '';

      if (!itemId) {
        console.warn('Agentic trigger failure called without item id');
        return sendJson(res, 400, { error: 'Invalid item id' });
      }
      if (route?.legacyRoute) {
        console.warn('[agentic-trigger-failure] Legacy /api/items route used for trigger failure', {
          itemId,
          path: url
        });
      }
      const artikelNummer = resolveArtikelNummerForAgentic(itemId, Boolean(route?.legacyRoute));
      if (!artikelNummer) {
        console.warn('Agentic trigger failure missing Artikel_Nummer', { itemId });
        return sendJson(res, 400, { error: 'Missing Artikel_Nummer' });
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
      let existingRun: AgenticRun | null = null;
      try {
        existingRun = ctx.getAgenticRun.get(artikelNummer) || null;
      } catch (loadErr) {
        console.error('Failed to load existing agentic run for trigger failure metadata', loadErr);
      }
      const runUpdate = {
        Artikel_Nummer: artikelNummer,
        Status: AGENTIC_RUN_STATUS_FAILED,
        SearchQuery: searchTerm,
        LastModified: nowIso,
        ReviewState: 'not_required',
        // TODO(agentic-trigger-failure): Keep updateAgenticRunStatus bindings aligned with SQL flags.
        ReviewedBy: null,
        ReviewedByIsSet: 1,
        LastReviewDecision: existingRun?.LastReviewDecision ?? null,
        LastReviewDecisionIsSet: 1,
        LastReviewNotes: existingRun?.LastReviewNotes ?? null,
        LastReviewNotesIsSet: 1,
        RetryCount: existingRun?.RetryCount ?? 0,
        RetryCountIsSet: 1,
        NextRetryAt: existingRun?.NextRetryAt ?? null,
        NextRetryAtIsSet: 1,
        LastError: existingRun?.LastError ?? null,
        LastErrorIsSet: 1,
        LastAttemptAt: existingRun?.LastAttemptAt ?? null,
        LastAttemptAtIsSet: 1
      };

      try {
        const updateResult = ctx.updateAgenticRunStatus.run(normalizeAgenticStatusUpdate(runUpdate));
        if (!updateResult?.changes) {
          console.warn('Agentic run missing during failure update, creating new record', artikelNummer);
          ctx.upsertAgenticRun.run({
            ...runUpdate,
            LastSearchLinksJson: existingRun?.LastSearchLinksJson ?? null
          });
        }
      } catch (updateErr) {
        console.error('Failed to update agentic run after trigger failure', {
          artikelNummer,
          path: url,
          error: updateErr
        });
        return sendJson(res, 500, { error: 'Failed to update agentic run' });
      }

      ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: artikelNummer,
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
        updatedRun = ctx.getAgenticRun.get(artikelNummer) || null;
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
});

export default action;
