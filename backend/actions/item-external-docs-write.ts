import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { ALT_DOC_DIRS } from '../config';
import { resolveAltDocDirPath, buildExternalDocUrl } from '../lib/alt-doc-resolver';
import { resolvePathWithinRoot } from '../lib/path-guard';
import { emitMediaAudit } from '../lib/media-audit';
import { queryOne } from '../db-client';

// Matches both POST (no filename segment) and DELETE (with filename segment)
const ROUTE_RE = /^\/api\/items\/([^/]+)\/external-docs\/([^/]+)(?:\/(.+))?$/;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'item-external-docs-write',
  label: 'Item external documents write/delete',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Item external documents write API</p></div>',
  matches: (p, method) => ROUTE_RE.test(p) && (method === 'POST' || method === 'DELETE'),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const method = req.method || '';
    const urlPath = (req.url || '').split('?')[0];
    const match = urlPath.match(ROUTE_RE);
    if (!match) return sendJson(res, 404, { error: 'not found' });

    const itemUUID = decodeURIComponent(match[1]);
    const dirName = decodeURIComponent(match[2]);
    const fileNameParam = match[3] ? decodeURIComponent(match[3]) : null;

    const dirConfig = ALT_DOC_DIRS.find(d => d.name === dirName);
    if (!dirConfig) return sendJson(res, 404, { error: 'directory not found' });

    // SN:/MAC: prefix bypasses DB lookup so Phase 2 can upload before item creation
    let ctx2: { itemUUID: string; ean: string | null; serialNumber: string | null; macAddress: string | null };
    let resolvedArtikelNummer: string | null = null;
    if (itemUUID.startsWith('SN:') || itemUUID.startsWith('MAC:')) {
      const isSN = itemUUID.startsWith('SN:');
      const identifierValue = itemUUID.slice(isSN ? 3 : 4);
      ctx2 = {
        itemUUID,
        ean: null,
        serialNumber: isSN ? identifierValue : null,
        macAddress: isSN ? null : identifierValue,
      };
    } else {
      const itemRow = await queryOne<{ ItemUUID: string; Artikel_Nummer: string | null; SerialNumber: string | null; MacAddress: string | null; EAN: string | null }>(
        'SELECT i."ItemUUID", i."Artikel_Nummer", i."SerialNumber", i."MacAddress", r."EAN" FROM items i LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer" WHERE i."ItemUUID" = $1',
        [itemUUID]
      );
      if (!itemRow) return sendJson(res, 404, { error: 'item not found' });
      resolvedArtikelNummer = itemRow.Artikel_Nummer ?? null;
      ctx2 = {
        itemUUID: itemRow.ItemUUID,
        ean: itemRow.EAN ?? null,
        serialNumber: itemRow.SerialNumber ?? null,
        macAddress: itemRow.MacAddress ?? null,
      };
    }

    const resolved = resolveAltDocDirPath(ctx2, dirConfig);
    if (!resolved) return sendJson(res, 422, { error: 'identifier_not_set' });

    const identifier = {
      artikelNummer: resolvedArtikelNummer,
      itemUUID,
      altIdentifierType: dirConfig.identifierType,
      altIdentifierValue: resolved.identifierValue
    };

    // ── POST: upload file ─────────────────────────────────────────────────────
    if (method === 'POST') {
      if (!dirConfig.writable) {
        return sendJson(res, 403, { error: 'directory_not_writable' });
      }

      const rawFilename = req.headers['x-filename'];
      const fileName = typeof rawFilename === 'string' ? path.basename(rawFilename.trim()) : null;
      if (!fileName) return sendJson(res, 400, { error: 'X-Filename header is required' });

      const safeName = fileName.replace(/[^\w.\-]/g, '_');
      if (!safeName || safeName === '.' || safeName === '..') {
        return sendJson(res, 400, { error: 'invalid filename' });
      }

      const targetPath = resolvePathWithinRoot(resolved.dirPath, safeName, { operation: `external-docs-upload:${dirName}` });
      if (!targetPath) return sendJson(res, 400, { error: 'invalid path' });

      emitMediaAudit({ action: 'write', scope: 'external-docs', identifier, path: targetPath, root: dirConfig.mountPath, outcome: 'start', reason: null });

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      try {
        for await (const chunk of req) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buf.length;
          if (totalBytes > MAX_UPLOAD_BYTES) {
            return sendJson(res, 413, { error: 'file too large' });
          }
          chunks.push(buf);
        }
      } catch (error) {
        emitMediaAudit({ action: 'write', scope: 'external-docs', identifier, path: targetPath, root: dirConfig.mountPath, outcome: 'error', reason: 'read_error', error });
        return sendJson(res, 500, { error: 'upload read failed' });
      }

      if (chunks.length === 0) return sendJson(res, 400, { error: 'empty file body' });

      try {
        fs.mkdirSync(resolved.dirPath, { recursive: true });
        fs.writeFileSync(targetPath, Buffer.concat(chunks));
      } catch (error) {
        emitMediaAudit({ action: 'write', scope: 'external-docs', identifier, path: targetPath, root: dirConfig.mountPath, outcome: 'error', reason: 'write_failed', error });
        return sendJson(res, 500, { error: 'write failed' });
      }

      emitMediaAudit({ action: 'write', scope: 'external-docs', identifier, path: targetPath, root: dirConfig.mountPath, outcome: 'success', reason: null });
      const url = buildExternalDocUrl(dirName, itemUUID, safeName);
      return sendJson(res, 201, { ok: true, fileName: safeName, url });
    }

    // ── DELETE: remove file ───────────────────────────────────────────────────
    if (method === 'DELETE') {
      if (!dirConfig.deletable) {
        return sendJson(res, 403, { error: 'directory_not_deletable' });
      }

      if (!fileNameParam) return sendJson(res, 400, { error: 'filename required' });

      const safeName = path.basename(fileNameParam);
      if (!safeName || safeName === '.' || safeName === '..') {
        return sendJson(res, 400, { error: 'invalid filename' });
      }

      const targetPath = resolvePathWithinRoot(resolved.dirPath, safeName, { operation: `external-docs-delete:${dirName}` });
      if (!targetPath) return sendJson(res, 400, { error: 'invalid path' });

      emitMediaAudit({ action: 'delete', scope: 'external-docs', identifier, path: targetPath, root: dirConfig.mountPath, outcome: 'start', reason: null });

      try {
        fs.unlinkSync(targetPath);
      } catch (error) {
        emitMediaAudit({ action: 'delete', scope: 'external-docs', identifier, path: targetPath, root: dirConfig.mountPath, outcome: 'error', reason: 'unlink_failed', error });
        return sendJson(res, 500, { error: 'delete failed' });
      }

      emitMediaAudit({ action: 'delete', scope: 'external-docs', identifier, path: targetPath, root: dirConfig.mountPath, outcome: 'success', reason: null });
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: 'method not allowed' });
  }
});

export default action;
