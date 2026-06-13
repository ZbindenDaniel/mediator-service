import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { defineHttpAction } from './index';
import { query } from '../db-client';
import { checkMediaDirectories, probeImageFile } from '../lib/media-health';
import { resolveFetchMediaRoots, formatArtikelNummerForMedia } from '../lib/media';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const IMAGE_PROBE_COUNT = 10;

const action = defineHttpAction({
  key: 'media-health',
  label: 'Media health',
  appliesTo: () => false,
  matches: (reqPath: string, method: string) => reqPath === '/api/media/health' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse) {
    try {
      const dirs = await checkMediaDirectories();
      const fetchRoots = resolveFetchMediaRoots();
      let imageProbe = null;

      try {
        const rows = await query<{ Grafikname: string; Artikel_Nummer: string | null }>(
          `SELECT "Grafikname", "Artikel_Nummer" FROM item_refs
           WHERE "Grafikname" IS NOT NULL AND "Grafikname" != ''
           ORDER BY RANDOM() LIMIT $1`,
          [IMAGE_PROBE_COUNT]
        );

        const probeResults = await Promise.all(
          rows.rows.map(async (row) => {
            const folder = formatArtikelNummerForMedia(row.Artikel_Nummer);
            const relativePath = folder
              ? path.posix.join(folder, row.Grafikname)
              : row.Grafikname;
            const accessible = await probeImageFile(fetchRoots, relativePath);
            return { relativePath, accessible };
          })
        );

        imageProbe = {
          sampled: probeResults.length,
          accessible: probeResults.filter((r) => r.accessible).length,
          unreachable: probeResults.filter((r) => !r.accessible).map((r) => r.relativePath),
        };
      } catch (err) {
        console.warn('[media-health] Image probe failed', err);
      }

      const dirOk = dirs.staging.accessible && (dirs.webdav === null || dirs.webdav.accessible);
      // All-zero image probe (sampled > 0 but none reachable) marks degraded
      const imageOk = imageProbe === null || imageProbe.sampled === 0 || imageProbe.accessible > 0;
      const ok = dirOk && imageOk;

      sendJson(res, ok ? 200 : 503, { ok, ...dirs, imageProbe });
    } catch (err) {
      console.error('[media-health] Unexpected error checking media health', err);
      sendJson(res, 500, { ok: false, error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Media health API</p></div>',
});

export default action;
