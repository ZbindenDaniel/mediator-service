import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { defineHttpAction } from './index';
import { MEDIA_UPLOAD_STAGING_DIR, formatArtikelNummerForMedia } from '../lib/media';
import { queryOne, query, execute, insert } from '../db-client';

const ATTACHMENT_ROUTE_RE = /^\/api\/item\/([^/]+)\/attachments(?:\/(\d+))?$/;
const INSTANCES_SUBDIR = 'instances';
const PRODUCTS_SUBDIR = 'products';
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB guard

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function instanceDir(itemUUID: string): string {
  return path.join(MEDIA_UPLOAD_STAGING_DIR, INSTANCES_SUBDIR, itemUUID);
}

// Product-level attachments are keyed by Artikel_Nummer so every instance of the product sees them.
function productDir(folder: string): string {
  return path.join(MEDIA_UPLOAD_STAGING_DIR, PRODUCTS_SUBDIR, folder);
}

const action = defineHttpAction({
  key: 'item-attachments',
  label: 'Item attachments',
  appliesTo: () => false,
  matches: (p, method) => ATTACHMENT_ROUTE_RE.test(p) && ['GET', 'POST', 'DELETE'].includes(method),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const method = req.method || 'GET';
    const urlPath = (req.url || '').split('?')[0];
    const match = urlPath.match(ATTACHMENT_ROUTE_RE);
    if (!match) return sendJson(res, 404, { error: 'not found' });

    const itemUUID = decodeURIComponent(match[1]);
    const attachmentId = match[2] != null ? parseInt(match[2], 10) : null;

    const itemRow = await queryOne<{ ItemUUID: string; Artikel_Nummer: string | null }>(
      'SELECT "ItemUUID", "Artikel_Nummer" FROM items WHERE "ItemUUID" = $1',
      [itemUUID]
    );
    if (!itemRow) return sendJson(res, 404, { error: 'item not found' });
    const artikelNummer = itemRow.Artikel_Nummer ?? null;

    // ── GET: list attachments ─────────────────────────────────────────────────
    // Return this instance's own files plus any product-level files for its Artikel_Nummer,
    // so every instance of the product sees the shared attachments.
    if (method === 'GET') {
      const attachments = await query(
        `SELECT "Id", "ItemUUID", "FileName", "FilePath", "MimeType", "Label", "FileSize", "CreatedAt", "Scope", "Artikel_Nummer"
         FROM item_attachments
         WHERE "ItemUUID" = $1 OR ("Scope" = 'product' AND "Artikel_Nummer" = $2)
         ORDER BY "CreatedAt" DESC`,
        [itemUUID, artikelNummer]
      );
      return sendJson(res, 200, { attachments });
    }

    // ── POST: upload attachment ───────────────────────────────────────────────
    if (method === 'POST') {
      const rawFilename = req.headers['x-filename'];
      const fileName = typeof rawFilename === 'string' ? path.basename(rawFilename.trim()) : null;
      if (!fileName) return sendJson(res, 400, { error: 'X-Filename header is required' });

      // Sanitise filename: strip path traversal, keep only safe chars
      const safeName = fileName.replace(/[^\w.\-]/g, '_');
      if (!safeName || safeName === '.' || safeName === '..') {
        return sendJson(res, 400, { error: 'invalid filename' });
      }

      const mimeType = typeof req.headers['content-type'] === 'string'
        ? req.headers['content-type'].split(';')[0].trim()
        : 'application/octet-stream';
      const label = typeof req.headers['x-label'] === 'string'
        ? req.headers['x-label'].trim() || null
        : null;

      // Scope decides routing: 'product' shares the file across all instances of the Artikel_Nummer.
      const scope = req.headers['x-attachment-scope'] === 'product' ? 'product' : 'instance';
      // Derive the product folder server-side from the item row — never trust a client-supplied number.
      const productFolder = scope === 'product' ? formatArtikelNummerForMedia(artikelNummer) : null;
      if (scope === 'product' && !productFolder) {
        return sendJson(res, 400, { error: 'item has no Artikel_Nummer for product-level attachment' });
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > MAX_ATTACHMENT_BYTES) {
          return sendJson(res, 413, { error: 'file too large' });
        }
        chunks.push(buf);
      }
      if (chunks.length === 0) return sendJson(res, 400, { error: 'empty file body' });
      const body = Buffer.concat(chunks);

      const dir = productFolder ? productDir(productFolder) : instanceDir(itemUUID);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, safeName), body);

      const relativePath = productFolder
        ? [PRODUCTS_SUBDIR, productFolder, safeName].join('/')
        : [INSTANCES_SUBDIR, itemUUID, safeName].join('/');
      await insert(
        `INSERT INTO item_attachments ("ItemUUID", "FileName", "FilePath", "MimeType", "Label", "FileSize", "CreatedAt", "Scope", "Artikel_Nummer")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8) RETURNING "Id"`,
        [itemUUID, safeName, relativePath, mimeType, label, body.length, scope, scope === 'product' ? artikelNummer : null]
      );

      await ctx.logEvent({
        EntityType: 'Item',
        EntityId: itemUUID,
        Event: 'AttachmentAdded',
        Meta: JSON.stringify({ fileName: safeName, mimeType, fileSize: body.length, scope })
      });
      return sendJson(res, 201, { ok: true, fileName: safeName, relativePath });
    }

    // ── DELETE: remove attachment ─────────────────────────────────────────────
    if (method === 'DELETE' && attachmentId !== null) {
      // A product-level attachment can be deleted from any sibling instance (delete-for-all);
      // an instance attachment only from its own instance.
      const row = await queryOne<{ Id: number; FileName: string; FilePath: string }>(
        `SELECT "Id", "FileName", "FilePath" FROM item_attachments
         WHERE "Id" = $1 AND ("ItemUUID" = $2 OR ("Scope" = 'product' AND "Artikel_Nummer" = $3))`,
        [attachmentId, itemUUID, artikelNummer]
      );
      if (!row) return sendJson(res, 404, { error: 'attachment not found' });

      const fullPath = path.join(MEDIA_UPLOAD_STAGING_DIR, row.FilePath);
      try { fs.unlinkSync(fullPath); } catch { /* already gone */ }

      await execute(
        `DELETE FROM item_attachments
         WHERE "Id" = $1 AND ("ItemUUID" = $2 OR ("Scope" = 'product' AND "Artikel_Nummer" = $3))`,
        [attachmentId, itemUUID, artikelNummer]
      );
      await ctx.logEvent({
        EntityType: 'Item',
        EntityId: itemUUID,
        Event: 'AttachmentRemoved',
        Meta: JSON.stringify({ fileName: row.FileName })
      });
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: 'method not allowed' });
  },
  view: () => '<div class="card"><p class="muted">Item attachments API</p></div>'
});

export default action;
