import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { defineHttpAction } from './index';
import { MEDIA_UPLOAD_STAGING_DIR } from '../lib/media';

const ATTACHMENT_ROUTE_RE = /^\/api\/item\/([^/]+)\/attachments(?:\/(\d+))?$/;
const INSTANCES_SUBDIR = 'instances';
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB guard

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function instanceDir(itemUUID: string): string {
  return path.join(MEDIA_UPLOAD_STAGING_DIR, INSTANCES_SUBDIR, itemUUID);
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

    const itemRow = ctx.db.prepare('SELECT ItemUUID FROM items WHERE ItemUUID = ?').get(itemUUID);
    if (!itemRow) return sendJson(res, 404, { error: 'item not found' });

    // ── GET: list attachments ─────────────────────────────────────────────────
    if (method === 'GET') {
      const attachments = ctx.db.prepare(`
        SELECT Id, ItemUUID, FileName, FilePath, MimeType, Label, FileSize, CreatedAt
        FROM item_attachments WHERE ItemUUID = ? ORDER BY CreatedAt DESC
      `).all(itemUUID);
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

      const dir = instanceDir(itemUUID);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, safeName), body);

      const relativePath = [INSTANCES_SUBDIR, itemUUID, safeName].join('/');
      ctx.db.prepare(`
        INSERT INTO item_attachments (ItemUUID, FileName, FilePath, MimeType, Label, FileSize)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(itemUUID, safeName, relativePath, mimeType, label, body.length);

      ctx.logEvent({
        EntityType: 'Item',
        EntityId: itemUUID,
        Event: 'AttachmentAdded',
        Meta: JSON.stringify({ fileName: safeName, mimeType, fileSize: body.length })
      });
      return sendJson(res, 201, { ok: true, fileName: safeName, relativePath });
    }

    // ── DELETE: remove attachment ─────────────────────────────────────────────
    if (method === 'DELETE' && attachmentId !== null) {
      const row = ctx.db.prepare(
        'SELECT Id, FileName, FilePath FROM item_attachments WHERE Id = ? AND ItemUUID = ?'
      ).get(attachmentId, itemUUID) as { Id: number; FileName: string; FilePath: string } | undefined;
      if (!row) return sendJson(res, 404, { error: 'attachment not found' });

      const fullPath = path.join(MEDIA_UPLOAD_STAGING_DIR, row.FilePath);
      try { fs.unlinkSync(fullPath); } catch { /* already gone */ }

      ctx.db.prepare('DELETE FROM item_attachments WHERE Id = ? AND ItemUUID = ?').run(attachmentId, itemUUID);
      ctx.logEvent({
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
