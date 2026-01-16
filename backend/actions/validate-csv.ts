import fs from 'fs';
import path from 'path';
import os from 'os';
import type { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'csv-parse/sync';
import { spawnSync } from 'child_process';
import { defineHttpAction } from './index';
import { detectLegacySchema, logUnknownColumns } from '../importer';
import { isSafeArchiveEntry, listZipEntries, normalizeArchiveFilename, readZipEntry } from '../utils/csv-utils';

// TODO(agent): Extend validation telemetry to surface ZIP extraction anomalies for upstream partners.
// TODO(agent): Consider caching unzip availability checks if ZIP validation traffic spikes.
// TODO(agent): Revisit legacy schema validation once CSV importers enforce stricter header requirements.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function hasZipMagic(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] <= 0x05 && buffer[3] <= 0x06;
}

function isZipUpload(filenameHeader: unknown, buffer: Buffer): boolean {
  const headerValue = Array.isArray(filenameHeader) ? filenameHeader[0] : filenameHeader;
  const headerLooksZip = typeof headerValue === 'string' && /\.zip$/i.test(headerValue.trim());
  return headerLooksZip || hasZipMagic(buffer);
}

function verifyUnzipAvailability(): { ok: boolean; warning?: string } {
  try {
    const result = spawnSync('unzip', ['-v'], { stdio: 'ignore' });
    if (result.status === 0) {
      return { ok: true };
    }
    const warning = `unzip exited with code ${result.status ?? 'unknown'}`;
    console.warn('[validate-csv] unzip availability check returned non-zero status', warning);
    return { ok: false, warning };
  } catch (error) {
    console.error('[validate-csv] unzip binary unavailable', error);
    return { ok: false, warning: 'unzip binary unavailable for ZIP validation' };
  }
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
      const filenameHeader = req.headers['x-filename'];
      const archiveName = normalizeArchiveFilename(filenameHeader);
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const bodyBuffer = Buffer.concat(chunks);

      let itemsCsv: string | null = null;
      let boxesCsv: string | null = null;

      const zipPayload = isZipUpload(filenameHeader, bodyBuffer);

      if (zipPayload) {
        const unzipStatus = verifyUnzipAvailability();
        if (!unzipStatus.ok) {
          return sendJson(res, 500, {
            error: 'ZIP validation is unavailable because unzip is not installed or failed to run.',
            warning: unzipStatus.warning
          });
        }

        let tempDir: string | null = null;
        let archivePath: string | null = null;
        try {
          tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'validate-archive-'));
          archivePath = path.join(tempDir, archiveName);
          await fs.promises.writeFile(archivePath, bodyBuffer);

          let entries: string[] = [];
          try {
            entries = listZipEntries(archivePath).filter(isSafeArchiveEntry);
          } catch (listError) {
            console.error('[validate-csv] Failed to enumerate ZIP entries for validation', listError);
          }

          if (!entries.length) {
            console.warn('[validate-csv] No entries discovered in ZIP upload', { archiveName });
            return sendJson(res, 400, {
              error: 'No CSV files were found in the uploaded ZIP. Please include items.csv or boxes.csv.'
            });
          }

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
          console.warn('[validate-csv] ZIP parsing failed prior to CSV detection', {
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
          console.warn('[validate-csv] ZIP upload missing expected CSV files', { archiveName });
          return sendJson(res, 400, {
            error: 'ZIP upload missing items.csv or boxes.csv; include at least one CSV file.'
          });
        }
      } else {
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

      const headerKeys = records.length > 0 ? Object.keys(records[0]) : [];
      logUnknownColumns(headerKeys);
      const legacySchema = detectLegacySchema(headerKeys);
      if (legacySchema.detected) {
        console.info('[validate-csv] Detected legacy CSV schema headers', {
          matchedHeaders: legacySchema.matches,
          versionFlag: legacySchema.versionFlag,
        });
      }

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
