import type { IncomingMessage, ServerResponse } from 'http';
import { resolveActor } from '../utils/actor';
import { defineHttpAction } from './index';
import { withTransaction } from '../db-client';
import { canDeleteReference } from '../lib/ownership';

// Delete a catalogue reference (§7 M2c). Deletion is a tenant-admin capability — any reference —
// guarded here (operators never reach it). An in-use guard blocks deleting a reference that still
// has instances, so instances are never orphaned; the operator removes the instances first.
// Deferred: Shopware product cleanup (shop sync is deployment-wide/feature-flagged; a ref with no
// instances carries no instance-driven shop presence) — noted in PLANNING_TENANCY.md §7.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'delete-reference',
  label: 'Delete reference',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/references\/[^/]+\/delete$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/references\/([^/]+)\/delete$/);
      const artikelNummer = match ? decodeURIComponent(match[1]) : '';
      if (!artikelNummer) return sendJson(res, 400, { error: 'invalid path' });

      // Role gate first: deleting shared-catalogue data is tenant-admin+ (no owner lookup needed).
      if (!canDeleteReference(ctx?.identity)) {
        return sendJson(res, 403, { error: 'Referenzen löschen ist Organisations-Admins vorbehalten.' });
      }

      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const actor = resolveActor(ctx, (data.actor || '').trim());
      const confirm = !!data.confirm;
      if (!actor || !confirm) return sendJson(res, 400, { error: 'actor and confirm=true required' });

      const ref = ctx.getItemReference ? await ctx.getItemReference(artikelNummer) : null;
      if (!ref) return sendJson(res, 404, { error: 'reference not found' });

      const instanceCount = await ctx.countInstancesForReference(artikelNummer);
      if (instanceCount > 0) {
        // In-use guard: a reference with instances can't be deleted — remove the instances first.
        return sendJson(res, 409, { error: 'reference in use', instanceCount });
      }

      await withTransaction(async () => {
        await ctx.deleteItemReference(artikelNummer);
        await ctx.logEvent({
          Actor: actor,
          EntityType: 'Reference',
          EntityId: artikelNummer,
          Event: 'Deleted',
          Meta: null
        });
      });
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Delete reference failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Delete reference API</p></div>'
});

export default action;
