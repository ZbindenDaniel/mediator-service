import type { IncomingMessage, ServerResponse } from 'http';
import { PUBLIC_ORIGIN } from '../config';
import { defineHttpAction } from './index';
import type { AgenticRun } from '../../models';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

type AgenticQueueMode = 'all' | 'instancesOnly' | 'missing';

type QueueCandidate = {
  artikelNummer: string | null;
  referenceOnly: boolean;
};

type AgenticBulkQueueResult = {
  queued: number;
  skipped: number;
};

const action = defineHttpAction({
  key: 'agentic-bulk-queue',
  label: 'Agentic bulk queue',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/agentic/queue' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!req.url) {
      console.warn('[agentic-bulk-queue] Request missing URL reference');
      return sendJson(res, 400, { error: 'Invalid request' });
    }

    const requestUrl = new URL(req.url, PUBLIC_ORIGIN);
    const rawMode = (requestUrl.searchParams.get('mode') || '').trim().toLowerCase();
    const allowedModes: AgenticQueueMode[] = ['all', 'instancesOnly', 'missing'];
    const mode: AgenticQueueMode | null = allowedModes.includes(rawMode as AgenticQueueMode)
      ? (rawMode as AgenticQueueMode)
      : null;

    if (!mode) {
      console.warn('[agentic-bulk-queue] Invalid mode provided', { mode: rawMode });
      return sendJson(res, 400, { error: 'mode must be "all", "instancesOnly", or "missing"' });
    }

    const actor = (requestUrl.searchParams.get('actor') || '').trim();
    if (!actor) {
      console.warn('[agentic-bulk-queue] Missing actor for bulk queue request', { mode });
      return sendJson(res, 400, { error: 'actor is required' });
    }

    let items: Array<{ ItemUUID?: string; Artikel_Nummer?: string | null }> = [];
    try {
      items = ctx.listItems.all();
    } catch (err) {
      console.error('[agentic-bulk-queue] Failed to load items for queue operation', err);
      return sendJson(res, 500, { error: 'Failed to load items' });
    }

    let references: Array<{ Artikel_Nummer?: string | null }> = [];
    try {
      if (ctx.listItemReferences?.all) {
        references = ctx.listItemReferences.all();
      }
    } catch (err) {
      console.error('[agentic-bulk-queue] Failed to load item references for queue operation', err);
      return sendJson(res, 500, { error: 'Failed to load item references' });
    }

    if (!Array.isArray(items)) {
      items = [];
    }

    if (!Array.isArray(references)) {
      references = [];
    }

    // TODO(agent): Capture candidate derivation metrics once reference mode is promoted to production.
    let queueCandidates: QueueCandidate[] = [];
    try {
      const candidateList: QueueCandidate[] = [];
      const artikelCovered = new Set<string>();
      const seenIdentifiers = new Set<string>();

      for (const record of items) {
        try {
          const rawArtikelNummer = typeof (record as { Artikel_Nummer?: string | null })?.Artikel_Nummer === 'string'
            ? ((record as { Artikel_Nummer?: string | null }).Artikel_Nummer as string).trim()
            : '';
          if (!rawArtikelNummer) {
            console.warn('[agentic-bulk-queue] Skipping instance without Artikel_Nummer', { record });
            continue;
          }
          artikelCovered.add(rawArtikelNummer);
          if (seenIdentifiers.has(rawArtikelNummer)) {
            console.info('[agentic-bulk-queue] Skipping duplicate Artikel_Nummer candidate', { artikelNummer: rawArtikelNummer });
            continue;
          }
          seenIdentifiers.add(rawArtikelNummer);
          candidateList.push({
            artikelNummer: rawArtikelNummer || null,
            referenceOnly: false
          });
        } catch (candidateErr) {
          console.error('[agentic-bulk-queue] Failed to derive queue candidate from item', { record }, candidateErr);
        }
      }

      // TODO(agentic-instance-id): Revisit reference-only queue support if instance-less agentic runs return.
      for (const reference of references) {
        try {
          const rawArtikelNummer = typeof reference?.Artikel_Nummer === 'string' ? reference.Artikel_Nummer.trim() : '';
          if (!rawArtikelNummer) {
            console.warn('[agentic-bulk-queue] Skipping reference without Artikel_Nummer', { reference });
            continue;
          }
          if (artikelCovered.has(rawArtikelNummer)) {
            continue;
          }
          if (seenIdentifiers.has(rawArtikelNummer)) {
            continue;
          }
          seenIdentifiers.add(rawArtikelNummer);
          candidateList.push({
            artikelNummer: rawArtikelNummer,
            referenceOnly: true
          });
        } catch (candidateErr) {
          console.error('[agentic-bulk-queue] Failed to derive queue candidate from reference', { reference }, candidateErr);
        }
      }

      queueCandidates = candidateList;
    } catch (err) {
      console.error('[agentic-bulk-queue] Failed to derive queue candidates', err);
      return sendJson(res, 500, { error: 'Failed to derive queue candidates' });
    }

    if (!Array.isArray(queueCandidates) || queueCandidates.length === 0) {
      console.info('[agentic-bulk-queue] No queue candidates available for bulk queue', {
        mode,
        instances: items.length,
        references: references.length
      });
      return sendJson(res, 200, { ok: true, mode, total: 0, queued: 0, skipped: 0 });
    }

    const queueTransaction = ctx.db.transaction(
      (records: QueueCandidate[], options: { mode: AgenticQueueMode; actor: string }): AgenticBulkQueueResult => {
        let queued = 0;
        let skipped = 0;

        for (const record of records) {
          const identifier = record?.artikelNummer?.trim();
          if (!identifier) {
            skipped += 1;
            console.warn('[agentic-bulk-queue] Skipping candidate without Artikel_Nummer', {
              artikelNummer: record?.artikelNummer ?? null,
              referenceOnly: record?.referenceOnly ?? false
            });
            continue;
          }

          if (options.mode === 'instancesOnly' && record.referenceOnly) {
            skipped += 1;
            console.info('[agentic-bulk-queue] Skipping reference-only candidate due to instancesOnly mode', {
              identifier,
              artikelNummer: record.artikelNummer
            });
            continue;
          }

          let existingRun: AgenticRun | undefined;
          try {
            existingRun = ctx.getAgenticRun.get(identifier) as AgenticRun | undefined;
          } catch (loadErr) {
            console.error('[agentic-bulk-queue] Failed to load existing agentic run', { artikelNummer: identifier }, loadErr);
            throw loadErr;
          }

          if (options.mode === 'missing' && existingRun) {
            skipped += 1;
            console.info('[agentic-bulk-queue] Skipping candidate with existing run during missing-mode queue', {
              identifier,
              referenceOnly: record.referenceOnly
            });
            continue;
          }

          const nowIso = new Date().toISOString();
          const upsertPayload = {
            Artikel_Nummer: identifier,
            SearchQuery: existingRun?.SearchQuery ?? null,
            Status: 'queued',
            LastModified: nowIso,
            ReviewState: 'not_required',
            ReviewedBy: null,
            LastReviewDecision: existingRun?.LastReviewDecision ?? null,
            LastReviewNotes: existingRun?.LastReviewNotes ?? null
          };

          try {
            const result = ctx.upsertAgenticRun.run(upsertPayload);
            if (result && typeof result.changes === 'number' && result.changes < 1) {
              throw new Error('Agentic run upsert returned zero changes');
            }
          } catch (upsertErr) {
            console.error('[agentic-bulk-queue] Failed to queue agentic run', { artikelNummer: identifier }, upsertErr);
            throw upsertErr;
          }

          try {
            ctx.logEvent({
              Actor: options.actor,
              EntityType: 'Item',
              EntityId: identifier,
              Event: 'AgenticSearchQueued',
              Meta: JSON.stringify({
                mode: options.mode,
                previousStatus: existingRun?.Status ?? null,
                hadExistingRun: Boolean(existingRun),
                referenceOnly: record.referenceOnly
              })
            });
          } catch (logErr) {
            console.error('[agentic-bulk-queue] Failed to persist log event', { itemUUID: identifier }, logErr);
          }

          queued += 1;
        }

        return { queued, skipped };
      }
    );

    let result: AgenticBulkQueueResult;
    try {
      result = queueTransaction(queueCandidates, { mode, actor });
    } catch (err) {
      console.error('[agentic-bulk-queue] Transaction failed while queuing agentic runs', err);
      return sendJson(res, 500, { error: 'Failed to queue agentic runs' });
    }

    const total = queueCandidates.length;
    console.info('[agentic-bulk-queue] Agentic bulk queue completed', {
      mode,
      total,
      queued: result.queued,
      skipped: result.skipped,
      instances: items.length,
      references: references.length
    });

    return sendJson(res, 200, { ok: true, mode, total, queued: result.queued, skipped: result.skipped });
  },
  view: () => '<div class="card"><p class="muted">Agentic bulk queue API</p></div>'
});

export default action;
