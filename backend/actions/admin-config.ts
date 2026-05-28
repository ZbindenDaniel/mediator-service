import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import {
  MEDIA_STORAGE_MODE,
  ERP_SYNC_ENABLED,
  ERP_IMPORT_INCLUDE_MEDIA,
  ERP_IMPORT_URL,
  SHOPWARE_SYNC_ENABLED,
  PRINTER_QUEUE,
  PRINTER_SERVER,
} from '../config';
import { requireAdminAuth } from '../utils/admin-auth';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'admin-config',
  label: 'Admin: config',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/admin/config' && method === 'GET',
  handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireAdminAuth(req, res)) return;
    sendJson(res, 200, {
      mediaStorageMode: MEDIA_STORAGE_MODE,
      erpSyncEnabled: ERP_SYNC_ENABLED,
      erpImportIncludeMedia: ERP_IMPORT_INCLUDE_MEDIA,
      erpImportConfigured: Boolean(ERP_IMPORT_URL),
      shopwareSyncEnabled: SHOPWARE_SYNC_ENABLED,
      printerConfigured: Boolean(PRINTER_QUEUE || PRINTER_SERVER),
    });
  },
  view: () => '<div class="card"><p class="muted">Admin config API</p></div>'
});

export default action;
