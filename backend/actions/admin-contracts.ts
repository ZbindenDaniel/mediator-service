import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { defineHttpAction } from './index';
import { requireAdminAuth } from '../utils/admin-auth';
import {
  isContractOverlayEnabled,
  contractOverlayWritePath
} from '../contracts/paths';
import { clearContractCaches, listContractSubcategories } from '../contracts/registry';

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

// Minimal structural validation — enough to keep a malformed contract out of the pipeline without
// duplicating the full TS types. Returns an error string or null.
function validateContract(type: ContractType, doc: unknown): string | null {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'Contract must be a JSON object';
  const c = doc as Record<string, unknown>;
  if (c.version !== undefined && typeof c.version !== 'number') return '"version" must be a number';
  if (type === 'quality') {
    if (!Array.isArray(c.questions)) return '"questions" must be an array';
    for (const q of c.questions as unknown[]) {
      if (!q || typeof q !== 'object') return 'each question must be an object';
      const qq = q as Record<string, unknown>;
      if (typeof qq.id !== 'string' || !qq.id.trim()) return 'each question needs a non-empty string "id"';
      if (typeof qq.type !== 'string') return `question "${qq.id}" needs a string "type"`;
    }
  } else if (type === 'specs') {
    if (!Array.isArray(c.fields)) return '"fields" must be an array';
    for (const f of c.fields as unknown[]) {
      if (!f || typeof f !== 'object') return 'each field must be an object';
      const ff = f as Record<string, unknown>;
      if (typeof ff.key !== 'string' || !ff.key.trim()) return 'each field needs a non-empty string "key"';
      if (typeof ff.required !== 'boolean') return `field "${ff.key}" needs a boolean "required"`;
    }
    if (c.guidance !== undefined && !Array.isArray(c.guidance)) return '"guidance" must be an array of strings';
  } else if (type === 'assembly') {
    if (!Array.isArray(c.parts)) return '"parts" must be an array';
    for (const p of c.parts as unknown[]) {
      if (!p || typeof p !== 'object') return 'each part must be an object';
    }
  }
  return null;
}

const UPLOAD_ROUTE = /^\/api\/admin\/contracts\/(quality|specs|assembly)\/([A-Za-z0-9_-]+)$/;

const action = defineHttpAction({
  key: 'admin-contracts',
  label: 'Admin: contracts',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Admin contracts API</p></div>',
  matches: (p, method) =>
    (p === '/api/admin/contracts' && method === 'GET') ||
    (UPLOAD_ROUTE.test(p) && (method === 'PUT' || method === 'DELETE')),
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireAdminAuth(req, res)) return;
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
    const validationError = validateContract(type, doc);
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
