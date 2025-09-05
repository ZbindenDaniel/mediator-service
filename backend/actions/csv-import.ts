import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'csv-import',
  label: 'CSV import',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/import' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let name = (req.headers['x-filename'] || 'upload.csv').toString().replace(/[^\w.\-]/g, '_');
      if (!name.toLowerCase().endsWith('.csv')) name += '.csv';
      const tmpPath = path.join(ctx.INBOX_DIR, `${Date.now()}_${name}`);
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        fs.writeFileSync(tmpPath, body, 'utf8');
        sendJson(res, 200, { ok: true, message: `Saved to inbox as ${path.basename(tmpPath)}` });
      } catch (e) {
        console.error('CSV write failed', e);
        sendJson(res, 500, { error: (e as Error).message });
      }
    } catch (err) {
      console.error('CSV import failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">CSV import API</p></div>'
};

export default action;
