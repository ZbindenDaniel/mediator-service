import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { defineHttpAction } from './index';
import { ARCHIVE_DIR } from '../config';
import { MEDIA_DIR } from '../lib/media';
import { ingestBoxesCsv, ingestEventsCsv } from '../importer';
import { ingestAgenticRunsCsv, ingestBoxesCsv } from '../importer';
import {
  computeChecksum,
  extractZipEntryToPath,
  findArchiveDuplicate,
  isSafeArchiveEntry,
  listZipEntries,
  normalizeArchiveFilename,
  normalizeCsvFilenameFromArchive,
  readZipEntry,
  resolveSafePath,
  ZipProcessError
} from '../utils/csv-utils';

// TODO(agent): Harden ZIP payload validation to reject archives with unexpected executable content.
// TODO(agent): Revisit staging and extraction thresholds once upload telemetry is available.
// TODO(agent): Document boxes-only archive handling once importer alias fixes ship.
// TODO(agent): Surface legacy schema detection telemetry in the CSV import handler once headers are inspected.
// TODO(agent): Review events.csv ingestion telemetry once live import payloads are available.
// TODO(agent): Capture agentic_runs.csv archive ingestion telemetry once CSV imports include agentic runs.

const STAGING_TIMEOUT_MS = 30_000;
const ENTRY_TIMEOUT_MS = 45_000;
const MAX_ARCHIVE_BYTES = 90 * 1024 * 1024; // 75MB guardrail to prevent runaway buffering

let tempDir: string | null = null;

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
      // TODO(agent): Keep unzip timeout and abort logic configurable for different deployment environments.
      const uploadContext = {
        queuedCsv: null as string | null,
        duplicate: false,
        duplicateReason: '' as string | null,
        boxesProcessed: 0,
        eventsProcessed: 0,
        agenticRunsProcessed: 0,
        mediaFiles: 0,
        message: ''
      };

      const unzipController = new AbortController();
      const unzipOptions = { signal: unzipController.signal, timeoutMs: 20000 };

      const bufferingStartedAt = Date.now();
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const bufferingCompletedAt = Date.now();
      const bufferingDuration = bufferingCompletedAt - bufferingStartedAt;
      if (bufferingDuration > STAGING_TIMEOUT_MS) {
        console.warn('[csv-import] Upload buffering exceeded timeout threshold', {
          bufferingDuration,
          maxDuration: STAGING_TIMEOUT_MS,
        });
        return sendJson(res, 408, { error: 'Upload buffering exceeded time limit.' });
      }

      if (body.length > MAX_ARCHIVE_BYTES) {
        console.warn('[csv-import] Upload body rejected for exceeding size limit', {
          bytesReceived: body.length,
          maxBytes: MAX_ARCHIVE_BYTES,
        });
        return sendJson(res, 413, { error: 'Upload exceeds maximum allowed size.' });
      }

      console.info('[csv-import] Buffered upload body', {
        bytesReceived: body.length,
        bufferingDuration,
      });

      let archivePath: string | null = null;
      const stagingStartedAt = Date.now();
      try {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'import-archive-'));
        archivePath = path.join(tempDir, archiveName);
        await fs.promises.writeFile(archivePath, body);
      } catch (archiveError) {
        console.error('[csv-import] Failed to stage ZIP upload for processing', archiveError);
        return sendJson(res, 400, { error: 'Upload must be a ZIP archive containing items.csv and optional media.' });
      }
      const stagingDuration = Date.now() - stagingStartedAt;
      if (stagingDuration > STAGING_TIMEOUT_MS) {
        console.warn('[csv-import] Archive staging exceeded timeout threshold', {
          stagingDuration,
          maxDuration: STAGING_TIMEOUT_MS,
        });
        return sendJson(res, 408, { error: 'Upload staging exceeded time limit.' });
      }

      console.info('[csv-import] Staged archive to temp directory', {
        archivePath,
        stagingDuration,
      });

      const resolvedArchivePath = archivePath as string;
      const entries = listZipEntries(resolvedArchivePath).filter(isSafeArchiveEntry);
      if (entries.length === 0) {
        return sendJson(res, 400, { error: 'The ZIP archive did not contain any usable entries.' });
      }

      console.info('[csv-import] Enumerated archive entries', {
        archiveName,
        entryCount: entries.length,
      });

      const requestUrl = new URL(req.url || '', 'http://localhost');
      const zeroStockParam = requestUrl.searchParams.get('zeroStock');
      const zeroStockRequested =
        typeof zeroStockParam === 'string' && ['1', 'true', 'yes', 'on'].includes(zeroStockParam.toLowerCase());

      let itemsBuffer: Buffer | null = null;
      let boxesBuffer: Buffer | null = null;
      let eventsBuffer: Buffer | null = null;
      let agenticRunsBuffer: Buffer | null = null;

      const extractionStartedAt = Date.now();
      for (const entryName of entries) {
        if (Date.now() - extractionStartedAt > ENTRY_TIMEOUT_MS) {
          console.warn('[csv-import] Extraction aborted after exceeding time budget', {
            maxDuration: ENTRY_TIMEOUT_MS,
          });
          return sendJson(res, 408, { error: 'Archive extraction exceeded time limit.' });
        }

        const normalizedPath = entryName.replace(/\\/g, '/');
        if (normalizedPath.endsWith('/')) {
          continue;
        }
        const lowerPath = normalizedPath.toLowerCase();

        if (/(^|\/)boxes\.csv$/.test(lowerPath)) {
          try {
            const entryStartedAt = Date.now();
            boxesBuffer = await readZipEntry(resolvedArchivePath, entryName, unzipOptions);
            const entryDuration = Date.now() - entryStartedAt;
            if (entryDuration > ENTRY_TIMEOUT_MS) {
              console.warn('[csv-import] boxes.csv extraction exceeded time limit', {
                entryDuration,
                maxDuration: ENTRY_TIMEOUT_MS,
              });
              return sendJson(res, 408, { error: 'boxes.csv extraction exceeded time limit.' });
            }
            console.info('[csv-import] Buffered boxes.csv from archive', {
              bytesBuffered: boxesBuffer?.length ?? 0,
              entryDuration,
            });
          } catch (bufferError) {
            console.error('[csv-import] Failed to buffer boxes.csv from archive', bufferError);
            const isClientZipIssue = bufferError instanceof ZipProcessError && ['password', 'timeout'].includes(bufferError.kind);
            const status = isClientZipIssue ? 400 : 500;
            const message = bufferError instanceof ZipProcessError
              ? bufferError.message
              : 'Unexpected error buffering boxes.csv from archive.';
            return sendJson(res, status, { error: message });
          }
          continue;
        }

        if (/(^|\/)events\.csv$/.test(lowerPath)) {
          try {
            const entryStartedAt = Date.now();
            eventsBuffer = await readZipEntry(resolvedArchivePath, entryName, unzipOptions);
            const entryDuration = Date.now() - entryStartedAt;
            if (entryDuration > ENTRY_TIMEOUT_MS) {
              console.warn('[csv-import] events.csv extraction exceeded time limit', {
                entryDuration,
                maxDuration: ENTRY_TIMEOUT_MS,
              });
              return sendJson(res, 408, { error: 'events.csv extraction exceeded time limit.' });
            }
            console.info('[csv-import] Buffered events.csv from archive', {
              bytesBuffered: eventsBuffer?.length ?? 0,
              entryDuration,
            });
          } catch (bufferError) {
            console.error('[csv-import] Failed to buffer events.csv from archive', bufferError);
            
        if (/(^|\/)agentic_runs\.csv$/.test(lowerPath)) {
          try {
            const entryStartedAt = Date.now();
            agenticRunsBuffer = await readZipEntry(resolvedArchivePath, entryName, unzipOptions);
            const entryDuration = Date.now() - entryStartedAt;
            if (entryDuration > ENTRY_TIMEOUT_MS) {
              console.warn('[csv-import] agentic_runs.csv extraction exceeded time limit', {
                entryDuration,
                maxDuration: ENTRY_TIMEOUT_MS,
              });
              return sendJson(res, 408, { error: 'agentic_runs.csv extraction exceeded time limit.' });
            }
            console.info('[csv-import] Buffered agentic_runs.csv from archive', {
              bytesBuffered: agenticRunsBuffer?.length ?? 0,
              entryDuration,
            });
          } catch (bufferError) {
            console.error('[csv-import] Failed to buffer agentic_runs.csv from archive', bufferError);
            const isClientZipIssue = bufferError instanceof ZipProcessError && ['password', 'timeout'].includes(bufferError.kind);
            const status = isClientZipIssue ? 400 : 500;
            const message = bufferError instanceof ZipProcessError
              ? bufferError.message
              : 'Unexpected error buffering csv from archive.';
            return sendJson(res, status, { error: message });
          }
          continue;
        }

        if (lowerPath.endsWith('.csv') && !itemsBuffer) {
          try {
            const entryStartedAt = Date.now();
            itemsBuffer = await readZipEntry(resolvedArchivePath, entryName, unzipOptions);
            const entryDuration = Date.now() - entryStartedAt;
            if (entryDuration > ENTRY_TIMEOUT_MS) {
              console.warn('[csv-import] items.csv extraction exceeded time limit', {
                entryDuration,
                maxDuration: ENTRY_TIMEOUT_MS,
              });
              return sendJson(res, 408, { error: 'items.csv extraction exceeded time limit.' });
            }
            console.info('[csv-import] Buffered items CSV from archive', {
              bytesBuffered: itemsBuffer?.length ?? 0,
              entryDuration,
            });
          } catch (bufferError) {
            console.error('[csv-import] Failed to buffer items CSV from archive', bufferError);
            const isClientZipIssue = bufferError instanceof ZipProcessError && ['password', 'timeout'].includes(bufferError.kind);
            const status = isClientZipIssue ? 400 : 500;
            const message = bufferError instanceof ZipProcessError
              ? bufferError.message
              : 'Unexpected error buffering CSV from archive.';
            return sendJson(res, status, { error: message });
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
            const entryStartedAt = Date.now();
            await fs.promises.mkdir(path.dirname(safeTarget), { recursive: true });
            await extractZipEntryToPath(resolvedArchivePath, entryName, safeTarget, unzipOptions);
            const entryDuration = Date.now() - entryStartedAt;
            if (entryDuration > ENTRY_TIMEOUT_MS) {
              console.warn('[csv-import] Media extraction exceeded time limit', {
                entry: normalizedPath,
                entryDuration,
                maxDuration: ENTRY_TIMEOUT_MS,
              });
              return sendJson(res, 408, { error: `Media extraction exceeded time limit for ${normalizedPath}.` });
            }
            uploadContext.mediaFiles += 1;
            console.info('[csv-import] Extracted media asset', {
              entry: normalizedPath,
              entryDuration,
              mediaCount: uploadContext.mediaFiles,
            });
          } catch (mediaError) {
            console.error('[csv-import] Failed to persist media asset from archive', { entry: normalizedPath, mediaError });
            const isClientZipIssue = mediaError instanceof ZipProcessError && ['password', 'timeout'].includes(mediaError.kind);
            const status = isClientZipIssue ? 400 : 500;
            return sendJson(res, status, { error: mediaError instanceof Error ? mediaError.message : 'Failed to extract media.' });
          }
        }
      }

      console.info('[csv-import] Completed archive extraction pass', {
        itemsBuffered: Boolean(itemsBuffer),
        boxesBuffered: Boolean(boxesBuffer),
        eventsBuffered: Boolean(eventsBuffer),
        agenticBuffered: Boolean(agenticRunsBuffer),
        mediaFiles: uploadContext.mediaFiles,
        extractionDuration: Date.now() - extractionStartedAt,
      });

      if (boxesBuffer) {
        try {
          const { count } = await ingestBoxesCsv(boxesBuffer);
          uploadContext.boxesProcessed = count;
          if (!itemsBuffer) {
            console.info('[csv-import] Completed boxes-only archive ingestion', {
              boxesProcessed: count,
            });
            if (!uploadContext.message) {
              uploadContext.message = `Processed boxes.csv with ${count} row${count === 1 ? '' : 's'}.`;
            }
          }
        } catch (boxesError) {
          console.error('[csv-import] Failed to ingest boxes.csv from archive', boxesError);
        }
      }

      if (eventsBuffer) {
        try {
          const { count } = await ingestEventsCsv(eventsBuffer);
          uploadContext.eventsProcessed = count;
          if (!itemsBuffer && !boxesBuffer) {
            console.info('[csv-import] Completed events-only archive ingestion', {
              eventsProcessed: count,
            });
            if (!uploadContext.message) {
              uploadContext.message = `Processed events.csv with ${count} row${count === 1 ? '' : 's'}.`;
            }
          }
        } catch (eventsError) {
          console.error('[csv-import] Failed to ingest events.csv from archive', eventsError);
          
      if (agenticRunsBuffer) {
        try {
          const { count } = await ingestAgenticRunsCsv(agenticRunsBuffer);
          uploadContext.agenticRunsProcessed = count;
          console.info('[csv-import] Completed agentic_runs.csv ingestion', {
            rowsProcessed: count,
          });
        } catch (agenticError) {
          console.error('[csv-import] Failed to ingest agentic_runs.csv from archive', agenticError);
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

      if (!itemsBuffer && !boxesBuffer && !eventsBuffer && uploadContext.mediaFiles === 0) {
        return sendJson(res, 400, { error: 'The ZIP archive did not include items.csv, boxes.csv, events.csv, or media assets.' });
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
