import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { ALT_DOC_DIRS } from '../config';
import { resolveAltDocDirPath, buildExternalDocUrl } from '../lib/alt-doc-resolver';
import { listFilesInAltDocDirectory } from '../lib/media-request';
import type { ExternalDocSummary } from '../../models/external-doc';

const ROUTE_RE = /^\/api\/items\/([^/]+)\/external-docs$/;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'item-external-docs',
  label: 'Item external documents',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Item external documents API</p></div>',
  matches: (p, method) => ROUTE_RE.test(p) && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const urlPath = (req.url || '').split('?')[0];
    const match = urlPath.match(ROUTE_RE);
    if (!match) return sendJson(res, 404, { error: 'not found' });

    const itemUUID = decodeURIComponent(match[1]);

    if (ALT_DOC_DIRS.length === 0) {
      return sendJson(res, 200, { docs: [] });
    }

    const itemRow = ctx.db.prepare(
      'SELECT i.ItemUUID, i.SerialNumber, i.MacAddress, r.EAN FROM items i LEFT JOIN item_refs r ON r.Artikel_Nummer = i.Artikel_Nummer WHERE i.ItemUUID = ?'
    ).get(itemUUID) as { ItemUUID: string; SerialNumber: string | null; MacAddress: string | null; EAN: string | null } | undefined;

    if (!itemRow) return sendJson(res, 404, { error: 'item not found' });

    const ctx2 = {
      itemUUID: itemRow.ItemUUID,
      ean: itemRow.EAN ?? null,
      serialNumber: itemRow.SerialNumber ?? null,
      macAddress: itemRow.MacAddress ?? null
    };

    const docs: ExternalDocSummary[] = ALT_DOC_DIRS.map((dirConfig) => {
      const resolved = resolveAltDocDirPath(ctx2, dirConfig);

      if (!resolved) {
        return {
          name: dirConfig.name,
          docType: dirConfig.docType ?? null,
          identifierType: dirConfig.identifierType,
          available: false,
          reason: 'identifier_not_set',
          fileCount: 0,
          files: []
        };
      }

      let fileNames: string[];
      try {
        fileNames = listFilesInAltDocDirectory(dirConfig.mountPath, resolved.identifierValue);
      } catch {
        return {
          name: dirConfig.name,
          docType: dirConfig.docType ?? null,
          identifierType: dirConfig.identifierType,
          available: false,
          reason: 'directory_unavailable',
          fileCount: 0,
          files: []
        };
      }

      return {
        name: dirConfig.name,
        docType: dirConfig.docType ?? null,
        identifierType: dirConfig.identifierType,
        available: true,
        fileCount: fileNames.length,
        files: fileNames.map((fileName) => ({
          fileName,
          url: buildExternalDocUrl(dirConfig.name, itemUUID, fileName)
        }))
      };
    });

    return sendJson(res, 200, { docs });
  }
});

export default action;
