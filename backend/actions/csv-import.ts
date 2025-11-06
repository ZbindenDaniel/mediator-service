import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { defineHttpAction } from './index';
import { ARCHIVE_DIR } from '../config';
import { computeChecksum, findArchiveDuplicate, normalizeCsvFilename } from '../utils/csv-utils';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'csv-import',
  label: 'CSV import',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/import' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const normalizedName = normalizeCsvFilename(req.headers['x-filename']);
      const tmpPath = path.join(ctx.INBOX_DIR, `${Date.now()}_${normalizedName}`);
      // TODO: enforce file size limits and validate CSV content before writing
      let body = '';
      for await (const chunk of req) body += chunk;
      const checksum = computeChecksum(body);
      const duplicate = findArchiveDuplicate(ARCHIVE_DIR, normalizedName, checksum);
      if (duplicate) {
        console.warn(
          '[csv-import] Refusing duplicate upload',
          normalizedName,
          'duplicate reason:',
          duplicate.reason,
          'match:',
          duplicate.entry
        );
        return sendJson(res, 409, {
          error:
            duplicate.reason === 'name'
              ? `A CSV named ${normalizedName} has already been processed.`
              : 'An identical CSV payload has already been processed.'
        });
      }
      const requestUrl = new URL(req.url || '', 'http://localhost');
      const zeroStockParam = requestUrl.searchParams.get('zeroStock');
      const zeroStockRequested =
        typeof zeroStockParam === 'string'
        && ['1', 'true', 'yes', 'on'].includes(zeroStockParam.toLowerCase());
      if (zeroStockRequested && typeof ctx?.registerCsvIngestionOptions === 'function') {
        try {
          ctx.registerCsvIngestionOptions(tmpPath, { zeroStock: true });
          console.info('[csv-import] Zero stock override requested for uploaded CSV', {
            filename: normalizedName,
          });
        } catch (registrationError) {
          console.error('[csv-import] Failed to register zero stock ingestion option', registrationError);
        }
      }
      try {
        fs.writeFileSync(tmpPath, body, 'utf8');
        sendJson(res, 200, { ok: true, message: `Saved to inbox as ${path.basename(tmpPath)}` });
      } catch (e) {
        console.error('CSV write failed', e);
        if (zeroStockRequested && typeof ctx?.clearCsvIngestionOptions === 'function') {
          try {
            ctx.clearCsvIngestionOptions(tmpPath);
          } catch (cleanupError) {
            console.error('[csv-import] Failed to clear zero stock ingestion option after write error', cleanupError);
          }
        }
        sendJson(res, 500, { error: (e as Error).message });
      }
    } catch (err) {
      console.error('CSV import failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">CSV import API</p></div>'
});

export default action;
