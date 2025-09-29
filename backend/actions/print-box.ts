import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { Box, BoxLabelPayload } from '../../models';
import { buildPrintPayload } from './print-shared';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'print-box',
  label: 'Print box label',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/print\/box\/[^/]+$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const m = req.url?.match(/^\/api\/print\/box\/([^/]+)$/);
      const id = m ? decodeURIComponent(m[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'invalid box id' });
      let box: Box | undefined;
      try {
        box = ctx.getBox.get(id) as Box | undefined;
      } catch (err) {
        console.error('Failed to load box for printing', { id, error: err });
        return sendJson(res, 500, { error: 'failed to load box' });
      }
      if (!box) {
        console.error('Box not found for printing', { id });
        return sendJson(res, 404, { error: 'box not found' });
      }

      let rawBody = '';
      for await (const chunk of req) rawBody += chunk;
      let actor = '';
      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody);
          actor = typeof parsed.actor === 'string' ? parsed.actor.trim() : '';
        } catch (parseErr) {
          console.error('Failed to parse box print request body', { id, error: parseErr });
          return sendJson(res, 400, { error: 'invalid request body' });
        }
      }
      if (!actor) {
        console.warn('Missing actor for box print request', { id });
        return sendJson(res, 400, { error: 'actor is required' });
      }

      const templatePath = '/print/box-label.html';
      try {
        const payloadBase = {
          id: box.BoxID,
          location: box.Location || null,
          notes: box.Notes || null,
          placedBy: box.PlacedBy || null,
          placedAt: box.PlacedAt || null
        } satisfies Omit<BoxLabelPayload, 'qrDataUri' | 'qrModules' | 'qrMargin'>;

        const { template, payload } = buildPrintPayload({
          templatePath,
          payloadBase,
          entityType: 'Box',
          entityId: box.BoxID,
          labelName: 'box label',
          logContext: 'box print payload preparation',
          logEvent: ctx.logEvent,
          logger: console,
          actor
        });

        return sendJson(res, 200, { template, payload });
      } catch (err) {
        console.error('Failed to prepare box label payload', { id: box.BoxID, error: err });
        return sendJson(res, 500, { error: 'failed to prepare template' });
      }
    } catch (err) {
      console.error('Print box failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Print box API</p></div>'
};

export default action;
