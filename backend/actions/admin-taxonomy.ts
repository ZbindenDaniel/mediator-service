import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAdminAuth } from '../utils/admin-auth';
import { canonicalizeCategoryLabel } from '../../models/item-categories';
import { reloadTaxonomyFromDb } from '../lib/taxonomy';
import {
  readTaxonomyFromDb,
  taxonomyCategoryExists,
  taxonomySubcategoryExists,
  insertTaxonomyCategory,
  insertTaxonomySubcategory,
  updateTaxonomyCategory,
  updateTaxonomySubcategory
} from '../db';

// Admin CRUD for the DB-backed taxonomy (see docs/PLANNING_TAXONOMY_EXTERNALIZATION.md Phase 4).
// codes are immutable; reparenting + hard-delete are deferred (deactivate via `active`). Every
// write reloads the in-memory cache so the change appears everywhere without a restart.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const CATEGORIES = /^\/api\/admin\/taxonomy\/categories(?:\/(\d+))?$/;
const SUBCATEGORIES = /^\/api\/admin\/taxonomy\/subcategories(?:\/(\d+))?$/;

function resolveLabels(body: Record<string, unknown>): { labelExternal: string; labelInternal: string } | null {
  const labelExternal = String(body.labelExternal ?? '').trim();
  if (!labelExternal) return null;
  const labelInternal = String(body.labelInternal ?? canonicalizeCategoryLabel(labelExternal)).trim();
  return { labelExternal, labelInternal };
}

const action = defineHttpAction({
  key: 'admin-taxonomy',
  label: 'Admin: taxonomy',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Admin taxonomy API</p></div>',
  matches: (p, method) => {
    if (!['GET', 'POST', 'PUT'].includes(method)) return false;
    return p === '/api/admin/taxonomy' || CATEGORIES.test(p) || SUBCATEGORIES.test(p);
  },
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireAdminAuth(req, res)) return;
    const url = (req.url || '').split('?')[0];
    const method = req.method || 'GET';

    try {
      // GET full taxonomy (incl. inactive) for the editor.
      if (url === '/api/admin/taxonomy' && method === 'GET') {
        sendJson(res, 200, { categories: await readTaxonomyFromDb() });
        return;
      }

      const catMatch = CATEGORIES.exec(url);
      const subMatch = SUBCATEGORIES.exec(url);

      // --- Categories ---
      if (catMatch && method === 'POST') {
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const code = Number(body.code);
        if (!Number.isInteger(code)) { sendJson(res, 400, { error: '"code" must be an integer' }); return; }
        const labels = resolveLabels(body);
        if (!labels) { sendJson(res, 400, { error: '"labelExternal" is required' }); return; }
        if (await taxonomyCategoryExists(code)) { sendJson(res, 409, { error: `category ${code} already exists` }); return; }
        await insertTaxonomyCategory({ code, ...labels, sortOrder: body.sortOrder as number, active: body.active as boolean });
        await reloadTaxonomyFromDb();
        sendJson(res, 200, { ok: true, code });
        return;
      }
      if (catMatch && catMatch[1] && method === 'PUT') {
        const code = Number(catMatch[1]);
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const n = await updateTaxonomyCategory(code, {
          labelInternal: body.labelInternal as string,
          labelExternal: body.labelExternal as string,
          sortOrder: body.sortOrder as number,
          active: body.active as boolean
        });
        if (n === 0) { sendJson(res, 404, { error: `category ${code} not found (or no fields to update)` }); return; }
        await reloadTaxonomyFromDb();
        sendJson(res, 200, { ok: true, code });
        return;
      }

      // --- Subcategories ---
      if (subMatch && method === 'POST') {
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const code = Number(body.code);
        const parentCode = Number(body.parentCode);
        if (!Number.isInteger(code)) { sendJson(res, 400, { error: '"code" must be an integer' }); return; }
        if (!Number.isInteger(parentCode)) { sendJson(res, 400, { error: '"parentCode" must be an integer' }); return; }
        const labels = resolveLabels(body);
        if (!labels) { sendJson(res, 400, { error: '"labelExternal" is required' }); return; }
        if (!(await taxonomyCategoryExists(parentCode))) { sendJson(res, 400, { error: `parent category ${parentCode} does not exist` }); return; }
        if (await taxonomySubcategoryExists(code)) { sendJson(res, 409, { error: `subcategory ${code} already exists` }); return; }
        await insertTaxonomySubcategory({
          code, parentCode, ...labels,
          sortOrder: body.sortOrder as number, active: body.active as boolean,
          categorizerDescription: (body.categorizerDescription as string) ?? null,
          intakeEnabled: body.intakeEnabled as boolean,
          intakeLabel: (body.intakeLabel as string) ?? null,
          intakeSortOrder: (body.intakeSortOrder as number) ?? null,
          aliases: (body.aliases as string[]) ?? null
        });
        await reloadTaxonomyFromDb();
        sendJson(res, 200, { ok: true, code });
        return;
      }
      if (subMatch && subMatch[1] && method === 'PUT') {
        const code = Number(subMatch[1]);
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const n = await updateTaxonomySubcategory(code, {
          labelInternal: body.labelInternal as string,
          labelExternal: body.labelExternal as string,
          sortOrder: body.sortOrder as number,
          active: body.active as boolean,
          categorizerDescription: body.categorizerDescription as string | null,
          intakeEnabled: body.intakeEnabled as boolean,
          intakeLabel: body.intakeLabel as string | null,
          intakeSortOrder: body.intakeSortOrder as number | null,
          aliases: body.aliases as string[] | null
        });
        if (n === 0) { sendJson(res, 404, { error: `subcategory ${code} not found (or no fields to update)` }); return; }
        await reloadTaxonomyFromDb();
        sendJson(res, 200, { ok: true, code });
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      sendJson(res, 500, { error: `Taxonomy update failed: ${(err as Error).message}` });
    }
  }
});

export default action;
