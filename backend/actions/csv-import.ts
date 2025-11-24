import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { defineHttpAction } from './index';
import { ARCHIVE_DIR } from '../config';
import { MEDIA_DIR } from '../lib/media';
import { ingestBoxesCsv } from '../importer';
import {
  computeChecksum,
  extractZipEntryToPath,
  findArchiveDuplicate,
  isSafeArchiveEntry,
  listZipEntries,
  normalizeArchiveFilename,
  normalizeCsvFilenameFromArchive,
  readZipEntry,
  resolveSafePath
} from '../utils/csv-utils';

// TODO(agent): Harden ZIP payload validation to reject archives with unexpected executable content.

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
      const archiveName = normalizeArchiveFilename(req.headers['x-filename']);
      const normalizedCsvName = normalizeCsvFilenameFromArchive(req.headers['x-filename']);
      const uploadContext = {
        queuedCsv: null as string | null,
        duplicate: false,
        duplicateReason: '' as string | null,
        boxesProcessed: 0,
        mediaFiles: 0,
        message: ''
      };

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const body = Buffer.concat(chunks);

      let tempDir: string | null = null;
      let archivePath: string | null = null;
      try {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'import-archive-'));
        archivePath = path.join(tempDir, archiveName);
        await fs.promises.writeFile(archivePath, body);
      } catch (archiveError) {
        console.error('[csv-import] Failed to stage ZIP upload for processing', archiveError);
        return sendJson(res, 400, { error: 'Upload must be a ZIP archive containing items.csv and optional media.' });
      }

      const resolvedArchivePath = archivePath as string;
      const entries = listZipEntries(resolvedArchivePath).filter(isSafeArchiveEntry);
      if (entries.length === 0) {
        return sendJson(res, 400, { error: 'The ZIP archive did not contain any usable entries.' });
      }

      const requestUrl = new URL(req.url || '', 'http://localhost');
      const zeroStockParam = requestUrl.searchParams.get('zeroStock');
      const zeroStockRequested =
        typeof zeroStockParam === 'string' && ['1', 'true', 'yes', 'on'].includes(zeroStockParam.toLowerCase());

      let itemsBuffer: Buffer | null = null;
      let boxesBuffer: Buffer | null = null;

      for (const entryName of entries) {
        const normalizedPath = entryName.replace(/\\/g, '/');
        if (normalizedPath.endsWith('/')) {
          continue;
        }
        const lowerPath = normalizedPath.toLowerCase();

        if (/(^|\/)boxes\.csv$/.test(lowerPath)) {
          try {
            boxesBuffer = await readZipEntry(resolvedArchivePath, entryName);
          } catch (bufferError) {
            console.error('[csv-import] Failed to buffer boxes.csv from archive', bufferError);
          }
          continue;
        }

        if (lowerPath.endsWith('.csv') && !itemsBuffer) {
          try {
            itemsBuffer = await readZipEntry(resolvedArchivePath, entryName);
          } catch (bufferError) {
            console.error('[csv-import] Failed to buffer items CSV from archive', bufferError);
          }
          continue;
        }

        if (lowerPath.startsWith('media/')) {
          const relative = normalizedPath.slice('media/'.length);
          const safeTarget = resolveSafePath(MEDIA_DIR, relative);
          if (!safeTarget) {
            console.warn('[csv-import] Skipping media entry outside MEDIA_DIR bounds', { entry: normalizedPath });
            continue;
          }
          try {
            await fs.promises.mkdir(path.dirname(safeTarget), { recursive: true });
            await extractZipEntryToPath(resolvedArchivePath, entryName, safeTarget);
            uploadContext.mediaFiles += 1;
          } catch (mediaError) {
            console.error('[csv-import] Failed to persist media asset from archive', { entry: normalizedPath, mediaError });
          }
        }
      }

      if (boxesBuffer) {
        try {
          const { count } = await ingestBoxesCsv(boxesBuffer);
          uploadContext.boxesProcessed = count;
        } catch (boxesError) {
          console.error('[csv-import] Failed to ingest boxes.csv from archive', boxesError);
        }
      }

      if (itemsBuffer) {
        const checksum = computeChecksum(itemsBuffer);
        const duplicate = findArchiveDuplicate(ARCHIVE_DIR, normalizedCsvName, checksum);
        if (duplicate) {
          uploadContext.duplicate = true;
          uploadContext.duplicateReason = duplicate.reason;
          uploadContext.message = duplicate.reason === 'name'
            ? `A CSV named ${normalizedCsvName} has already been processed.`
            : 'An identical CSV payload has already been processed.';
          console.warn('[csv-import] Refusing duplicate CSV payload in archive', {
            archiveName,
            normalizedCsvName,
            duplicate,
          });
        } else {
          const tmpPath = path.join(ctx.INBOX_DIR, `${Date.now()}_${normalizedCsvName}`);
          if (zeroStockRequested && typeof ctx?.registerCsvIngestionOptions === 'function') {
            try {
              ctx.registerCsvIngestionOptions(tmpPath, { zeroStock: true });
              console.info('[csv-import] Zero stock override requested for uploaded CSV', {
                filename: normalizedCsvName,
              });
            } catch (registrationError) {
              console.error('[csv-import] Failed to register zero stock ingestion option', registrationError);
            }
          }

          try {
            fs.writeFileSync(tmpPath, itemsBuffer);
            uploadContext.queuedCsv = path.basename(tmpPath);
            uploadContext.message = `Saved to inbox as ${path.basename(tmpPath)}`;
          } catch (e) {
            console.error('CSV write failed', e);
            if (zeroStockRequested && typeof ctx?.clearCsvIngestionOptions === 'function') {
              try {
                ctx.clearCsvIngestionOptions(tmpPath);
              } catch (cleanupError) {
                console.error('[csv-import] Failed to clear zero stock ingestion option after write error', cleanupError);
              }
            }
            return sendJson(res, 500, { error: (e as Error).message });
          }
        }
      }

      if (!itemsBuffer && uploadContext.boxesProcessed === 0 && uploadContext.mediaFiles === 0) {
        return sendJson(res, 400, { error: 'The ZIP archive did not include items.csv, boxes.csv, or media assets.' });
      }

      return sendJson(res, uploadContext.duplicate ? 409 : 200, {
        ok: !uploadContext.duplicate,
        ...uploadContext
      });
    } catch (err) {
      console.error('CSV import failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    } finally {
      if (tempDir) {
        try {
          await fs.promises.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('[csv-import] Failed to clean up staged ZIP upload', cleanupError);
        }
      }
    }
  },
  view: () => '<div class="card"><p class="muted">CSV import API</p></div>'
});

export default action;
