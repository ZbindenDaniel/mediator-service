import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import { defineHttpAction } from './index';
import { query, execute, insert } from '../db-client';
import { cupsLpinfo, cupsLpstat } from '../utils/cups-client';
import { syncPrinterQueuesToCups, removePrinterQueueFromCups } from '../utils/sync-printer-queues';
import { requireAdminAuth } from '../utils/admin-auth';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

interface PrinterQueueRow {
  name: string;
  device_uri: string;
  ppd_model: string;
  media: string;
  description: string;
  enabled: boolean;
  updated_at: string;
}

function extractQueueName(urlPath: string): string | null {
  const match = urlPath.match(/^\/api\/admin\/printer-queues\/([^/?]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

const action = defineHttpAction({
  key: 'admin-printer-queues',
  label: 'Admin: printer queues',
  appliesTo: () => false,
  matches: (path, method) => {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) return false;
    return path === '/api/admin/printer-queues' ||
           path === '/api/admin/cups-devices' ||
           path === '/api/admin/cups-ppds' ||
           path === '/api/admin/cups-diagnostics' ||
           /^\/api\/admin\/printer-queues\/[^/]+$/.test(path);
  },
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireAdminAuth(req, res)) return;
    const { url = '', method = '' } = req;
    const urlPath = url.split('?')[0];

    try {
      // GET /api/admin/cups-diagnostics — full CUPS state dump for debugging
      if (urlPath === '/api/admin/cups-diagnostics' && method === 'GET') {
        const run = async (args: string[]) => cupsLpstat(args).catch((e: Error) => `error: ${e.message}`);
        const readCache = (path: string) => { try { return fs.readFileSync(path, 'utf8').trim(); } catch { return null; } };

        const [printers, devices, jobs] = await Promise.all([
          run(['-p', '-l']),   // printer state + details
          run(['-v']),          // device URIs per queue
          run(['-o']),          // pending / active jobs
        ]);

        sendJson(res, 200, {
          printers,
          devices,
          jobs: jobs || '(no jobs)',
          devicesCache: readCache('/run/cups/devices.txt'),
          ppdsCache: readCache('/run/cups/ppds.txt'),
          note: 'rebuild cups container if lpadmin errors persist: docker compose up --build cups',
        });
        return;
      }

      // GET /api/admin/cups-devices — list physical devices detected by CUPS
      if (urlPath === '/api/admin/cups-devices' && method === 'GET') {
        let output: string;
        try {
          output = await cupsLpinfo(['-v']);
        } catch (err) {
          sendJson(res, 502, { error: `lpinfo: ${(err as Error).message}` });
          return;
        }
        const devices = output
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const spaceIdx = line.indexOf(' ');
            return spaceIdx > -1
              ? { type: line.slice(0, spaceIdx), uri: line.slice(spaceIdx + 1) }
              : { type: 'unknown', uri: line };
          });
        sendJson(res, 200, { devices });
        return;
      }

      // GET /api/admin/cups-ppds — list available PPD/driver models
      if (urlPath === '/api/admin/cups-ppds' && method === 'GET') {
        const rawQ = (url.split('?')[1] ?? '').split('&').find((p) => p.startsWith('q='));
        const filter = rawQ ? decodeURIComponent(rawQ.slice(2)).toLowerCase() : '';
        let output: string;
        try {
          output = await cupsLpinfo(['-m']);
        } catch (err) {
          sendJson(res, 502, { error: `lpinfo: ${(err as Error).message}` });
          return;
        }
        const models = output
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && (!filter || line.toLowerCase().includes(filter)))
          .map((line) => {
            const spaceIdx = line.indexOf(' ');
            return spaceIdx > -1
              ? { id: line.slice(0, spaceIdx), label: line.slice(spaceIdx + 1) }
              : { id: line, label: line };
          });
        sendJson(res, 200, { models });
        return;
      }

      // GET /api/admin/printer-queues — list all configured queues from DB
      if (urlPath === '/api/admin/printer-queues' && method === 'GET') {
        const rows = await query<PrinterQueueRow>(
          'SELECT name, device_uri, ppd_model, media, description, enabled, updated_at FROM printer_queues ORDER BY name'
        );
        sendJson(res, 200, { queues: rows });
        return;
      }

      // POST /api/admin/printer-queues — add a new queue
      if (urlPath === '/api/admin/printer-queues' && method === 'POST') {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as Partial<PrinterQueueRow>;
        const name = (body.name ?? '').trim();
        if (!name) { sendJson(res, 400, { error: 'name is required' }); return; }

        await execute(
          `INSERT INTO printer_queues (name, device_uri, ppd_model, media, description, enabled, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (name) DO UPDATE SET
             device_uri = EXCLUDED.device_uri,
             ppd_model = EXCLUDED.ppd_model,
             media = EXCLUDED.media,
             description = EXCLUDED.description,
             enabled = EXCLUDED.enabled,
             updated_at = NOW()`,
          [
            name,
            (body.device_uri ?? '').trim(),
            (body.ppd_model ?? '').trim(),
            (body.media ?? '').trim(),
            (body.description ?? '').trim(),
            body.enabled !== false,
          ]
        );

        await syncPrinterQueuesToCups();
        const row = await query<PrinterQueueRow>('SELECT * FROM printer_queues WHERE name = $1', [name]);
        sendJson(res, 201, { queue: row[0] });
        return;
      }

      // PUT /api/admin/printer-queues/:name — update a queue
      const queueName = extractQueueName(urlPath);
      if (queueName && method === 'PUT') {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as Partial<PrinterQueueRow>;

        const updated = await execute(
          `UPDATE printer_queues SET
             device_uri  = COALESCE($2, device_uri),
             ppd_model   = COALESCE($3, ppd_model),
             media       = COALESCE($4, media),
             description = COALESCE($5, description),
             enabled     = COALESCE($6, enabled),
             updated_at  = NOW()
           WHERE name = $1`,
          [
            queueName,
            body.device_uri !== undefined ? body.device_uri.trim() : null,
            body.ppd_model !== undefined ? body.ppd_model.trim() : null,
            body.media !== undefined ? body.media.trim() : null,
            body.description !== undefined ? body.description.trim() : null,
            body.enabled !== undefined ? body.enabled : null,
          ]
        );

        if (updated === 0) { sendJson(res, 404, { error: 'Queue not found' }); return; }

        await syncPrinterQueuesToCups();
        const row = await query<PrinterQueueRow>('SELECT * FROM printer_queues WHERE name = $1', [queueName]);
        sendJson(res, 200, { queue: row[0] });
        return;
      }

      // DELETE /api/admin/printer-queues/:name — remove a queue
      if (queueName && method === 'DELETE') {
        const deleted = await execute('DELETE FROM printer_queues WHERE name = $1', [queueName]);
        if (deleted === 0) { sendJson(res, 404, { error: 'Queue not found' }); return; }
        await removePrinterQueueFromCups(queueName);
        sendJson(res, 200, { deleted: queueName });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('[admin-printer-queues] Request failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Admin printer queues API</p></div>',
});

export default action;
