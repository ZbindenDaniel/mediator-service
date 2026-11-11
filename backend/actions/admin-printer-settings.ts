import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import {
  PRINTER_SERVER,
  PRINTER_MODE,
  PRINTER_BROWSER_URL,
  PRINTER_QUEUE,
  PRINTER_QUEUE_BOX,
  PRINTER_QUEUE_ITEM,
  PRINTER_QUEUE_ITEM_SMALL,
  PRINTER_QUEUE_SHELF,
  PRINTER_QUEUE_MARKETING,
} from '../config';
import { getAllSettings, setSetting, clearSetting, hasOverride } from '../utils/app-settings';
import { requireSuperAdminAuth } from '../utils/admin-auth';

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
  { key: 'printer.mode',             field: 'mode',           envFallback: PRINTER_MODE },
  { key: 'printer.browser_url',      field: 'browserUrl',     envFallback: PRINTER_BROWSER_URL },
  { key: 'printer.server',           field: 'server',         envFallback: PRINTER_SERVER },
  { key: 'printer.queue.default',    field: 'queueDefault',   envFallback: PRINTER_QUEUE },
  { key: 'printer.queue.box',        field: 'queueBox',       envFallback: PRINTER_QUEUE_BOX },
  { key: 'printer.queue.item',       field: 'queueItem',      envFallback: PRINTER_QUEUE_ITEM },
  { key: 'printer.queue.item_small', field: 'queueItemSmall', envFallback: PRINTER_QUEUE_ITEM_SMALL },
  { key: 'printer.queue.shelf',      field: 'queueShelf',     envFallback: PRINTER_QUEUE_SHELF },
  { key: 'printer.queue.marketing',  field: 'queueMarketing', envFallback: PRINTER_QUEUE_MARKETING },
] as const;

export function validateSettingsBody(body: Record<string, string | null | undefined>): string | null {
  const mode = body.mode?.trim();
  if (mode && mode !== 'server' && mode !== 'browser') {
    return 'mode must be "server" or "browser"';
  }
  const browserUrl = body.browserUrl?.trim();
  if (browserUrl) {
    try {
      // A bare host:port is allowed (http:// is assumed, see normalizeBrowserUrl); other schemes are not.
      const parsed = new URL(browserUrl.includes('://') ? browserUrl : `http://${browserUrl}`);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'browserUrl must be an http(s) URL';
      }
    } catch {
      return 'browserUrl must be an http(s) URL';
    }
  }
  return null;
}

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
  feature: 'printing',
  key: 'admin-printer-settings',
  label: 'Admin: printer settings',
  appliesTo: () => false,
  matches: (path, method) =>
    path === '/api/admin/printer-settings' && (method === 'GET' || method === 'PUT'),
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireSuperAdminAuth(req, res)) return;
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, await buildSettingsResponse());
        return;
      }

      // PUT — update settings
      const raw = await readBody(req);
      const body = JSON.parse(raw) as Record<string, string | null | undefined>;

      const invalid = validateSettingsBody(body);
      if (invalid) {
        sendJson(res, 400, { error: invalid });
        return;
      }

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
