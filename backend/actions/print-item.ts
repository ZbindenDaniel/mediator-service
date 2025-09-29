import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { Item, ItemLabelPayload } from '../../models';
import { buildPrintPayload } from './print-shared';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'print-item',
  label: 'Print item label',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/print\/item\/[^/]+$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const m = req.url?.match(/^\/api\/print\/item\/([^/]+)$/);
      const id = m ? decodeURIComponent(m[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'invalid item id' });
      let item: Item | undefined;
      try {
        item = ctx.getItem.get(id) as Item | undefined;
      } catch (err) {
        console.error('Failed to load item for printing', { id, error: err });
        return sendJson(res, 500, { error: 'failed to load item' });
      }
      if (!item) {
        console.error('Item not found for printing', { id });
        return sendJson(res, 404, { error: 'item not found' });
      }

      let rawBody = '';
      for await (const chunk of req) rawBody += chunk;
      let actor = '';
      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody);
          actor = typeof parsed.actor === 'string' ? parsed.actor.trim() : '';
        } catch (parseErr) {
          console.error('Failed to parse item print request body', { id, error: parseErr });
          return sendJson(res, 400, { error: 'invalid request body' });
        }
      }
      if (!actor) {
        console.warn('Missing actor for item print request', { id });
        return sendJson(res, 400, { error: 'actor is required' });
      }

      const templatePath = '/print/item-label.html';
      try {
        const payloadBase = {
          id: item.ItemUUID,
          articleNumber: item.Artikel_Nummer || null,
          boxId: item.BoxID || null,
          location: item.Location || null
        } satisfies Omit<ItemLabelPayload, 'qrDataUri' | 'qrModules' | 'qrMargin'>;

        const { template, payload } = buildPrintPayload({
          templatePath,
          payloadBase,
          entityType: 'Item',
          entityId: item.ItemUUID,
          labelName: 'item label',
          logContext: 'item print payload preparation',
          logEvent: ctx.logEvent,
          logger: console,
          actor
        });

        return sendJson(res, 200, {
          template,
          payload
        });
      } catch (err) {
        console.error('Failed to prepare item label payload', { id: item.ItemUUID, error: err });
        return sendJson(res, 500, { error: 'failed to prepare template' });
      }
    } catch (err) {
      console.error('Print item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Print item API</p></div>'
};

export default action;
