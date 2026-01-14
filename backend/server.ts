import fs from 'fs';
import path from 'path';
import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import https from 'https';
import chokidar from 'chokidar';
import { loadActions } from './actions';
import { MEDIA_DIR } from './lib/media';

export { MEDIA_DIR } from './lib/media';
import { resumeStaleAgenticRuns, type AgenticServiceDependencies } from './agentic';
// TODO(agent): Audit Langtext response serialization once structured payload adoption completes.
// TODO(agent): Revisit inbox watcher patterns once ZIP uploads introduce mixed payload sequencing.
// TODO(print-queues): Route queued label jobs to per-label printer queues once configuration is standardized.
import {
  HTTP_PORT,
  INBOX_DIR,
  ARCHIVE_DIR,
  TLS_CERT_PATH,
  TLS_KEY_PATH,
  HTTPS_PORT,
  TLS_ENABLED,
  PUBLIC_HOSTNAME,
  PUBLIC_PROTOCOL,
  PUBLIC_ORIGIN,
  SHOPWARE_SYNC_ENABLED,
  SHOPWARE_DEFAULT_REQUEST_TIMEOUT_MS,
  getShopwareConfig,
  logShopwareConfigIssues,
  IMPORTER_FORCE_ZERO_STOCK
} from './config';
import type { ShopwareConfig } from './config';
import { ingestCsvFile, type IngestCsvFileOptions } from './importer';
import { computeChecksum, findArchiveDuplicate, normalizeCsvFilename } from './utils/csv-utils';
import {
  db,
  getItem,
  upsertBox,
  persistItem,
  persistItemInstance,
  persistItemReference,
  persistItemWithinTransaction,
  findByMaterial,
  itemsByBox,
  boxesByLocation,
  getBox,
  getItemReference,
  listBoxes,
  upsertAgenticRun,
  getAgenticRun,
  updateAgenticRunStatus,
  updateQueuedAgenticRunQueueState,
  getAgenticRequestLog,
  nextLabelJob,
  updateLabelJobStatus,
  logEvent,
  bulkMoveItems,
  bulkRemoveItemStock,
  listEventsForBox,
  listEventsForItem,
  listRecentActivities,
  listRecentEvents,
  countBoxes,
  countEvents,
  countItems,
  countItemsNoBox,
  listRecentBoxes,
  getMaxShelfIndex,
  getMaxBoxId,
  getMaxItemId,
  getMaxArtikelNummer,
  getAdjacentItemIds,
  listItemReferences,
  listItemReferencesWithFilters,
  listItemsForExport,
  updateAgenticReview,
  listItems,
  listItemsWithFilters,
  decrementItemStock,
  incrementItemStock,
  deleteItem,
  deleteBox,
  enqueueShopwareSyncJob
} from './db';
import { AgenticModelInvoker } from './agentic/invoker';
import type { Item, LabelJob } from './db';
import { printFile, resolvePrinterQueue, testPrinterConnection } from './print';
import { htmlForBox, htmlForItem, htmlForShelf } from './lib/labelHtml';
import type { ItemLabelPayload } from './lib/labelHtml';
import { EVENT_LABELS, eventLabel } from '../models/event-labels';
import { generateItemUUID as generateSequentialItemUUID } from './lib/itemIds';

const actions = loadActions();

const pendingCsvIngestionOptions = new Map<string, IngestCsvFileOptions>();

function registerCsvIngestionOptions(absPath: string, options: IngestCsvFileOptions): void {
  pendingCsvIngestionOptions.set(absPath, options);
}

function clearCsvIngestionOptions(absPath: string): void {
  pendingCsvIngestionOptions.delete(absPath);
}

let shopwareConfig: ShopwareConfig = {
  enabled: false,
  baseUrl: null,
  salesChannelId: null,
  requestTimeoutMs: SHOPWARE_DEFAULT_REQUEST_TIMEOUT_MS,
  credentials: {}
};
let shopwareConfigIssues: string[] = [];
let shopwareConfigReady = false;

try {
  shopwareConfig = getShopwareConfig();
  shopwareConfigIssues = logShopwareConfigIssues(console, shopwareConfig);
  shopwareConfigReady = shopwareConfig.enabled && shopwareConfigIssues.length === 0;
} catch (err) {
  console.error('[server] Failed to initialize Shopware configuration', err);
  shopwareConfigIssues = ['Shopware configuration evaluation failed; integration disabled.'];
}

function resolveRequestBase(req: IncomingMessage): string {
  const hostHeader = req.headers.host;
  const forwardedProtoHeader = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const normalizedForwarded =
    forwardedProtoHeader && ['http', 'https'].includes(forwardedProtoHeader.toLowerCase())
      ? (forwardedProtoHeader.toLowerCase() as 'http' | 'https')
      : null;
  const socketEncrypted = Boolean((req.socket as { encrypted?: boolean }).encrypted);
  const inferredProtocol = normalizedForwarded || (socketEncrypted ? 'https' : PUBLIC_PROTOCOL);

  if (hostHeader) {
    return `${inferredProtocol}://${hostHeader}`;
  }

  return PUBLIC_ORIGIN;
}

// public directory selection: prefer dist/public, fall back to repo frontend/public
const DIST_PUBLIC = path.join(__dirname, '../frontend/public');
const REPO_PUBLIC = path.join(__dirname, '../../..', 'frontend', 'public');
export let PUBLIC_DIR = DIST_PUBLIC;
export let PREVIEW_DIR = path.join(PUBLIC_DIR, 'prints');

try {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  // set PUBLIC_DIR at runtime depending on where index.html exists
  PUBLIC_DIR = fs.existsSync(path.join(DIST_PUBLIC, 'index.html'))
    ? DIST_PUBLIC
    : fs.existsSync(path.join(REPO_PUBLIC, 'index.html'))
      ? REPO_PUBLIC
      : DIST_PUBLIC;
  PREVIEW_DIR = path.join(PUBLIC_DIR, 'prints');
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
} catch (err) {
  console.error('Failed to initialise directories', err);
}

async function handleCsv(absPath: string): Promise<void> {
  const pendingOptions = pendingCsvIngestionOptions.get(absPath);
  const zeroStock = pendingOptions?.zeroStock ?? IMPORTER_FORCE_ZERO_STOCK;
  if (zeroStock) {
    console.info('[watcher] Zero stock mode active for CSV ingestion', {
      file: absPath,
      source: pendingOptions ? 'request' : 'config'
    });
  }
  try {
    try {
      const baseName = path.basename(absPath);
      const originalName = baseName.includes('_') ? baseName.slice(baseName.indexOf('_') + 1) : baseName;
      const normalizedName = normalizeCsvFilename(originalName);
      const fileBuffer = fs.readFileSync(absPath);
      const checksum = computeChecksum(fileBuffer);
      const duplicate = findArchiveDuplicate(ARCHIVE_DIR, normalizedName, checksum);
      if (duplicate) {
        console.warn(
          '[watcher] Skipping duplicate CSV ingestion',
          normalizedName,
          'reason:',
          duplicate.reason,
          'match:',
          duplicate.entry
        );
        try {
          fs.rmSync(absPath, { force: true });
        } catch (removeError) {
          console.error('[watcher] Failed to remove duplicate CSV from inbox', absPath, removeError);
        }
        return;
      }
    } catch (duplicateError) {
      console.error('[watcher] Failed to evaluate duplicate CSV upload', absPath, duplicateError);
    }
    const { count, boxes } = await ingestCsvFile(absPath, { zeroStock });
    const archived = path.join(
      ARCHIVE_DIR,
      path.basename(absPath).replace(/\.csv$/i, `.${Date.now()}.csv`)
    );
    fs.renameSync(absPath, archived);
    console.log(
      `Ingested ${count} rows from ${path.basename(absPath)} → boxes: ${boxes.join(', ')}`
    );
  } catch (e) {
    console.error(`Failed ingest ${absPath}:`, (e as Error).message);
  } finally {
    clearCsvIngestionOptions(absPath);
  }
}

chokidar
  .watch(INBOX_DIR, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 250 }
  })
  .on('add', (p: string) => p.endsWith('.csv') && handleCsv(p))
  .on('change', (p: string) => p.endsWith('.csv') && handleCsv(p));

async function runPrintWorker(): Promise<void> {
  const job = nextLabelJob.get() as LabelJob | undefined;
  if (!job) return;
  try {
    const item = getItem.get(job.ItemUUID) as Item | undefined;
    if (!item) {
      console.error('Label job item not found', job.ItemUUID);
      updateLabelJobStatus.run('Error', 'item not found', job.Id);
      return;
    }
    const quantityRaw = item.Auf_Lager as unknown;
    let parsedQuantity = 0;
    if (typeof quantityRaw === 'number' && Number.isFinite(quantityRaw)) {
      parsedQuantity = quantityRaw;
    } else if (typeof quantityRaw === 'string') {
      const parsed = Number.parseFloat(quantityRaw);
      if (Number.isFinite(parsed)) parsedQuantity = parsed;
    }


    const toIsoString = (value: unknown): string | null => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value as string);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    };

    const itemData: ItemLabelPayload = {
      type: 'item',
      id: item.ItemUUID,
      labelText: item.Artikel_Nummer?.trim() || item.ItemUUID,
      materialNumber: item.Artikel_Nummer?.trim() || null,
      boxId: item.BoxID || null,
      location: item.Location?.trim() || null,
      category: 'Find Me !è',
      quantity: Number.isFinite(parsedQuantity) ? parsedQuantity : null,
      addedAt: toIsoString(item.Datum_erfasst || item.UpdatedAt),
      updatedAt: toIsoString(item.UpdatedAt)
    };

    const outPath = path.join(
      PREVIEW_DIR,
      `queue-item-${item.ItemUUID}-${Date.now()}.html`.replace(/[^\w.\-]/g, '_')
    );

    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
    } catch (dirErr) {
      console.error('Print worker failed to prepare preview directory', dirErr);
      updateLabelJobStatus.run('Error', 'preview_directory_unavailable', job.Id);
      return;
    }

    try {
      await htmlForItem({ itemData, outPath });
    } catch (htmlErr) {
      console.error('Print worker failed to generate HTML label', htmlErr);
      updateLabelJobStatus.run('Error', (htmlErr as Error).message, job.Id);
      return;
    }

    // TODO(agent): Measure render latency for label printing to keep template compatibility visible in dashboards.
    const queueResolution = resolvePrinterQueue('item');
    if (queueResolution.source === 'missing') {
      console.warn('[print-worker] Printer queue missing for item label jobs', {
        itemId: item.ItemUUID,
        jobId: job.Id
      });
    }
    try {
      const result = await printFile({
        filePath: outPath,
        jobName: `Item ${item.ItemUUID}`,
        renderMode: 'html-to-pdf',
        printerQueue: queueResolution.queue
      });
      if (!result.sent) {
        console.error('Print worker failed to dispatch HTML label', {
          itemId: item.ItemUUID,
          jobId: job.Id,
          reason: result.reason
        });
        updateLabelJobStatus.run('Error', result.reason || 'print_failed', job.Id);
        return;
      }
      updateLabelJobStatus.run('Done', null, job.Id);
      console.log(`Printed label for ${item.ItemUUID}`);
    } catch (err) {
      console.error('Print worker encountered an unexpected error during print dispatch', err);
      updateLabelJobStatus.run('Error', (err as Error).message, job.Id);
    }
  } catch (e) {
    console.error('Print worker failed', e);
    updateLabelJobStatus.run('Error', (e as Error).message, job.Id);
  }
}
setInterval(runPrintWorker, 750);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

type ActionContext = {
  db: typeof db;
  upsertBox: typeof upsertBox;
  persistItem: typeof persistItem;
  persistItemInstance: typeof persistItemInstance;
  persistItemReference: typeof persistItemReference;
  persistItemWithinTransaction: typeof persistItemWithinTransaction;
  findByMaterial: typeof findByMaterial;
  itemsByBox: typeof itemsByBox;
  boxesByLocation: typeof boxesByLocation;
  getBox: typeof getBox;
  getItemReference: typeof getItemReference;
  listBoxes: typeof listBoxes;
  getItem: typeof getItem;
  decrementItemStock: typeof decrementItemStock;
  incrementItemStock: typeof incrementItemStock;
  deleteItem: typeof deleteItem;
  deleteBox: typeof deleteBox;
  bulkMoveItems: typeof bulkMoveItems;
  bulkRemoveItemStock: typeof bulkRemoveItemStock;
  upsertAgenticRun: typeof upsertAgenticRun;
  getAgenticRun: typeof getAgenticRun;
  updateAgenticRunStatus: typeof updateAgenticRunStatus;
  listItems: typeof listItems;
  listItemsWithFilters: typeof listItemsWithFilters;
  getAdjacentItemIds: typeof getAdjacentItemIds;
  htmlForBox: typeof htmlForBox;
  htmlForItem: typeof htmlForItem;
  htmlForShelf: typeof htmlForShelf;
  printFile: typeof printFile;
  testPrinterConnection: typeof testPrinterConnection;
  EVENT_LABELS: typeof EVENT_LABELS;
  eventLabel: typeof eventLabel;
  logEvent: typeof logEvent;
  listEventsForBox: typeof listEventsForBox;
  listEventsForItem: typeof listEventsForItem;
  listRecentActivities: typeof listRecentActivities;
  listRecentEvents: typeof listRecentEvents;
  countBoxes: typeof countBoxes;
  countEvents: typeof countEvents;
  countItems: typeof countItems;
  countItemsNoBox: typeof countItemsNoBox;
  listRecentBoxes: typeof listRecentBoxes;
  getMaxShelfIndex: typeof getMaxShelfIndex;
  getMaxBoxId: typeof getMaxBoxId;
  getMaxArtikelNummer: typeof getMaxArtikelNummer;
  listItemReferences: typeof listItemReferences;
  listItemReferencesWithFilters: typeof listItemReferencesWithFilters;
  listItemsForExport: typeof listItemsForExport;
  updateAgenticReview: typeof updateAgenticReview;
  INBOX_DIR: typeof INBOX_DIR;
  PUBLIC_DIR: typeof PUBLIC_DIR;
  PREVIEW_DIR: typeof PREVIEW_DIR;
  agenticServiceEnabled: boolean;
  registerCsvIngestionOptions: typeof registerCsvIngestionOptions;
  clearCsvIngestionOptions: typeof clearCsvIngestionOptions;
  getAgenticRequestLog: typeof getAgenticRequestLog;
  shopware: {
    config: ShopwareConfig;
    issues: string[];
    ready: boolean;
  };
};

const agenticServiceEnabled = true;

const agenticInvoker = new AgenticModelInvoker({ logger: console });
const boundAgenticInvokeModel = agenticInvoker.invoke.bind(agenticInvoker);

let agenticDependenciesLogged = false;

function createAgenticServiceDependencies(
  overrides: Partial<Pick<AgenticServiceDependencies, 'logger' | 'now'>> = {}
): AgenticServiceDependencies {
  const logger = overrides.logger ?? console;

  if (!agenticDependenciesLogged) {
    logger.info?.('[agentic-service] In-process orchestrator dependencies initialized.');
    agenticDependenciesLogged = true;
  }

  return {
    db,
    getAgenticRun,
    upsertAgenticRun,
    updateAgenticRunStatus,
    updateQueuedAgenticRunQueueState,
    logEvent,
    logger,
    now: overrides.now ?? (() => new Date()),
    invokeModel: boundAgenticInvokeModel
  };
}

if (agenticServiceEnabled) {
  console.info('[server] In-process agentic orchestrator active; agentic runs dispatch immediately.');
  void (async () => {
    try {
      const result = await resumeStaleAgenticRuns(createAgenticServiceDependencies());
      console.info('[agentic-service] Startup stale run resume summary', result);
    } catch (err) {
      console.error('[agentic-service] Failed to resume stale agentic runs on startup', err);
    }
  })();
}

if (SHOPWARE_SYNC_ENABLED) {
  console.info('[server] SHOPWARE_SYNC_ENABLED=true but the background worker is not active because dispatchJob is not implemented.');
}
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<any> {
  try {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (!req.url) {
      sendJson(res, 400, { error: 'Bad request' });
      return;
    }

    const url = new URL(req.url, resolveRequestBase(req));
    if (url.pathname === '/' && req.method === 'GET') {
      const p = path.join(PUBLIC_DIR, 'index.html');
      try {
        const html = fs.readFileSync(p);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      } catch (err) {
        console.error('Failed to serve index.html', err);
        res.writeHead(500); return res.end('Internal error');
      }
    }

    if (url.pathname === '/bundle.js' && req.method === 'GET') {
      const p = path.join(PUBLIC_DIR, 'bundle.js');
      try {
        const js = fs.readFileSync(p);
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(js);
      } catch (err) {
        console.error('Bundle not found', err);
        res.writeHead(404); return res.end('Not found');
      }
    }

    if (url.pathname === '/bundle.css' && req.method === 'GET') {
      const p = path.join(PUBLIC_DIR, 'styles.css');
      try {
        const css = fs.readFileSync(p);
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
        return res.end(css);
      } catch {
        res.writeHead(404); return res.end('Not found');
      }
    }

    // TODO(agent): Remove legacy print page redirects once clients stop requesting retired templates.
    if (url.pathname.startsWith('/print/') && req.method === 'GET') {
      const legacyRedirects = new Map<string, string>([
        ['/print/item-label.html', '/print/29x90.html'],
        ['/print/box-label.html', '/print/62x100.html'],
        ['/print/23x23.html', '/print/62x100.html']
      ]);
      const redirect = legacyRedirects.get(url.pathname);
      if (redirect) {
        console.warn('[print] Legacy print page requested; redirecting to canonical template', {
          requested: url.pathname,
          redirect
        });
        res.writeHead(302, { Location: redirect });
        return res.end();
      }

      const relativePath = url.pathname.replace(/^\/+/, '');
      const resolvedPath = path.join(PUBLIC_DIR, relativePath);
      try {
        if (!resolvedPath.startsWith(path.join(PUBLIC_DIR, 'print'))) {
          throw new Error('bad path');
        }
        const html = fs.readFileSync(resolvedPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      } catch (err) {
        console.warn('[print] Print template not found', { requested: url.pathname, error: err });
        res.writeHead(404); return res.end('Not found');
      }
    }

    if (url.pathname.startsWith('/prints/') && req.method === 'GET') {
      const p = path.join(PUBLIC_DIR, url.pathname);
      try {
        if (!p.startsWith(path.join(PUBLIC_DIR, 'prints'))) throw new Error('bad path');
        if (fs.existsSync(p)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(fs.readFileSync(p));
        }
      } catch {
        // fallthrough
      }
      res.writeHead(404); return res.end('Not found');
    }

    if (url.pathname.startsWith('/media/') && req.method === 'GET') {
      const p = path.join(MEDIA_DIR, url.pathname.slice('/media/'.length));
      try {
        if (!p.startsWith(MEDIA_DIR)) throw new Error('bad path');
        const data = fs.readFileSync(p);
        const ext = path.extname(p).toLowerCase();
        const ct = ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct });
        return res.end(data);
      } catch (err) {
        console.error('Failed to serve media', err);
        res.writeHead(404); return res.end('Not found');
      }
    }

    if (req.method === 'GET' && !url.pathname.startsWith('/api')) {
      const p = path.join(PUBLIC_DIR, 'index.html');
      try {
        const html = fs.readFileSync(p);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      } catch (err) {
        console.error('Failed to serve SPA fallback', err);
        res.writeHead(404); return res.end('Not found');
      }
    }

    // Remaining request handling delegated to actions
    const action = actions.find((a) => a.matches?.(url.pathname, req.method || 'GET'));
    if (action) {
      try {
        console.log('Handling action', action.key);
        const generateItemId = () =>
          generateSequentialItemUUID({
            getMaxItemId: () => getMaxItemId.get() as { ItemUUID: string } | undefined,
            now: () => new Date()
          });
        await action.handle?.(req, res, {
          db,
          upsertBox,
          persistItem,
          persistItemInstance,
          persistItemReference,
          persistItemWithinTransaction,
          findByMaterial,
          itemsByBox,
          boxesByLocation,
          getBox,
          getItemReference,
          listBoxes,
          upsertAgenticRun,
          getAgenticRun,
          updateAgenticRunStatus,
          getItem,
          decrementItemStock,
          incrementItemStock,
          deleteItem,
          deleteBox,
          enqueueShopwareSyncJob,
          bulkMoveItems,
          bulkRemoveItemStock,
          listItems,
          getAdjacentItemIds,
          htmlForBox,
          htmlForItem,
          htmlForShelf,
          printFile,
          testPrinterConnection,
          EVENT_LABELS,
          eventLabel,
          logEvent,
          listEventsForBox,
          listEventsForItem,
          listRecentActivities,
          listRecentEvents,
          countBoxes,
          countEvents,
          countItems,
          countItemsNoBox,
          listRecentBoxes,
          getMaxShelfIndex,
          getMaxBoxId,
          getMaxItemId,
          getMaxArtikelNummer,
          listItemReferences,
          listItemReferencesWithFilters,
          listItemsForExport,
          listItemsWithFilters,
          updateAgenticReview,
          INBOX_DIR,
          PUBLIC_DIR,
          PREVIEW_DIR,
          agenticServiceEnabled,
          agenticInvokeModel: boundAgenticInvokeModel,
          registerCsvIngestionOptions,
          clearCsvIngestionOptions,
          getAgenticRequestLog,
          shopware: {
            config: shopwareConfig,
            issues: [...shopwareConfigIssues],
            ready: shopwareConfigReady
          },
          generateItemUUID: generateItemId
        });
      } catch (err) {
        console.error('Action handler failed', err);
        sendJson(res, 500, { error: 'Internal error' });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Unexpected server error', err);
    sendJson(res, 500, { error: 'Internal error' });
  }
}

export const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  void handleRequest(req, res);
});

function formatListenerUrl(protocol: 'http' | 'https', hostname: string, port: number): string {
  const needsPort = !((protocol === 'http' && port === 80) || (protocol === 'https' && port === 443));
  return `${protocol}://${hostname}${needsPort ? `:${port}` : ''}`;
}

if (process.env.NODE_ENV !== 'test') {
  try {
    server.listen(HTTP_PORT, () => {
      console.log(`[server] HTTP server listening at ${formatListenerUrl('http', PUBLIC_HOSTNAME, HTTP_PORT)}`);
    });
  } catch (err) {
    console.error('[server] Failed to start HTTP server', err);
  }

  if (TLS_ENABLED) {
    let key: Buffer | undefined;
    let cert: Buffer | undefined;

    try {
      key = fs.readFileSync(TLS_KEY_PATH);
    } catch (err) {
      console.error(`[server] Unable to read TLS key at ${TLS_KEY_PATH}`, err);
    }

    try {
      cert = fs.readFileSync(TLS_CERT_PATH);
    } catch (err) {
      console.error(`[server] Unable to read TLS certificate at ${TLS_CERT_PATH}`, err);
    }

    if (key && cert) {
      try {
        const httpsServer = https.createServer({ key, cert }, (req, res) => {
          void handleRequest(req, res);
        });

        httpsServer.listen(HTTPS_PORT, () => {
          console.log(`[server] HTTPS server listening at ${formatListenerUrl('https', PUBLIC_HOSTNAME, HTTPS_PORT)}`);
        });
      } catch (err) {
        console.error('[server] Failed to start HTTPS server', err);
      }
    } else {
      console.error('[server] TLS configuration detected but certificate or key could not be read; HTTPS server disabled.');
    }
  } else if (TLS_CERT_PATH || TLS_KEY_PATH) {
    console.warn(
      '[server] Partial TLS configuration detected (both TLS_CERT_PATH and TLS_KEY_PATH are required); HTTPS listener disabled.'
    );
  } else {
    console.info('[server] TLS configuration not provided; HTTPS listener disabled.');
  }
}
