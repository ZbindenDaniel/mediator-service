import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { normalizeQuality } from '../../models/quality';
import { stringifyLangtext } from '../lib/langtext';
import { execute, queryOne } from '../db-client';

// Normalize an operator-supplied InstanceSpecs object into a canonical string→string map.
// Returns `null` (clear the column) when no meaningful entries remain, so deleting every
// spec row is a valid correction. Non-object payloads yield `undefined` (leave untouched).
function normalizeInstanceSpecs(raw: unknown): Record<string, string> | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = key.trim();
    if (!k) continue;
    const v = value == null ? '' : String(value).trim();
    if (!v) continue; // an empty value means the operator cleared that spec row
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'edit-item-instance',
  label: 'Edit item instance',
  appliesTo: () => false,
  matches: (path, method) => /^\/api\/items\/[^/]+\/instance$/.test(path) && method === 'PATCH',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/items\/([^/]+)\/instance$/);
      const uuid = match ? decodeURIComponent(match[1]) : '';
      if (!uuid) return sendJson(res, 400, { error: 'invalid item id' });
      const item = await queryOne('SELECT "ItemUUID" FROM items WHERE "ItemUUID" = $1', [uuid]);
      if (!item) return sendJson(res, 404, { error: 'item not found' });

      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}

      const actor = (data.actor || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });

      const serialNumber = 'SerialNumber' in data
        ? (typeof data.SerialNumber === 'string' ? data.SerialNumber.trim() || null : null)
        : undefined;
      const macAddress = 'MacAddress' in data
        ? (typeof data.MacAddress === 'string' ? data.MacAddress.trim() || null : null)
        : undefined;
      const quality = 'Quality' in data
        ? normalizeQuality(data.Quality, console)
        : undefined;
      const instanceSpecs = 'InstanceSpecs' in data
        ? normalizeInstanceSpecs(data.InstanceSpecs)
        : undefined;

      if (serialNumber === undefined && macAddress === undefined && quality === undefined && instanceSpecs === undefined) {
        return sendJson(res, 400, { error: 'no editable fields provided' });
      }

      const setClauses: string[] = [];
      const params: unknown[] = [];
      const changed: Record<string, unknown> = {};

      if (serialNumber !== undefined) {
        params.push(serialNumber);
        setClauses.push(`"SerialNumber"=$${params.length}`);
        changed.SerialNumber = serialNumber;
      }
      if (macAddress !== undefined) {
        params.push(macAddress);
        setClauses.push(`"MacAddress"=$${params.length}`);
        changed.MacAddress = macAddress;
      }
      if (quality !== undefined) {
        params.push(quality);
        setClauses.push(`"Quality"=$${params.length}`);
        changed.Quality = quality;
      }
      if (instanceSpecs !== undefined) {
        // Full-replace semantics (not the intake merge helper) so the operator can also delete specs.
        const serialized = instanceSpecs === null ? null : stringifyLangtext(instanceSpecs);
        params.push(serialized);
        setClauses.push(`"InstanceSpecs"=$${params.length}`);
        changed.InstanceSpecs = serialized;
      }
      params.push(new Date().toISOString());
      setClauses.push(`"UpdatedAt"=$${params.length}`);
      params.push(uuid);

      await execute(`UPDATE items SET ${setClauses.join(', ')} WHERE "ItemUUID"=$${params.length}`, params);
      await ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: uuid,
        Event: 'InstanceUpdated',
        Meta: JSON.stringify(changed)
      });

      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[edit-item-instance] Failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Edit item instance API</p></div>'
});

export default action;
