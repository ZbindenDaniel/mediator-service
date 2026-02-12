import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { AGENTIC_RUN_STATUS_APPROVED, AGENTIC_RUN_STATUS_REJECTED, type ItemRef } from '../../models';
import { getAgenticStatus, normalizeAgenticStatusUpdate } from '../agentic';
import { resolvePriceByCategoryAndType } from '../lib/priceLookup';

// TODO(agentic-ui): Consolidate agentic status shaping once a shared typed client is available.
// TODO(agent): Extract review-time side effects (like price defaults) into a dedicated helper to simplify reuse.
// TODO(agentic-review-close): Add focused tests for the manual agentic review close endpoint.
// TODO(agentic-close-not-started): Validate close flow for not-started runs after import/export restores.

// TODO(agentic-review-ref): Confirm reference-only price fallback once review flows stop expecting instance payloads.
// TODO(agentic-review-action): Revisit whether checklist-only reviews should trigger downstream automation hooks.
export function applyPriceFallbackAfterReview(
  artikelNummer: string,
  ctx: {
    getItemReference: { get: (id: string) => ItemRef | undefined };
    persistItemReference?: (ref: ItemRef) => void;
  },
  logger: Pick<Console, 'debug' | 'error' | 'info' | 'warn'> = console
): void {
  const trimmedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  if (!trimmedArtikelNummer) {
    logger.warn?.('[agentic-review] Missing Artikelnummer for price fallback');
    return;
  }

  let reference: ItemRef | undefined;
  try {
    reference = ctx.getItemReference.get(trimmedArtikelNummer);
  } catch (error) {
    logger.error?.('[agentic-review] Failed to load reference for Artikelnummer price lookup', {
      artikelNummer: trimmedArtikelNummer,
      error
    });
    return;
  }

  if (!reference) {
    logger.warn?.('[agentic-review] Artikelnummer reference not found for price fallback', {
      artikelNummer: trimmedArtikelNummer
    });
    return;
  }

  if (typeof reference.Verkaufspreis === 'number' && Number.isFinite(reference.Verkaufspreis)) {
    logger.debug?.('[agentic-review] Skipping price fallback because Artikelnummer already has a price', {
      artikelNummer: reference.Artikel_Nummer ?? trimmedArtikelNummer,
      verkaufspreis: reference.Verkaufspreis
    });
    return;
  }

  const fallbackPrice = resolvePriceByCategoryAndType(
    {
      hauptkategorien: [reference.Hauptkategorien_A, reference.Hauptkategorien_B],
      unterkategorien: [reference.Unterkategorien_A, reference.Unterkategorien_B],
      artikeltyp: reference.Artikeltyp
    },
    logger
  );

  if (fallbackPrice === null) {
    logger.info?.('[agentic-review] No fallback price resolved during Artikelnummer review completion', {
      artikelNummer: reference.Artikel_Nummer ?? trimmedArtikelNummer,
      hauptkategorien: [reference.Hauptkategorien_A, reference.Hauptkategorien_B],
      unterkategorien: [reference.Unterkategorien_A, reference.Unterkategorien_B],
      artikeltyp: reference.Artikeltyp ?? null
    });
    return;
  }

  if (typeof ctx.persistItemReference !== 'function') {
    logger.error?.('[agentic-review] Persistence helper unavailable; cannot apply fallback price', {
      artikelNummer: reference.Artikel_Nummer ?? trimmedArtikelNummer
    });
    return;
  }

  try {
    const updatedReference: ItemRef = {
      ...reference,
      Verkaufspreis: fallbackPrice
    };
    ctx.persistItemReference(updatedReference);
    logger.info?.('[agentic-review] Applied fallback sale price after Artikelnummer review', {
      artikelNummer: reference.Artikel_Nummer ?? trimmedArtikelNummer,
      appliedPrice: fallbackPrice
    });
  } catch (error) {
    logger.error?.('[agentic-review] Failed to persist fallback sale price after review', {
      artikelNummer: reference.Artikel_Nummer ?? trimmedArtikelNummer,
      error
    });
  }
}



type NormalizedReviewMetadata = {
  information_present: boolean | null;
  missing_spec: string[];
  bad_format: boolean | null;
  wrong_information: boolean | null;
  wrong_physical_dimensions: boolean | null;
  notes: string | null;
  reviewedBy: string | null;
};

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (['true', '1', 'yes', 'y', 'ja'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'nein'].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeMissingSpec(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Map<string, string>();
  value.forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, trimmed);
    }
  });
  return Array.from(deduped.values()).slice(0, 10);
}

function normalizeReviewMetadataPayload(data: Record<string, unknown>): NormalizedReviewMetadata {
  const notesRaw = typeof data.notes === 'string' ? data.notes.trim() : '';
  const reviewedByRaw = typeof data.reviewedBy === 'string' ? data.reviewedBy.trim() : '';
  return {
    information_present: normalizeNullableBoolean(data.information_present),
    missing_spec: normalizeMissingSpec(data.missing_spec),
    bad_format: normalizeNullableBoolean(data.bad_format),
    wrong_information: normalizeNullableBoolean(data.wrong_information),
    wrong_physical_dimensions: normalizeNullableBoolean(data.wrong_physical_dimensions),
    notes: notesRaw || null,
    reviewedBy: reviewedByRaw || null
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// TODO(agentic-status-ref-id): Remove legacy /api/items route once all callers use Artikelnummer-specific paths.
function resolveArtikelNummerForAgentic(
  itemId: string,
  options: { logger?: Pick<Console, 'error' | 'warn'>; legacyRoute?: boolean } = {}
): string | null {
  const trimmed = typeof itemId === 'string' ? itemId.trim() : '';
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('I-')) {
    options.logger?.warn?.('[agentic-status] Rejecting ItemUUID for agentic route', {
      artikelNummer: trimmed,
      legacyRoute: Boolean(options.legacyRoute)
    });
    return null;
  }

  return trimmed;
}

function parseAgenticStatusRoute(path: string): { itemId: string; action: string | null; legacyRoute: boolean } | null {
  const legacyMatch = path.match(/^\/api\/items\/([^/]+)\/agentic(?:\/(review|close))?$/);
  if (legacyMatch) {
    return {
      itemId: decodeURIComponent(legacyMatch[1]),
      action: legacyMatch[2] ?? null,
      legacyRoute: true
    };
  }

  const refMatch = path.match(/^\/api\/item-refs\/([^/]+)\/agentic(?:\/(review|close))?$/);
  if (refMatch) {
    return {
      itemId: decodeURIComponent(refMatch[1]),
      action: refMatch[2] ?? null,
      legacyRoute: false
    };
  }

  return null;
}

const action = defineHttpAction({
  key: 'agentic-status',
  label: 'Agentic status',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => {
    if (method === 'GET') {
      return /^\/api\/items\/[^/]+\/agentic$/.test(path) || /^\/api\/item-refs\/[^/]+\/agentic$/.test(path);
    }
    if (method === 'POST') {
      return /^\/api\/items\/[^/]+\/agentic\/(review|close)$/.test(path)
        || /^\/api\/item-refs\/[^/]+\/agentic\/(review|close)$/.test(path);
    }
    return false;
  },
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const url = req.url || '';
    const route = parseAgenticStatusRoute(url);
    const itemId = route?.itemId ?? '';
    const action = route?.action ?? null;
    if (!itemId) {
      return sendJson(res, 400, { error: 'Invalid item id' });
    }
    if (route?.legacyRoute) {
      console.warn('[agentic-status] Legacy /api/items route used for agentic status', {
        itemId,
        path: url
      });
    }

    if (req.method === 'GET') {
      if (action) {
        return sendJson(res, 405, { error: 'Method not allowed' });
      }
      try {
        const artikelNummer = resolveArtikelNummerForAgentic(itemId, {
          logger: console,
          legacyRoute: route?.legacyRoute
        });
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
        console.error('Fetch agentic status failed for Artikelnummer', err);
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
        console.error('Failed to read agentic review request body for Artikelnummer', err);
        return sendJson(res, 400, { error: 'Invalid request body' });
      }

      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (err) {
        console.error('Failed to parse agentic review payload for Artikelnummer', err);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }

      const actor = typeof data.actor === 'string' ? data.actor.trim() : '';
      const reviewMetadata = normalizeReviewMetadataPayload(data);
      const notes = reviewMetadata.notes ?? '';
      const reviewedBy = reviewMetadata.reviewedBy ?? actor;
      const requestedAction = typeof data.action === 'string' ? data.action.trim().toLowerCase() : '';
      const decisionInput = typeof data.decision === 'string' ? data.decision.trim().toLowerCase() : '';
      const isChecklistReview = action === 'review' && requestedAction === 'review' && !decisionInput;
      const decision =
        action === 'close'
          ? 'approved'
          : decisionInput;

      if (!actor) {
        return sendJson(res, 400, { error: 'actor is required' });
      }
      if (!isChecklistReview && !['approved', 'rejected'].includes(decision)) {
        return sendJson(res, 400, { error: 'decision must be approved or rejected, or action must be review' });
      }

      const reviewedAt = new Date().toISOString();
      const status = isChecklistReview
        ? null
        : decision === 'approved'
          ? AGENTIC_RUN_STATUS_APPROVED
          : AGENTIC_RUN_STATUS_REJECTED;
      const reviewStateToPersist = isChecklistReview ? 'pending' : decision;
      const reviewDecisionToPersist = isChecklistReview ? null : decision;
      const artikelNummer = resolveArtikelNummerForAgentic(itemId, {
        logger: console,
        legacyRoute: route?.legacyRoute
      });
      if (!artikelNummer) {
        return sendJson(res, 400, { error: 'Missing Artikel_Nummer for agentic review' });
      }

      try {
        if (action === 'close') {
          let run: any;
          try {
            run = ctx.getAgenticRun.get(artikelNummer);
          } catch (err) {
            console.error('Failed to load agentic run for close request Artikelnummer', { artikelNummer, err });
            return sendJson(res, 500, { error: 'Failed to load agentic run' });
          }

          if (!run) {
            const upsertResult = ctx.upsertAgenticRun.run({
              Artikel_Nummer: artikelNummer,
              SearchQuery: null,
              Status: status,
              LastModified: reviewedAt,
              ReviewState: reviewStateToPersist,
              ReviewedBy: reviewedBy,
              LastReviewDecision: reviewDecisionToPersist,
              LastReviewNotes: notes || null
            });
            if (!upsertResult || upsertResult.changes === 0) {
              console.error('Agentic close upsert had no effect for Artikelnummer', artikelNummer);
              return sendJson(res, 500, { error: 'Failed to update review state' });
            }
          } else {
            const result = ctx.updateAgenticReview.run({
              Artikel_Nummer: artikelNummer,
              ReviewState: reviewStateToPersist,
              ReviewedBy: reviewedBy,
              LastModified: reviewedAt,
              Status: status,
              LastReviewDecision: reviewDecisionToPersist,
              LastReviewNotes: notes || null
            });
            if (!result || result.changes === 0) {
              console.error('Agentic review update had no effect for Artikelnummer', artikelNummer);
              return sendJson(res, 500, { error: 'Failed to update review state' });
            }
          }
        } else {
          let run: any;
          try {
            run = ctx.getAgenticRun.get(artikelNummer);
          } catch (err) {
            console.error('Failed to load agentic run for review request Artikelnummer', { artikelNummer, err });
            return sendJson(res, 500, { error: 'Failed to load agentic run' });
          }
          if (!run) {
            return sendJson(res, 404, { error: 'Agentic run not found' });
          }

          const result = ctx.updateAgenticReview.run({
            Artikel_Nummer: artikelNummer,
            ReviewState: reviewStateToPersist,
            ReviewedBy: reviewedBy,
            LastModified: reviewedAt,
            Status: status,
            LastReviewDecision: reviewDecisionToPersist,
            LastReviewNotes: notes || null
          });
          if (!result || result.changes === 0) {
            console.error('Agentic review update had no effect for Artikelnummer', artikelNummer);
            return sendJson(res, 500, { error: 'Failed to update review state' });
          }
        }

        if (!isChecklistReview && decision === 'rejected') {
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
            console.error('Failed to clear agentic run data after rejection for Artikelnummer', clearErr);
          }
        }
      } catch (err) {
        console.error('Failed to update agentic review for Artikelnummer', err);
        return sendJson(res, 500, { error: (err as Error).message });
      }

      // TODO(agentic-review-metrics): Keep review event metadata aligned with frontend contract changes.
      ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: artikelNummer,
        Event: isChecklistReview
          ? 'AgenticReviewSubmitted'
          : decision === 'approved'
            ? 'AgenticReviewApproved'
            : 'AgenticReviewRejected',
        Meta: JSON.stringify(
          action === 'close'
            ? { action: 'close', decision, reason: 'manual-close', ...reviewMetadata, reviewedBy }
            : isChecklistReview
              ? { action: 'review', ...reviewMetadata, reviewedBy }
              : { decision, ...reviewMetadata, reviewedBy }
        )
      });

      if (isChecklistReview) {
        console.info('[agentic-review] Checklist-only review stored', {
          artikelNummer,
          actor,
          reviewedBy,
          action: requestedAction || 'review'
        });
      }

      if (decision === 'approved') {
        try {
          applyPriceFallbackAfterReview(artikelNummer, ctx, console);
        } catch (err) {
          console.error('Failed to apply fallback sale price after review for Artikelnummer', err);
        }
      }

      try {
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
        return sendJson(res, 200, { agentic: result.agentic });
      } catch (err) {
        console.error('Failed to load updated agentic status for Artikelnummer', err);
        return sendJson(res, 500, { error: (err as Error).message });
      }
    } catch (err) {
      console.error('Agentic review handling failed for Artikelnummer', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic review API</p></div>'
});

export default action;
