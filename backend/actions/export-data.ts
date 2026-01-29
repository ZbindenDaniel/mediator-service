import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import type { IncomingMessage, ServerResponse } from 'http';
import { PUBLIC_ORIGIN } from '../config';
import { eventLabel } from '../../models/event-labels';
import { defineHttpAction } from './index';
import { stageItemsExport } from './export-items';

// TODO(export-data): Confirm default entity list and format expectations once API consumers are documented.

type ExportEntity = 'items' | 'boxes' | 'agentic' | 'events';
type ExportFormat = 'zip' | 'json';
type ExportMode = 'backup' | 'erp';

const ALLOWED_ENTITIES = new Set<ExportEntity>(['items', 'boxes', 'agentic', 'events']);
const DEFAULT_ENTITIES: ExportEntity[] = ['items', 'boxes', 'agentic', 'events'];
const DEFAULT_FORMAT: ExportFormat = 'zip';
const DEFAULT_EXPORT_MODE: ExportMode = 'backup';
const EXPORT_MODES = new Set<ExportMode>(['backup', 'erp']);

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

const AGENTIC_COLUMNS = [
  'Id',
  'Artikel_Nummer',
  'SearchQuery',
  'Status',
  'LastModified',
  'ReviewState',
  'ReviewedBy',
  'LastReviewDecision',
  'LastReviewNotes',
  'RetryCount',
  'NextRetryAt',
  'LastError',
  'LastAttemptAt'
] as const;

const EVENT_COLUMNS = [
  'Id',
  'CreatedAt',
  'Actor',
  'EntityType',
  'EntityId',
  'Event',
  'EventLabel',
  'Level',
  'Meta'
] as const;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseLimit(raw: string | null): { value: number; adjusted: boolean } {
  if (!raw) {
    return { value: DEFAULT_LIMIT, adjusted: false };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return { value: DEFAULT_LIMIT, adjusted: true };
  }
  const normalized = Math.min(Math.max(1, Math.floor(parsed)), MAX_LIMIT);
  return { value: normalized, adjusted: normalized !== parsed };
}

function parseEntities(raw: string | null): { entities: ExportEntity[]; invalid: string[]; usedDefault: boolean } {
  if (!raw) {
    return { entities: [...DEFAULT_ENTITIES], invalid: [], usedDefault: true };
  }
  const tokens = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) {
    return { entities: [...DEFAULT_ENTITIES], invalid: [], usedDefault: true };
  }
  const entities: ExportEntity[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    if (ALLOWED_ENTITIES.has(token as ExportEntity)) {
      const entity = token as ExportEntity;
      if (!entities.includes(entity)) {
        entities.push(entity);
      }
    } else {
      invalid.push(token);
    }
  }
  return { entities, invalid, usedDefault: false };
}

function parseFormat(raw: string | null): ExportFormat | null {
  if (!raw) {
    return DEFAULT_FORMAT;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'zip' || normalized === 'json') {
    return normalized;
  }
  return null;
}

function parseExportMode(raw: string | null): { mode: ExportMode; source: 'default' | 'explicit' } {
  if (!raw) {
    return { mode: DEFAULT_EXPORT_MODE, source: 'default' };
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return { mode: DEFAULT_EXPORT_MODE, source: 'default' };
  }
  if (!EXPORT_MODES.has(normalized as ExportMode)) {
    throw new Error(`Unsupported export mode: ${raw}`);
  }
  return { mode: normalized as ExportMode, source: 'explicit' };
}

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

function serializeRowsToCsv<T extends Record<string, unknown>>(rows: T[], columns: readonly string[]): string {
  const header = columns.join(',');
  const lines = rows.map((row) => columns.map((column) => toCsvValue(row[column])).join(','));
  return [header, ...lines].join('\n');
}

interface ZipArchiveOptions {
  archiveName: string;
  cwd: string;
  entries: string[];
  logger: Pick<Console, 'error' | 'info' | 'warn'>;
}

async function createZipArchive(options: ZipArchiveOptions): Promise<void> {
  const { archiveName, cwd, entries, logger } = options;
  const zipArgs = ['-r', archiveName, ...entries];

  await new Promise<void>((resolve, reject) => {
    const zipProc = spawn('zip', zipArgs, { cwd });

    zipProc.stderr.on('data', (data: Buffer) => {
      logger.warn?.('[export-data] zip stderr', data.toString());
    });

    zipProc.on('error', (zipError) => {
      logger.error?.('[export-data] Failed to spawn zip process', zipError);
      reject(zipError);
    });

    zipProc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      logger.error?.('[export-data] zip process exited with error code', { code });
      reject(new Error(`zip exited with code ${code}`));
    });
  });
}

const action = defineHttpAction({
  key: 'export-data',
  label: 'Export data',
  appliesTo: () => false,
  matches: (pathName, method) => method === 'GET' && pathName === '/api/export/data',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    let requestUrl: URL;
    try {
      requestUrl = new URL(req.url || '/', PUBLIC_ORIGIN);
    } catch (error) {
      console.error('[export-data] Failed to parse request URL', { error });
      return sendJson(res, 400, { error: 'Invalid request URL' });
    }

    const format = parseFormat(requestUrl.searchParams.get('format'));
    if (!format) {
      console.warn('[export-data] Unsupported export format requested', {
        format: requestUrl.searchParams.get('format')
      });
      return sendJson(res, 400, { error: 'format must be zip or json' });
    }

    let exportMode: ExportMode;
    let exportModeSource: 'default' | 'explicit';
    try {
      ({ mode: exportMode, source: exportModeSource } = parseExportMode(requestUrl.searchParams.get('mode')));
    } catch (modeError) {
      console.error('[export-data] Invalid export mode requested', {
        mode: requestUrl.searchParams.get('mode'),
        error: modeError
      });
      return sendJson(res, 400, { error: 'mode must be backup or erp' });
    }

    const { entities, invalid, usedDefault } = parseEntities(requestUrl.searchParams.get('entities'));
    if (invalid.length > 0) {
      console.warn('[export-data] Ignoring unknown export entities', { invalid });
    }
    if (entities.length === 0) {
      return sendJson(res, 400, { error: 'No valid entities requested' });
    }

    const createdAfter = requestUrl.searchParams.get('createdAfter');
    const updatedAfter = requestUrl.searchParams.get('updatedAfter');
    const { value: limit, adjusted: limitAdjusted } = parseLimit(requestUrl.searchParams.get('limit'));

    try {
      console.info('[export-data] Export request parsed', {
        path: requestUrl.pathname,
        format,
        exportMode,
        exportModeSource,
        entities,
        usedDefaultEntities: usedDefault,
        createdAfter,
        updatedAfter,
        limit,
        limitAdjusted
      });
    } catch (logError) {
      console.error('[export-data] Failed to log export request metadata', logError);
    }

    const errors: Record<string, string> = {};
    const entityPayloads: Record<string, unknown> = {};
    const zipEntries: string[] = [];
    let tempDir: string | null = null;
    let cleanup: (() => Promise<void>) | null = null;
    const ensureTempDir = async (): Promise<string> => {
      if (tempDir) {
        return tempDir;
      }
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'export-data-'));
      cleanup = async (): Promise<void> => {
        try {
          await fs.promises.rm(tempDir as string, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('[export-data] Failed to clean up export staging directory', {
            tempDir,
            cleanupError
          });
        }
      };
      return tempDir;
    };

    const requestedItems = entities.includes('items');
    const requestedBoxes = entities.includes('boxes');
    let items: Record<string, unknown>[] | null = null;
    let boxes: Record<string, unknown>[] | null = null;

    if (requestedItems) {
      try {
        items = ctx.listItemsForExport.all({
          createdAfter: createdAfter || null,
          updatedAfter: updatedAfter || null
        });
        console.info('[export-data] Items export loaded', {
          count: Array.isArray(items) ? items.length : 0
        });
      } catch (error) {
        console.error('[export-data] Items export failed', error);
        errors.items = (error as Error).message;
      }
    }

    if (requestedBoxes) {
      try {
        boxes = ctx.db.prepare(`
          SELECT *
          FROM boxes
          WHERE (@createdAfter IS NULL OR CreatedAt >= @createdAfter)
            AND (@updatedAfter IS NULL OR UpdatedAt >= @updatedAfter)
          ORDER BY BoxID
        `).all({
          createdAfter: createdAfter || null,
          updatedAfter: updatedAfter || null
        });
        console.info('[export-data] Boxes export loaded', {
          count: Array.isArray(boxes) ? boxes.length : 0
        });
      } catch (error) {
        console.error('[export-data] Boxes export failed', error);
        errors.boxes = (error as Error).message;
      }
    }

    if (format === 'json') {
      if (requestedItems && items) {
        entityPayloads.items = items;
      }
      if (requestedBoxes && boxes) {
        entityPayloads.boxes = boxes;
      }
    } else if ((items && requestedItems) || (boxes && requestedBoxes)) {
      try {
        const staged = await stageItemsExport({
          archiveBaseName: `data-export-${Date.now()}`,
          boxes: Array.isArray(boxes) ? boxes : [],
          exportMode,
          includeMedia: false,
          items: Array.isArray(items) ? items : [],
          logger: console
        });
        const itemsName = path.basename(staged.itemsPath);
        const boxesName = path.basename(staged.boxesPath);
        if (!tempDir) {
          tempDir = staged.tempDir;
          cleanup = staged.cleanup;
        } else {
          const targetDir = await ensureTempDir();
          await fs.promises.copyFile(staged.itemsPath, path.join(targetDir, itemsName));
          await fs.promises.copyFile(staged.boxesPath, path.join(targetDir, boxesName));
          await staged.cleanup();
        }
        if (requestedItems && items) {
          zipEntries.push(itemsName);
        }
        if (requestedBoxes && boxes) {
          zipEntries.push(boxesName);
        }
      } catch (error) {
        console.error('[export-data] Items/boxes export staging failed', error);
        if (requestedItems) {
          errors.items = (error as Error).message;
        }
        if (requestedBoxes) {
          errors.boxes = (error as Error).message;
        }
      }
    }

    for (const entity of entities) {
      if (entity === 'items' || entity === 'boxes') {
        continue;
      }

      if (entity === 'agentic') {
        try {
          const rows = ctx.db.prepare(`
            SELECT Id, Artikel_Nummer, SearchQuery, Status, LastModified, ReviewState, ReviewedBy,
                   LastReviewDecision, LastReviewNotes, RetryCount, NextRetryAt, LastError, LastAttemptAt
            FROM agentic_runs
            WHERE (@createdAfter IS NULL OR LastModified >= @createdAfter)
              AND (@updatedAfter IS NULL OR LastModified >= @updatedAfter)
            ORDER BY Id DESC
            LIMIT @limit
          `).all({
            createdAfter: createdAfter || null,
            updatedAfter: updatedAfter || null,
            limit
          });
          if (format === 'json') {
            entityPayloads.agentic = rows;
          } else {
            const targetDir = await ensureTempDir();
            const csv = serializeRowsToCsv(rows, AGENTIC_COLUMNS);
            const fileName = 'agentic_runs.csv';
            await fs.promises.writeFile(path.join(targetDir, fileName), csv, 'utf8');
            zipEntries.push(fileName);
          }
          try {
            console.info('[export-data] Agentic runs export staged', {
              count: Array.isArray(rows) ? rows.length : 0
            });
          } catch (logError) {
            console.error('[export-data] Failed to log agentic export summary', logError);
          }
        } catch (error) {
          console.error('[export-data] Agentic runs export failed', error);
          errors.agentic = (error as Error).message;
        }
        continue;
      }

      if (entity === 'events') {
        try {
          const rows = ctx.db.prepare(`
            SELECT Id, CreatedAt, Actor, EntityType, EntityId, Event, Level, Meta
            FROM events
            WHERE (@createdAfter IS NULL OR CreatedAt >= @createdAfter)
              AND (@updatedAfter IS NULL OR CreatedAt >= @updatedAfter)
            ORDER BY Id DESC
            LIMIT @limit
          `).all({
            createdAfter: createdAfter || null,
            updatedAfter: updatedAfter || null,
            limit
          });
          const labeledRows = rows.map((row: Record<string, unknown>) => ({
            ...row,
            EventLabel: eventLabel(String(row.Event || ''))
          }));
          if (format === 'json') {
            entityPayloads.events = labeledRows;
          } else {
            const targetDir = await ensureTempDir();
            const csv = serializeRowsToCsv(labeledRows, EVENT_COLUMNS);
            const fileName = 'events.csv';
            await fs.promises.writeFile(path.join(targetDir, fileName), csv, 'utf8');
            zipEntries.push(fileName);
          }
          try {
            console.info('[export-data] Events export staged', {
              count: Array.isArray(rows) ? rows.length : 0
            });
          } catch (logError) {
            console.error('[export-data] Failed to log events export summary', logError);
          }
        } catch (error) {
          console.error('[export-data] Events export failed', error);
          errors.events = (error as Error).message;
        }
        continue;
      }
    }

    if (format === 'json') {
      return sendJson(res, 200, {
        entities: entityPayloads,
        errors,
        metadata: {
          createdAfter,
          updatedAfter,
          limit,
          exportMode,
          requestedEntities: entities
        }
      });
    }

    if (!tempDir || zipEntries.length === 0) {
      if (cleanup) {
        await cleanup();
      }
      return sendJson(res, 500, { error: 'No export data staged' });
    }

    const archiveName = `export-data-${Date.now()}.zip`;
    try {
      await createZipArchive({
        archiveName,
        cwd: tempDir,
        entries: zipEntries,
        logger: console
      });

      const archivePath = path.join(tempDir, archiveName);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${archiveName}"`
      });
      await pipeline(fs.createReadStream(archivePath), res);
    } catch (error) {
      console.error('[export-data] Failed to stream export archive', error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Failed to build export archive' });
      } else {
        res.destroy(error as Error);
      }
    } finally {
      if (cleanup) {
        await cleanup();
      }
    }
  },
  view: () => '<div class="card"><p class="muted">Export data API</p></div>'
});

export default action;
