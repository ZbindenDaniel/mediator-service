import fs from 'fs';
import path from 'path';
import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import https from 'https';
import chokidar from 'chokidar';
import { loadActions } from './actions';
import {
  HTTP_PORT,
  INBOX_DIR,
  ARCHIVE_DIR,
  AGENTIC_API_BASE,
  TLS_CERT_PATH,
  TLS_KEY_PATH,
  HTTPS_PORT,
  TLS_ENABLED,
  PUBLIC_HOSTNAME,
  PUBLIC_PROTOCOL,
  PUBLIC_ORIGIN
} from './config';
import { ingestCsvFile } from './importer';
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
  getBox,
  listBoxes,
  upsertAgenticRun,
  getAgenticRun,
  updateAgenticRunStatus,
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
  getMaxBoxId,
  getMaxArtikelNummer,
  listItemsForExport,
  updateAgenticReview,
  listItems,
  decrementItemStock,
  incrementItemStock,
  deleteItem,
  deleteBox
} from './db';
import { processQueuedAgenticRuns } from './agentic-queue-worker';
import type { Item, LabelJob } from './db';
import { zplForItem, zplForBox, sendZpl, testPrinterConnection } from './print';
import { pdfForBox, pdfForItem } from './labelpdf';
import { EVENT_LABELS, eventLabel } from '../models/event-labels';

const actions = loadActions();

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
export const MEDIA_DIR = path.join(__dirname, '../media');

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
    const { count, boxes } = await ingestCsvFile(absPath);
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
      const zpl = zplForItem({
        materialNumber: item.Artikel_Nummer,
        itemUUID: item.ItemUUID
      });
    await sendZpl(zpl);
    updateLabelJobStatus.run('Done', null, job.Id);
    console.log(`Printed label for ${item.ItemUUID}`);
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
  getBox: typeof getBox;
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
  pdfForBox: typeof pdfForBox;
  pdfForItem: typeof pdfForItem;
  zplForItem: typeof zplForItem;
  zplForBox: typeof zplForBox;
  sendZpl: typeof sendZpl;
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
  getMaxBoxId: typeof getMaxBoxId;
  getMaxArtikelNummer: typeof getMaxArtikelNummer;
  listItemsForExport: typeof listItemsForExport;
  updateAgenticReview: typeof updateAgenticReview;
  INBOX_DIR: typeof INBOX_DIR;
  PUBLIC_DIR: typeof PUBLIC_DIR;
  PREVIEW_DIR: typeof PREVIEW_DIR;
  agenticServiceEnabled: boolean;
};

const resolvedAgenticApiBase = AGENTIC_API_BASE.trim();
const agenticServiceEnabled = Boolean(resolvedAgenticApiBase);

if (!agenticServiceEnabled) {
  console.info(
    '[server] Agentic API base not configured; agentic processing disabled (resolved value empty after trim).'
  );
}

const AGENTIC_QUEUE_WORKER_INTERVAL_MS = 5000;
let agenticQueueWorkerRunning = false;

async function runAgenticQueueWorker(): Promise<void> {
  if (!agenticServiceEnabled || agenticQueueWorkerRunning) {
    return;
  }

  agenticQueueWorkerRunning = true;
  try {
    await processQueuedAgenticRuns({
      agenticApiBase: resolvedAgenticApiBase,
      logger: console
    });
  } catch (err) {
    console.error('[server] Agentic queue worker crashed', err);
  } finally {
    agenticQueueWorkerRunning = false;
  }
}

if (agenticServiceEnabled) {
  setInterval(() => {
    void runAgenticQueueWorker();
  }, AGENTIC_QUEUE_WORKER_INTERVAL_MS);
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

    if (url.pathname.startsWith('/prints/') && req.method === 'GET') {
      const p = path.join(PUBLIC_DIR, url.pathname);
      try {
        if (!p.startsWith(path.join(PUBLIC_DIR, 'prints'))) throw new Error('bad path');
        if (fs.existsSync(p)) {
          res.writeHead(200, { 'Content-Type': 'application/pdf' });
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
        await action.handle?.(req, res, {
          db,
          upsertBox,
          persistItem,
          persistItemInstance,
          persistItemReference,
          persistItemWithinTransaction,
          findByMaterial,
          itemsByBox,
          getBox,
          listBoxes,
          upsertAgenticRun,
          getAgenticRun,
          updateAgenticRunStatus,
          getItem,
          decrementItemStock,
          incrementItemStock,
          deleteItem,
          deleteBox,
          bulkMoveItems,
          bulkRemoveItemStock,
          listItems,
          pdfForBox,
          pdfForItem,
          zplForItem,
          zplForBox,
          sendZpl,
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
          getMaxBoxId,
          getMaxArtikelNummer,
          listItemsForExport,
          updateAgenticReview,
          INBOX_DIR,
          PUBLIC_DIR,
          PREVIEW_DIR,
          agenticServiceEnabled
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
