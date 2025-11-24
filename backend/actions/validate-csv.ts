import fs from 'fs';
import path from 'path';
import os from 'os';
import type { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'csv-parse/sync';
import { defineHttpAction } from './index';
import { isSafeArchiveEntry, listZipEntries, normalizeArchiveFilename, readZipEntry } from '../utils/csv-utils';

// TODO(agent): Extend validation telemetry to surface ZIP extraction anomalies for upstream partners.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function validateRow(row: Record<string, any>): string[] {
  const errors: string[] = [];
  // if (!row.ItemUUID) errors.push('ItemUUID missing');
  // if (!row.BoxID) errors.push('BoxID missing');
  return errors;
}

const action = defineHttpAction({
  key: 'validate-csv',
  label: 'Validate CSV',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/import/validate' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse) {
    try {
      const archiveName = normalizeArchiveFilename(req.headers['x-filename']);
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const bodyBuffer = Buffer.concat(chunks);

      let itemsCsv: string | null = null;
      let boxesCsv: string | null = null;

      let tempDir: string | null = null;
      let archivePath: string | null = null;
      try {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'validate-archive-'));
        archivePath = path.join(tempDir, archiveName);
        await fs.promises.writeFile(archivePath, bodyBuffer);
        const entries = listZipEntries(archivePath).filter(isSafeArchiveEntry);

        for (const entryName of entries) {
          const normalizedPath = entryName.replace(/\\/g, '/');
          if (normalizedPath.endsWith('/')) continue;
          const lowerPath = normalizedPath.toLowerCase();

          if (/(^|\/)boxes\.csv$/.test(lowerPath)) {
            try {
              boxesCsv = (await readZipEntry(archivePath, entryName)).toString('utf8');
            } catch (bufferError) {
              console.error('[validate-csv] Failed to buffer boxes.csv', bufferError);
            }
            continue;
          }
          if (lowerPath.endsWith('.csv') && !itemsCsv) {
            try {
              itemsCsv = (await readZipEntry(archivePath, entryName)).toString('utf8');
            } catch (bufferError) {
              console.error('[validate-csv] Failed to buffer items CSV', bufferError);
            }
          }
        }
      } catch (zipError) {
        console.warn('[validate-csv] Treating payload as plain CSV after ZIP parse failure', {
          archiveName,
          zipError
        });
      } finally {
        if (tempDir) {
          try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
          } catch (cleanupError) {
            console.error('[validate-csv] Failed to clean up staged ZIP during validation', cleanupError);
          }
        }
      }

      if (!itemsCsv && !boxesCsv) {
        itemsCsv = bodyBuffer.toString('utf8');
      }

      let records: Record<string, any>[] = [];
      let boxesRecords: Record<string, any>[] = [];

      try {
        if (itemsCsv) {
          records = parse(itemsCsv, { columns: true, skip_empty_lines: true });
        }
      } catch (parseError) {
        console.error('[validate-csv] Failed to parse items.csv payload', parseError);
        return sendJson(res, 400, { error: 'The uploaded items.csv could not be parsed.' });
      }

      try {
        if (boxesCsv) {
          boxesRecords = parse(boxesCsv, { columns: true, skip_empty_lines: true });
        }
      } catch (boxParseError) {
        console.error('[validate-csv] Failed to parse boxes.csv payload', boxParseError);
        return sendJson(res, 400, { error: 'The uploaded boxes.csv could not be parsed.' });
      }

      const boxes = new Set<string>();
      const errors = records
        .map((row: any, idx: number) => {
          if (row.BoxID) boxes.add(String(row.BoxID));
          return { row: idx + 1, errors: validateRow(row), scope: 'items' };
        })
        .filter((r: any) => r.errors.length);

      const boxFileErrors = boxesRecords
        .map((row: any, idx: number) => {
          const rowErrors: string[] = [];
          if (!row.BoxID) {
            rowErrors.push('BoxID missing');
          }
          return { row: idx + 1, errors: rowErrors, scope: 'boxes' };
        })
        .filter((r) => r.errors.length);

      const itemCount = records.length;
      const boxCount = boxes.size;
      const boxesFileCount = boxesRecords.length;
      const combinedErrors = [...errors, ...boxFileErrors];

      if (combinedErrors.length) {
        console.error('CSV validation found errors', combinedErrors);
        return sendJson(res, 400, { ok: false, errors: combinedErrors, itemCount, boxCount, boxesFileCount });
      }
      console.log('CSV validation parsed', itemCount, 'items', boxCount, 'boxes', boxesFileCount, 'box rows');
      return sendJson(res, 200, { ok: true, itemCount, boxCount, boxesFileCount });
    } catch (err) {
      console.error('CSV validation failed', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">CSV validation API</p></div>'
});

export default action;
