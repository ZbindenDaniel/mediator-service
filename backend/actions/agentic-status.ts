import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { AGENTIC_RUN_STATUS_APPROVED, AGENTIC_RUN_STATUS_REJECTED, type Item } from '../../models';
import { getAgenticStatus, normalizeAgenticStatusUpdate } from '../agentic';
import { resolvePriceByCategoryAndType } from '../lib/priceLookup';
import { parseSequentialItemUUID } from '../lib/itemIds';

// TODO(agentic-ui): Consolidate agentic status shaping once a shared typed client is available.
// TODO(agent): Extract review-time side effects (like price defaults) into a dedicated helper to simplify reuse.
// TODO(agentic-review-close): Add focused tests for the manual agentic review close endpoint.
// TODO(agentic-close-not-started): Validate close flow for not-started runs after import/export restores.

export function applyPriceFallbackAfterReview(
  itemId: string,
  ctx: {
    getItem: { get: (id: string) => Item | undefined };
    persistItem?: (item: Item) => void;
    persistItemWithinTransaction?: (item: Item) => void;
  },
  logger: Pick<Console, 'debug' | 'error' | 'info' | 'warn'> = console
): void {
  let item: Item | undefined;
  try {
    item = ctx.getItem.get(itemId);
  } catch (error) {
    logger.error?.('[agentic-review] Failed to load item for price lookup', { itemId, error });
    return;
  }

  if (!item) {
    logger.warn?.('[agentic-review] Item not found for price fallback', { itemId });
    return;
  }

  if (typeof item.Verkaufspreis === 'number' && Number.isFinite(item.Verkaufspreis)) {
    logger.debug?.('[agentic-review] Skipping price fallback because item already has a price', {
      itemId,
      verkaufspreis: item.Verkaufspreis
    });
    return;
  }

  const fallbackPrice = resolvePriceByCategoryAndType(
    {
      hauptkategorien: [item.Hauptkategorien_A, item.Hauptkategorien_B],
      unterkategorien: [item.Unterkategorien_A, item.Unterkategorien_B],
      artikeltyp: item.Artikeltyp
    },
    logger
  );

  if (fallbackPrice === null) {
    logger.info?.('[agentic-review] No fallback price resolved during review completion', {
      itemId,
      hauptkategorien: [item.Hauptkategorien_A, item.Hauptkategorien_B],
      unterkategorien: [item.Unterkategorien_A, item.Unterkategorien_B],
      artikeltyp: item.Artikeltyp ?? null
    });
    return;
  }

  const persistItem = ctx.persistItem ?? ctx.persistItemWithinTransaction;
  if (typeof persistItem !== 'function') {
    logger.error?.('[agentic-review] Persistence helper unavailable; cannot apply fallback price', { itemId });
    return;
  }

  try {
    const updatedItem: Item = {
      ...item,
      Verkaufspreis: fallbackPrice,
      UpdatedAt: new Date()
    };
    persistItem(updatedItem);
    logger.info?.('[agentic-review] Applied fallback sale price after review', {
      itemId,
      appliedPrice: fallbackPrice
    });
  } catch (error) {
    logger.error?.('[agentic-review] Failed to persist fallback sale price after review', { itemId, error });
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function resolveArtikelNummerForAgentic(
  itemId: string,
  ctx: { getItem?: { get: (id: string) => Item | undefined } },
  logger: Pick<Console, 'error' | 'warn'> = console
): string | null {
  const trimmed = typeof itemId === 'string' ? itemId.trim() : '';
  if (!trimmed) {
    return null;
  }

  if (ctx.getItem?.get) {
    try {
      const item = ctx.getItem.get(trimmed);
      const artikelNummer = typeof item?.Artikel_Nummer === 'string' ? item.Artikel_Nummer.trim() : '';
      if (artikelNummer) {
        return artikelNummer;
      }
    } catch (error) {
      logger.error?.('[agentic-status] Failed to resolve Artikel_Nummer from item lookup', { itemId: trimmed, error });
    }
  }

  const parsed = parseSequentialItemUUID(trimmed);
  if (parsed?.kind === 'artikelnummer' && parsed.artikelNummer) {
    return parsed.artikelNummer;
  }

  if (!trimmed.startsWith('I-')) {
    return trimmed;
  }

  logger.warn?.('[agentic-status] Missing Artikel_Nummer for agentic run lookup', { itemId: trimmed });
  return null;
}

const action = defineHttpAction({
  key: 'agentic-status',
  label: 'Agentic status',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => {
    if (method === 'GET') return /^\/api\/items\/[^/]+\/agentic$/.test(path);
    if (method === 'POST') return /^\/api\/items\/[^/]+\/agentic\/(review|close)$/.test(path);
    return false;
  },
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const url = req.url || '';
    const match = url.match(/^\/api\/items\/([^/]+)\/agentic(?:\/(review|close))?$/);
    const itemId = match ? decodeURIComponent(match[1]) : '';
    const action = match && match[2] ? match[2] : null;
    if (!itemId) {
      return sendJson(res, 400, { error: 'Invalid item id' });
    }

    if (req.method === 'GET') {
      if (action) {
        return sendJson(res, 405, { error: 'Method not allowed' });
      }
      try {
        const artikelNummer = resolveArtikelNummerForAgentic(itemId, ctx);
        if (!artikelNummer) {
          return sendJson(res, 400, { error: 'Missing Artikel_Nummer for agentic status lookup' });
        }
        const result = getAgenticStatus(artikelNummer, {
          db: ctx.db,
          getAgenticRun: ctx.getAgenticRun,
          getItemReference: ctx.getItemReference,
          upsertAgenticRun: ctx.upsertAgenticRun,
          updateAgenticRunStatus: ctx.updateAgenticRunStatus,
          logEvent: ctx.logEvent,
          logger: console,
          now: () => new Date()
        });
        const payload = {
          agentic: result.agentic,
          lastError: result.agentic?.LastError ?? null,
          lastAttemptAt: result.agentic?.LastAttemptAt ?? null
        };
        return sendJson(res, 200, payload);
      } catch (err) {
        console.error('Fetch agentic status failed', err);
        return sendJson(res, 500, { error: (err as Error).message });
      }
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    try {
      let raw = '';
      try {
        for await (const chunk of req) raw += chunk;
      } catch (err) {
        console.error('Failed to read agentic review request body', err);
        return sendJson(res, 400, { error: 'Invalid request body' });
      }

      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (err) {
        console.error('Failed to parse agentic review payload', err);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }

      const actor = typeof data.actor === 'string' ? data.actor.trim() : '';
      const notes = typeof data.notes === 'string' ? data.notes.trim() : '';
      const decision =
        action === 'close'
          ? 'approved'
          : typeof data.decision === 'string'
            ? data.decision.trim().toLowerCase()
            : '';

      if (!actor) {
        return sendJson(res, 400, { error: 'actor is required' });
      }
      if (!['approved', 'rejected'].includes(decision)) {
        return sendJson(res, 400, { error: 'decision must be approved or rejected' });
      }

      const reviewedAt = new Date().toISOString();
      const status = decision === 'approved' ? AGENTIC_RUN_STATUS_APPROVED : AGENTIC_RUN_STATUS_REJECTED;
      const artikelNummer = resolveArtikelNummerForAgentic(itemId, ctx);
      if (!artikelNummer) {
        return sendJson(res, 400, { error: 'Missing Artikel_Nummer for agentic review' });
      }

      try {
        if (action === 'close') {
          let run: any;
          try {
            run = ctx.getAgenticRun.get(artikelNummer);
          } catch (err) {
            console.error('Failed to load agentic run for close request', err);
            return sendJson(res, 500, { error: 'Failed to load agentic run' });
          }

          if (!run) {
            const upsertResult = ctx.upsertAgenticRun.run({
              Artikel_Nummer: artikelNummer,
              SearchQuery: null,
              Status: status,
              LastModified: reviewedAt,
              ReviewState: decision,
              ReviewedBy: actor,
              LastReviewDecision: decision,
              LastReviewNotes: notes || null
            });
            if (!upsertResult || upsertResult.changes === 0) {
              console.error('Agentic close upsert had no effect for', itemId);
              return sendJson(res, 500, { error: 'Failed to update review state' });
            }
          } else {
            const result = ctx.updateAgenticReview.run({
              Artikel_Nummer: artikelNummer,
              ReviewState: decision,
              ReviewedBy: actor,
              LastModified: reviewedAt,
              Status: status,
              LastReviewDecision: decision,
              LastReviewNotes: notes || null
            });
            if (!result || result.changes === 0) {
              console.error('Agentic review update had no effect for', itemId);
              return sendJson(res, 500, { error: 'Failed to update review state' });
            }
          }
        } else {
          let run: any;
          try {
            run = ctx.getAgenticRun.get(artikelNummer);
          } catch (err) {
            console.error('Failed to load agentic run for review request', err);
            return sendJson(res, 500, { error: 'Failed to load agentic run' });
          }
          if (!run) {
            return sendJson(res, 404, { error: 'Agentic run not found' });
          }

          const result = ctx.updateAgenticReview.run({
            Artikel_Nummer: artikelNummer,
            ReviewState: decision,
            ReviewedBy: actor,
            LastModified: reviewedAt,
            Status: status,
            LastReviewDecision: decision,
            LastReviewNotes: notes || null
          });
          if (!result || result.changes === 0) {
            console.error('Agentic review update had no effect for', itemId);
            return sendJson(res, 500, { error: 'Failed to update review state' });
          }
        }

        if (decision === 'rejected') {
          try {
            ctx.updateAgenticRunStatus.run(
              normalizeAgenticStatusUpdate({
                Artikel_Nummer: artikelNummer,
                LastAttemptAt: null,
                LastAttemptAtIsSet: true,
                LastError: null,
                LastErrorIsSet: true,
                NextRetryAt: null,
                NextRetryAtIsSet: true,
                RetryCount: 0,
                RetryCountIsSet: true
              })
            );
          } catch (clearErr) {
            console.error('Failed to clear agentic run data after rejection', clearErr);
          }
        }
      } catch (err) {
        console.error('Failed to update agentic review', err);
        return sendJson(res, 500, { error: (err as Error).message });
      }

      ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: artikelNummer,
        Event: decision === 'approved' ? 'AgenticReviewApproved' : 'AgenticReviewRejected',
        Meta: JSON.stringify(
          action === 'close' ? { decision, reason: 'manual-close', notes } : { decision, notes }
        )
      });

      if (decision === 'approved') {
        try {
          applyPriceFallbackAfterReview(itemId, ctx, console);
        } catch (err) {
          console.error('Failed to apply fallback sale price after review', err);
        }
      }

      try {
        const result = getAgenticStatus(itemId, {
          db: ctx.db,
          getAgenticRun: ctx.getAgenticRun,
          getItemReference: ctx.getItemReference,
          upsertAgenticRun: ctx.upsertAgenticRun,
          updateAgenticRunStatus: ctx.updateAgenticRunStatus,
          logEvent: ctx.logEvent,
          logger: console,
          now: () => new Date()
        });
        return sendJson(res, 200, { agentic: result.agentic });
      } catch (err) {
        console.error('Failed to load updated agentic status', err);
        return sendJson(res, 500, { error: (err as Error).message });
      }
    } catch (err) {
      console.error('Agentic review handling failed', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic review API</p></div>'
});

export default action;
