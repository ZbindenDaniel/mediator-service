import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { Item, ItemLabelPayload } from '../../models';
import { generate, renderFromMatrix } from 'qrcode';

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

      const templatePath = '/print/item-label.html';
      try {
        const payloadBase = {
          id: item.ItemUUID,
          articleNumber: item.Artikel_Nummer || null,
          boxId: item.BoxID || null,
          location: item.Location || null
        } satisfies Omit<ItemLabelPayload, 'qrDataUri' | 'qrModules' | 'qrMargin'>;

        let qrDataUri: string | null = null;
        let qrModules: boolean[][] | null = null;
        let qrMargin = 4;
        const serialized = JSON.stringify(payloadBase);
        try {
          const qr = generate(serialized, { errorCorrectionLevel: 'M', margin: 4, scale: 8 });
          qrModules = qr.modules;
          qrMargin = qr.options.margin;
          try {
            qrDataUri = renderFromMatrix(qr.modules, qr.options);
          } catch (qrImageErr) {
            console.error('Failed to render QR data URI for item label', {
              id: item.ItemUUID,
              error: qrImageErr
            });
          }
        } catch (qrErr) {
          console.error('Failed to generate QR matrix for item label', {
            id: item.ItemUUID,
            error: qrErr
          });
        }

        const payload: ItemLabelPayload = {
          ...payloadBase,
          qrDataUri,
          qrModules,
          qrMargin
        };

        try {
          ctx.logEvent.run({
            Actor: null,
            EntityType: 'Item',
            EntityId: item.ItemUUID,
            Event: 'PrintPayloadPrepared',
            Meta: JSON.stringify({ template: templatePath })
          });
        } catch (logErr) {
          console.error('Failed to log item print payload preparation', {
            id: item.ItemUUID,
            error: logErr
          });
        }

        return sendJson(res, 200, { template: templatePath, payload });
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
