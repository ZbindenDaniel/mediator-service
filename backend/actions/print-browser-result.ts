import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import type { PrintLabelType } from '../print';
import { resolveActor } from '../utils/actor';

// Browser-mode prints are sent by the browser, so the backend only learns the outcome when the
// browser reports it here. Only failures are logged, matching the server path (PrintSent is not logged).

const LABEL_TYPES: readonly PrintLabelType[] = ['box', 'item', 'smallitem', 'shelf', 'marketingsheet'];

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function asString(value: unknown, maxLength = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

const action = defineHttpAction({
  feature: 'printing',
  key: 'print-browser-result',
  label: 'Print result reported by the browser',
  appliesTo: () => false,
  matches: (p, m) => p === '/api/print/result' && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse((await readBody(req)) || '{}');
    } catch (err) {
      console.error('[print-browser-result] Invalid JSON body', err);
      return sendJson(res, 400, { error: 'invalid json' });
    }

    const labelType = asString(body.labelType) as PrintLabelType;
    const entityId = asString(body.entityId, 200);
    const actor = resolveActor(ctx, asString(body.actor, 200));
    if (!LABEL_TYPES.includes(labelType) || !entityId) {
      return sendJson(res, 400, { error: 'invalid label type or entity' });
    }
    if (!actor) {
      return sendJson(res, 400, { error: 'actor required' });
    }

    const sent = body.sent === true;
    const reason = asString(body.reason);
    const queue = asString(body.queue, 200);
    const logContext = { labelType, entityId, actor, queue, sent, reason };

    if (sent) {
      console.info('[print-browser-result] Browser reported print sent', logContext);
      return sendJson(res, 200, { ok: true });
    }

    console.warn('[print-browser-result] Browser reported print failure', logContext);
    try {
      await ctx.logEvent({
        Actor: actor,
        EntityType: labelType === 'box' || labelType === 'shelf' ? 'Box' : 'Item',
        EntityId: entityId,
        Event: 'PrintFailed',
        Meta: JSON.stringify({
          transport: 'browser-ipp',
          queue,
          reason: reason || 'unknown_error',
          labelType
        })
      });
    } catch (err) {
      console.error('[print-browser-result] Failed to log PrintFailed event', { ...logContext, error: err });
      return sendJson(res, 500, { error: 'log_failed' });
    }
    return sendJson(res, 200, { ok: true });
  },
  view: () => '<div class="card"><p class="muted">Browser print result API</p></div>'
});

export default action;
