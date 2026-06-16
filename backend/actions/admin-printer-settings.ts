import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import {
  PRINTER_SERVER,
  PRINTER_QUEUE,
  PRINTER_QUEUE_BOX,
  PRINTER_QUEUE_ITEM,
  PRINTER_QUEUE_ITEM_SMALL,
  PRINTER_QUEUE_SHELF,
  PRINTER_QUEUE_MARKETING,
} from '../config';
import { getAllSettings, setSetting, clearSetting, hasOverride } from '../utils/app-settings';
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

const SETTING_DEFS = [
  { key: 'printer.server',           field: 'server',         envFallback: PRINTER_SERVER },
  { key: 'printer.queue.default',    field: 'queueDefault',   envFallback: PRINTER_QUEUE },
  { key: 'printer.queue.box',        field: 'queueBox',       envFallback: PRINTER_QUEUE_BOX },
  { key: 'printer.queue.item',       field: 'queueItem',      envFallback: PRINTER_QUEUE_ITEM },
  { key: 'printer.queue.item_small', field: 'queueItemSmall', envFallback: PRINTER_QUEUE_ITEM_SMALL },
  { key: 'printer.queue.shelf',      field: 'queueShelf',     envFallback: PRINTER_QUEUE_SHELF },
  { key: 'printer.queue.marketing',  field: 'queueMarketing', envFallback: PRINTER_QUEUE_MARKETING },
] as const;

async function buildSettingsResponse() {
  const envMap = Object.fromEntries(SETTING_DEFS.map((d) => [d.key, d.envFallback]));
  const values = await getAllSettings(envMap);
  const result: Record<string, { value: string; source: 'db' | 'env' }> = {};
  for (const def of SETTING_DEFS) {
    const override = await hasOverride(def.key);
    result[def.field] = { value: values[def.key], source: override ? 'db' : 'env' };
  }
  return result;
}

const action = defineHttpAction({
  key: 'admin-printer-settings',
  label: 'Admin: printer settings',
  appliesTo: () => false,
  matches: (path, method) =>
    path === '/api/admin/printer-settings' && (method === 'GET' || method === 'PUT'),
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireAdminAuth(req, res)) return;
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, await buildSettingsResponse());
        return;
      }

      // PUT — update settings
      const raw = await readBody(req);
      const body = JSON.parse(raw) as Record<string, string | null | undefined>;

      for (const def of SETTING_DEFS) {
        const incoming = body[def.field];
        if (incoming === undefined) continue;
        if (incoming === null || incoming === '') {
          await clearSetting(def.key);
        } else {
          await setSetting(def.key, incoming.trim());
        }
      }

      console.info('[admin-printer-settings] Settings updated');
      sendJson(res, 200, await buildSettingsResponse());
    } catch (err) {
      console.error('[admin-printer-settings] Request failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Admin printer settings API</p></div>',
});

export default action;
