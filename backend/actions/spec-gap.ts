import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { getSpecContract } from '../contracts/registry';
import { checkSpecGap } from '../../models/spec-contract';
import { parseLangtext } from '../lib/langtext';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'spec-gap',
  label: 'Spec gap analysis',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/items/spec-gaps' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const subcategoryRaw = url.searchParams.get('subcategory');
      const includeDesired = url.searchParams.get('includeDesired') === 'true';

      if (!subcategoryRaw) {
        sendJson(res, 400, { error: 'Missing required query param: subcategory' });
        return;
      }

      const subcategoryCode = parseInt(subcategoryRaw, 10);
      if (isNaN(subcategoryCode)) {
        sendJson(res, 400, { error: 'subcategory must be an integer' });
        return;
      }

      const contract = getSpecContract(subcategoryCode);
      if (!contract) {
        sendJson(res, 404, { error: 'No spec contract found for subcategory', subCategory: subcategoryCode });
        return;
      }

      const rows = ctx.db
        .prepare(
          `SELECT Artikel_Nummer, Langtext
           FROM item_refs
           WHERE CAST(Unterkategorien_A AS INTEGER) = @subcategory
             AND Langtext IS NOT NULL`
        )
        .all({ subcategory: subcategoryCode }) as Array<{ Artikel_Nummer: string; Langtext: string | null }>;

      const items: Array<{
        artikelNummer: string;
        missingRequired: string[];
        missingDesired: string[];
        presentFields: string[];
      }> = [];

      for (const row of rows) {
        const langtext = parseLangtext(row.Langtext, { context: 'spec-gap' });
        const langtextObj = langtext && typeof langtext === 'object' && !Array.isArray(langtext)
          ? (langtext as Record<string, unknown>)
          : {};
        const gap = checkSpecGap(contract, langtextObj);
        if (gap.missingRequired.length > 0 || (includeDesired && gap.missingDesired.length > 0)) {
          items.push({
            artikelNummer: row.Artikel_Nummer,
            missingRequired: gap.missingRequired,
            missingDesired: gap.missingDesired,
            presentFields: gap.presentFields
          });
        }
      }

      sendJson(res, 200, {
        subcategory: subcategoryCode,
        contractVersion: contract.version,
        total: rows.length,
        withGaps: items.length,
        items
      });
    } catch (err) {
      console.error('[spec-gap] Failed to compute spec gaps', { error: err });
      sendJson(res, 500, { error: 'Failed to compute spec gaps' });
    }
  },
  view: () => '<div class="card"><p class="muted">Spec gap analysis API</p></div>'
});

export default action;
