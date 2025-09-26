import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { Box, BoxLabelPayload } from '../../models';

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

      const templatePath = '/print/box-label.html';
      try {
        const payload: BoxLabelPayload = {
          id: box.BoxID,
          location: box.Location || null,
          notes: box.Notes || null,
          placedBy: box.PlacedBy || null,
          placedAt: box.PlacedAt || null
        };

        try {
          ctx.logEvent.run({
            Actor: null,
            EntityType: 'Box',
            EntityId: box.BoxID,
            Event: 'PrintPayloadPrepared',
            Meta: JSON.stringify({ template: templatePath })
          });
        } catch (logErr) {
          console.error('Failed to log box print payload preparation', {
            id: box.BoxID,
            error: logErr
          });
        }

        return sendJson(res, 200, { template: templatePath, payload });
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
