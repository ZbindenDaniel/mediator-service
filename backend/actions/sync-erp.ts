import path from 'path';
import { spawn } from 'child_process';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  ERP_IMPORT_FORM_FIELD,
  ERP_IMPORT_CLIENT_ID,
  ERP_IMPORT_INCLUDE_MEDIA,
  ERP_IMPORT_PASSWORD,
  ERP_IMPORT_TIMEOUT_MS,
  ERP_IMPORT_URL,
  ERP_IMPORT_USERNAME
} from '../config';
import { MEDIA_DIR } from '../lib/media';
import { ItemsExportArtifact, stageItemsExport } from './export-items';
import { defineHttpAction } from './index';

// TODO(agent): Capture ERP sync response metadata (job IDs) once the upstream API returns them.
// TODO(agent): Consolidate ERP import HTTP client with shared networking utilities once available.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Invalid JSON payload');
  }
}

function normalizeItemIds(rawItemIds: unknown): string[] {
  if (!Array.isArray(rawItemIds)) {
    return [];
  }
  const normalized: string[] = [];
  for (const candidate of rawItemIds) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    if (!normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }
  return normalized;
}

interface ImportOptions {
  actor: string;
  artifact: ItemsExportArtifact;
  clientId: string;
  formField: string;
  includeMedia: boolean;
  logger?: Pick<Console, 'error' | 'info' | 'warn'>;
  password: string;
  timeoutMs: number;
  url: string;
  username: string;
}

interface ImportResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// TODO(agent): Confirm whether ERP import requires curl retries on transient 5xx responses.
// TODO(agent): Add structured log fields for curl timing metrics once we track ERP latency.
async function runCurlImport(options: ImportOptions): Promise<ImportResult> {
  const { actor, artifact, clientId, formField, includeMedia, logger, password, timeoutMs, url, username } = options;
  const loggerRef = logger ?? console;
  // TODO(agent): Reconcile ERP import content type selection with export artifact shape when media rules evolve.
  const expectedKind = includeMedia ? 'zip' : 'csv';
  const archiveKind = artifact.kind;
  const mimeType = archiveKind === 'zip' ? 'application/zip' : 'text/csv';
  const fieldName = formField || 'file';
  const timeoutSeconds = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.ceil(timeoutMs / 1000) : undefined;
  const args: string[] = [
    '-X',
    'POST',
    '--silent',
    '--insecure',
    '--show-error',
    '-F',
    'action=CsvImport/import',
    '-F',
    'action_import=1',
    '-F',
    'escape_char=quote',
    '-F',
    'profile.type=parts',
    '-F',
    'quote_char=quote',
    '-F',
    'sep_char=semicolon',
    '-F',
    'settings.apply_buchungsgruppe=all',
    '-F',
    'settings.article_number_policy=update_prices',
    '-F',
    'settings.charset=CP850',
    '-F',
    'settings.default_buchungsgruppe=395',
    '-F',
    'settings.duplicates=no_check',
    '-F',
    'settings.numberformat=1.000,00',
    '-F',
    'settings.part_type=part',
    '-F',
    'settings.sellprice_adjustment=0',
    '-F',
    'settings.sellprice_adjustment_type=percent',
    '-F',
    'settings.sellprice_places=2',
    '-F',
    'settings.shoparticle_if_missing=0',
    '-F',
    `${fieldName}=@${artifact.archivePath};type=${mimeType}`,
    '-F',
    `client_id=${clientId || '1'}`,
    '-F',
    `actor=${actor}`,
    url
  ];

  if (username) {
    args.splice(args.length - 1, 0, '-F', `login=${username}`);
  }

  if (password) {
    args.splice(args.length - 1, 0, '-F', `password=${password}`);
  }

  if (timeoutSeconds) {
    args.splice(4, 0, '--max-time', `${timeoutSeconds}`);
  }

  const redactedArgs = args.map((arg) => {
    if (arg.startsWith('login=')) {
      return 'login=***';
    }
    if (arg.startsWith('password=')) {
      return 'password=***';
    }
    if (arg.startsWith('client_id=')) {
      return 'client_id=***';
    }
    return arg;
  });

  loggerRef.info?.('[sync-erp] curl import request', {
    url,
    fieldName,
    includeMedia,
    archivePath: artifact.archivePath,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
    args: redactedArgs
  });

  try {
    const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    return await new Promise<ImportResult>((resolve, reject) => {
      child.on('error', (error) => {
        loggerRef.error?.('[sync-erp] curl spawn failed', error);
        reject(error);
      });

      child.on('close', (code, signal) => {
        if (signal) {
          stderr = `${stderr}${stderr ? '\n' : ''}curl terminated with signal ${signal}`;
        }
        const exitCode = typeof code === 'number' ? code : -1;

        if (stdout.trim()) {
          loggerRef.info?.('[sync-erp] curl stdout', stdout.trim());
        }

        if (stderr.trim()) {
          loggerRef.warn?.('[sync-erp] curl stderr', stderr.trim());
        }

        resolve({ exitCode, stdout, stderr });
      });
    });
  } catch (error) {
    loggerRef.error?.('[sync-erp] curl execution failed', error);
    throw error;
  }
}

const action = defineHttpAction({
  key: 'sync-erp',
  label: 'Sync ERP',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/sync/erp' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {

    return sendJson(res, 501, { error: 'ERP sync ist momentan nicht verfügbar!' });
    let stagedExport: ItemsExportArtifact | null = null;
    // try {
    //   let payload: any;
    //   try {
    //     payload = await readJsonBody(req);
    //   } catch (parseError) {
    //     console.warn('[sync-erp] Failed to parse JSON payload', parseError);
    //     return sendJson(res, 400, { error: (parseError as Error).message });
    //   }

    //   const actor = typeof payload?.actor === 'string' ? payload.actor.trim() : '';
    //   if (!actor) {
    //     return sendJson(res, 400, { error: 'actor is required' });
    //   }

    //   if (!ERP_IMPORT_URL) {
    //     console.error('[sync-erp] ERP_IMPORT_URL is not configured');
    //     return sendJson(res, 500, { error: 'ERP import URL is not configured.' });
    //   }

    //   const itemIds = normalizeItemIds(payload?.itemIds);
    //   const items = ctx.listItemsForExport.all({
    //     createdAfter: null,
    //     updatedAfter: null,
    //     itemIds
    //   });

    //   if (!Array.isArray(items) || items.length === 0) {
    //     console.warn('[sync-erp] No export rows available for ERP sync', { itemIdsCount: itemIds.length });
    //     return sendJson(res, 404, { error: 'No items available for ERP sync.' });
    //   }

    //   const boxes = typeof ctx.listBoxes?.all === 'function' ? ctx.listBoxes.all() : [];
    //   stagedExport = await stageItemsExport({
    //     archiveBaseName: `erp-sync-${Date.now()}`,
    //     boxes: Array.isArray(boxes) ? boxes : [],
    //     includeMedia: ERP_IMPORT_INCLUDE_MEDIA,
    //     items,
    //     logger: console,
    //     mediaDir: MEDIA_DIR
    //   });

    //   if (typeof ctx?.db?.transaction === 'function' && typeof ctx?.logEvent === 'function') {
    //     try {
    //       const logExport = ctx.db.transaction((rows: any[], a: string) => {
    //         for (const row of rows) {
    //           ctx.logEvent({
    //             Actor: a,
    //             EntityType: 'Item',
    //             EntityId: row.ItemUUID,
    //             Event: 'Exported',
    //             Meta: JSON.stringify({
    //               target: 'erp',
    //               includeMedia: ERP_IMPORT_INCLUDE_MEDIA,
    //               filteredItemIds: itemIds
    //             })
    //           });
    //         }
    //       });
    //       logExport(items, actor);
    //     } catch (logError) {
    //       console.error('[sync-erp] Failed to log ERP export events', logError);
    //     }
    //   }
      
    //   console.info('[sync-erp] Starting ERP curl import');
    //   let curlResult: ImportResult;
    //   try {
    //     curlResult = await runCurlImport({
    //       actor,
    //       artifact: stagedExport,
    //       clientId: ERP_IMPORT_CLIENT_ID,
    //       formField: ERP_IMPORT_FORM_FIELD,
    //       includeMedia: ERP_IMPORT_INCLUDE_MEDIA,
    //       logger: console,
    //       password: ERP_IMPORT_PASSWORD,
    //       timeoutMs: ERP_IMPORT_TIMEOUT_MS,
    //       url: ERP_IMPORT_URL,
    //       username: ERP_IMPORT_USERNAME
    //     });
    //   } catch (curlError) {
    //     console.error('[sync-erp] Failed to execute ERP import', curlError);
    //     return sendJson(res, 502, {
    //       error: 'ERP import execution failed',
    //       details: (curlError as Error).message
    //     });
    //   }

    //   if (curlResult.exitCode !== 0) {
    //     console.error('[sync-erp] ERP import failed', {
    //       exitCode: curlResult.exitCode
    //     });
    //     return sendJson(res, 502, {
    //       error: 'ERP import failed',
    //       exitCode: curlResult.exitCode,
    //       stderr: curlResult.stderr,
    //       stdout: curlResult.stdout
    //     });
    //   }

    //   return sendJson(res, 200, {
    //     ok: true,
    //     exitCode: curlResult.exitCode,
    //     stdout: curlResult.stdout,
    //     stderr: curlResult.stderr,
    //     artifact: path.basename(stagedExport.archivePath),
    //     itemCount: items.length,
    //     includeMedia: ERP_IMPORT_INCLUDE_MEDIA
    //   });
    // } catch (error) {
    //   console.error('[sync-erp] Failed to sync ERP', error);
    //   return sendJson(res, 500, { error: (error as Error).message });
    // } finally {
    //   if (stagedExport) {
    //     try {
    //       await stagedExport.cleanup();
    //     } catch (cleanupError) {
    //       console.error('[sync-erp] Failed to clean up ERP export staging directory', cleanupError);
    //     }
    //   }
    // }
  },
  view: () => '<div class="card"><p class="muted">ERP sync</p></div>'
});

export default action;
