import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'qr-scan',
  label: 'QR scan audit log',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/qr-scan/log' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      if (!raw) {
        return sendJson(res, 400, { error: 'Request body required' });
      }

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        console.error('QR scan log payload is not valid JSON', err);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }

      const payload = data?.payload;
      if (!payload || typeof payload !== 'object') {
        return sendJson(res, 400, { error: 'payload object is required' });
      }

      const boxId = typeof payload.id === 'string' ? payload.id.trim() : '';
      if (!boxId) {
        return sendJson(res, 400, { error: 'payload.id is required' });
      }

      const actor = typeof data.actor === 'string' ? data.actor.trim() : null;
      const scannedAt = typeof data.scannedAt === 'string' && data.scannedAt
        ? data.scannedAt
        : new Date().toISOString();
      const source = typeof data.source === 'string' && data.source ? data.source : 'qr-scanner';

      ctx.logEvent({
        Actor: actor,
        EntityType: 'Box',
        EntityId: boxId,
        Event: 'QrScanned',
        Meta: JSON.stringify({
          payload,
          scannedAt,
          source,
          userAgent: req.headers['user-agent'] || null
        })
      });

      console.log('Logged QR scan event', { boxId, scannedAt, source });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('QR scan log handler failed', err);
      return sendJson(res, 500, { error: 'Internal error' });
    }
  },
  view: () => `
    <div class="card">
      <h3>QR-Scanner</h3>
      <p>Öffne den neuen QR-Scanner, um Behälter schnell im modernen UI aufzurufen.</p>
      <iframe
        src="/scan"
        title="QR-Scanner"
        style="width:100%;min-height:460px;border:0;border-radius:8px;background:#000;"
        allow="camera"
      ></iframe>
      <p class="muted">Sollte der Scanner nicht laden, öffne <a href="/scan" target="_blank" rel="noopener">/scan</a> in einem neuen Tab.</p>
    </div>
  `
});

export default action;
