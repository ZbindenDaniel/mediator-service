import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { defineHttpAction } from './index';
import { requireSuperAdminAuth } from '../utils/admin-auth';
import {
  isContractOverlayEnabled,
  contractOverlayWritePath
} from '../contracts/paths';
import { clearContractCaches, listContractSubcategories } from '../contracts/registry';
import { validateContractDocument, validateContractSet, loadContractSetFromDisk } from '../contracts/validate';
import { getItemCategories } from '../lib/taxonomy';
import { parentCodeMap } from '../../models/item-category-lookups';

// Runtime contract editing via the file overlay (see docs/PLANNING_TAXONOMY_EXTERNALIZATION.md
// Phase 4). Download is the existing GET /api/contracts/{type}/<code>; this adds a validated
// upload that writes to CONTRACTS_OVERLAY_DIR (overlay-first read), plus a coverage listing.

type ContractType = 'quality' | 'specs' | 'assembly';
const TYPES: ContractType[] = ['quality', 'specs', 'assembly'];

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Full per-file checks, plus the cross-file rules (targets, cycles, id collisions) for the set as it
// would be after this upload. Only problems the upload introduces are reported, so an unrelated
// pre-existing issue elsewhere does not block every edit. Returns an error string or null.
function validateContract(type: ContractType, code: string, doc: unknown): string | null {
  const own = validateContractDocument(type, doc, `${type}/${code}.json`);
  if (own.length) return own.join('; ');
  let known: Set<number> | undefined;
  let parentCodes: Map<number, number> | undefined;
  try {
    const categories = getItemCategories();
    known = new Set(categories.flatMap((c) => c.subcategories.map((s) => s.code)));
    parentCodes = parentCodeMap(categories);
  } catch {
    known = undefined; // taxonomy not loaded (e.g. tests) — skip the target check rather than fail
  }
  const before = new Set(validateContractSet({ ...loadContractSetFromDisk(), knownSubcategories: known, parentCodes, checkFileCodes: false }));
  const after = validateContractSet({ ...loadContractSetFromDisk({ type, code, doc }), knownSubcategories: known, parentCodes, checkFileCodes: false });
  const introduced = after.filter((e) => !before.has(e));
  return introduced.length ? introduced.join('; ') : null;
}

const UPLOAD_ROUTE = /^\/api\/admin\/contracts\/(quality|specs|assembly)\/([A-Za-z0-9_-]+)$/;

const action = defineHttpAction({
  feature: 'admin-taxonomy',
  key: 'admin-contracts',
  label: 'Admin: contracts',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Admin contracts API</p></div>',
  matches: (p, method) =>
    (p === '/api/admin/contracts' && method === 'GET') ||
    (UPLOAD_ROUTE.test(p) && (method === 'PUT' || method === 'DELETE')),
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireSuperAdminAuth(req, res)) return;
    const url = (req.url || '').split('?')[0];
    const method = req.method || 'GET';

    // GET /api/admin/contracts — coverage: which codes have a contract of each type.
    if (url === '/api/admin/contracts' && method === 'GET') {
      const coverage: Record<string, string[]> = {};
      for (const t of TYPES) coverage[t] = listContractSubcategories(t);
      sendJson(res, 200, { overlayEnabled: isContractOverlayEnabled(), coverage });
      return;
    }

    const match = UPLOAD_ROUTE.exec(url);
    if (!match) { sendJson(res, 404, { error: 'not found' }); return; }
    const type = match[1] as ContractType;
    const code = match[2];

    if (!isContractOverlayEnabled()) {
      sendJson(res, 503, {
        error: 'Contract editing is disabled. Set CONTRACTS_OVERLAY_DIR (a writable, persistent directory) to enable uploads.'
      });
      return;
    }
    const target = contractOverlayWritePath(path.join(type, `${code}.json`));
    if (!target) { sendJson(res, 503, { error: 'Contract overlay not configured' }); return; }

    if (method === 'DELETE') {
      // Revert to the shipped default by removing the overlay copy (no-op if absent).
      try {
        if (fs.existsSync(target)) fs.unlinkSync(target);
        clearContractCaches();
        sendJson(res, 200, { ok: true, reverted: true });
      } catch (err) {
        sendJson(res, 500, { error: `Failed to revert: ${(err as Error).message}` });
      }
      return;
    }

    // PUT — validate then write to the overlay.
    let doc: unknown;
    try {
      doc = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Request body is not valid JSON' });
      return;
    }
    const validationError = validateContract(type, code, doc);
    if (validationError) { sendJson(res, 400, { error: validationError }); return; }

    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(doc, null, 2) + '\n', 'utf8');
      clearContractCaches(); // so the next read picks up the upload immediately
      sendJson(res, 200, { ok: true, type, code });
    } catch (err) {
      sendJson(res, 500, { error: `Failed to write contract: ${(err as Error).message}` });
    }
  }
});

export default action;
