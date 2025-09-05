import fs from 'fs';
import path from 'path';
import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import chokidar from 'chokidar';
import { loadActions } from './actions';
import { HOSTNAME, HTTP_PORT, INBOX_DIR, ARCHIVE_DIR } from './config';
import { ingestCsvFile } from './importer';
import {
  db,
  getItem,
  upsertBox,
  upsertItem,
  findByMaterial,
  itemsByBox,
  getBox,
  listBoxes,
  nextLabelJob,
  updateLabelJobStatus,
  logEvent,
  listEventsForBox,
  listEventsForItem,
  listRecentEvents,
  countBoxes,
  countItems,
  countItemsNoWms,
  listRecentBoxes,
  getMaxArtikelNummer
} from './db';
import type { Item, LabelJob } from './db';
import { zplForItem, zplForBox, sendZpl, testPrinterConnection } from './print';
import { pdfForBox, pdfForItem } from './labelpdf';
import { EVENT_LABELS, eventLabel } from './event-labels';

const actions = loadActions();

// public directory selection: prefer dist/public, fall back to repo v2/frontend/public
const DIST_PUBLIC = path.join(__dirname, '../frontend/public');
const REPO_PUBLIC = path.join(__dirname, '../../..', 'v2', 'frontend', 'public');
export let PUBLIC_DIR = DIST_PUBLIC;

try {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  // set PUBLIC_DIR at runtime depending on where index.html exists
  PUBLIC_DIR = fs.existsSync(path.join(DIST_PUBLIC, 'index.html'))
    ? DIST_PUBLIC
    : fs.existsSync(path.join(REPO_PUBLIC, 'index.html'))
    ? REPO_PUBLIC
    : DIST_PUBLIC;
  const PREVIEW_DIR = path.join(PUBLIC_DIR, 'prints');
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
} catch (err) {
  console.error('Failed to initialise directories', err);
}

async function handleCsv(absPath: string): Promise<void> {
  try {
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
  upsertItem: typeof upsertItem;
  findByMaterial: typeof findByMaterial;
  itemsByBox: typeof itemsByBox;
  getBox: typeof getBox;
  listBoxes: typeof listBoxes;
  getItem: typeof getItem;
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
  listRecentEvents: typeof listRecentEvents;
  countBoxes: typeof countBoxes;
  countItems: typeof countItems;
  countItemsNoWms: typeof countItemsNoWms;
  listRecentBoxes: typeof listRecentBoxes;
  INBOX_DIR: typeof INBOX_DIR;
};
export const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (!req.url) return sendJson(res, 400, { error: 'Bad request' });
    if (req.url.startsWith('/ui/')) {
      (res as any).oldWrite = res.write;
      (res as any).oldEnd = res.end;
      let htmlBuffer = '';
      res.write = function (chunk: any) {
        htmlBuffer += chunk.toString();
      } as any;
      res.end = function (chunk: any) {
        if (chunk) htmlBuffer += chunk.toString();
        if (htmlBuffer.includes('<body')) {
          htmlBuffer = htmlBuffer.replace(
            '<body>',
            `<body><script>(function(){ try { var u = localStorage.getItem('username'); if (!u) { u = prompt('Bitte geben Sie Ihren Benutzernamen ein:'); if (u) localStorage.setItem('username', u); } } catch(e){} })();</script>`
          );
        }
        return (res as any).oldEnd(htmlBuffer);
      } as any;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

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
      const p = path.join(PUBLIC_DIR, 'bundle.css');
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

    // Remaining request handling delegated to actions
    const action = actions.find((a) => a.matches?.(url.pathname, req.method || 'GET'));
    if (action) {
      try {
        await action.handle?.(req, res, {
          db,
          upsertBox,
          upsertItem,
          findByMaterial,
          itemsByBox,
          getBox,
          listBoxes,
          getItem,
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
          listRecentEvents,
          countBoxes,
          countItems,
          countItemsNoWms,
          listRecentBoxes,
          getMaxArtikelNummer,
          INBOX_DIR
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
});

if (process.env.NODE_ENV !== 'test') {
  try {
    server.listen(HTTP_PORT, () => {
      console.log(`Server running at ${HOSTNAME}:${HTTP_PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
  }
}
