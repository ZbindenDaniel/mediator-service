import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'material-number',
  label: 'Material number',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/getNewMaterialNumber' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const maxStr: string | null = await ctx.getMaxArtikelNummer();
      let max = 0;
      if (maxStr) {
        max = parseInt(maxStr, 10) || 0;
      }
      const next = String(max + 1).padStart(6, '0');
      sendJson(res, 200, { nextArtikelNummer: next });
    } catch (err) {
      console.error('Material number endpoint failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Material number API</p></div>'
});

export default action;

