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
// TODO(agentic-review-transitions): Keep close/final-decision transition logging aligned with review lifecycle metrics.
// TODO(agentic-review-history-source): Add explicit source column if review history needs first-class path attribution.
// TODO(agentic-review-noop): Consider storing an explicit review-update reason when state remains unchanged.
// TODO(agentic-review-decision-threshold): Revisit implicit reject/approve checklist thresholding if operators request weighted scoring.
// TODO(agentic-review-manual-updates): Revisit whether manual review should persist shop/price updates when decision is rejected.
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

// TODO(agentic-review-prune): Extend spec pruning beyond Langtext once additional structured specification fields are introduced.
export function pruneUnneededSpecsAfterReview(
  artikelNummer: string,
  unneededSpec: string[],
  ctx: {
    getItemReference: { get: (id: string) => ItemRef | undefined };
    persistItemReference?: (ref: ItemRef) => void;
  },
  logger: Pick<Console, 'debug' | 'error' | 'info' | 'warn'> = console
): void {
  const trimmedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  if (!trimmedArtikelNummer || !Array.isArray(unneededSpec) || unneededSpec.length === 0) {
    return;
  }

  let reference: ItemRef | undefined;
  try {
    reference = ctx.getItemReference.get(trimmedArtikelNummer);
  } catch (error) {
    logger.error?.('[agentic-review] Failed to load reference for unneeded spec pruning', {
      artikelNummer: trimmedArtikelNummer,
      error
    });
    return;
  }

  if (!reference) {
    logger.warn?.('[agentic-review] Artikelnummer reference not found for unneeded spec pruning', {
      artikelNummer: trimmedArtikelNummer
    });
    return;
  }

  if (!ctx.persistItemReference) {
    logger.error?.('[agentic-review] Persistence helper unavailable; cannot prune unneeded spec fields', {
      artikelNummer: trimmedArtikelNummer
    });
    return;
  }

  const langtext = reference.Langtext;
  if (!langtext || typeof langtext !== 'object' || Array.isArray(langtext)) {
    logger.debug?.('[agentic-review] Skipping unneeded spec pruning because Langtext is not an object', {
      artikelNummer: trimmedArtikelNummer,
      langtextType: typeof langtext
    });
    return;
  }

  try {
    const removalLookup = new Set(unneededSpec.map((entry) => entry.trim().toLowerCase()).filter(Boolean));
    const nextLangtext: Record<string, unknown> = { ...(langtext as Record<string, unknown>) };
    const removed: string[] = [];

    for (const key of Object.keys(nextLangtext)) {
      if (!removalLookup.has(key.trim().toLowerCase())) {
        continue;
      }
      removed.push(key);
      delete nextLangtext[key];
    }

    if (!removed.length) {
      logger.info?.('[agentic-review] No matching Langtext keys found for unneeded spec pruning', {
        artikelNummer: trimmedArtikelNummer,
        unneededSpecCount: unneededSpec.length
      });
      return;
    }

    ctx.persistItemReference({
      ...reference,
      Langtext: nextLangtext as typeof reference.Langtext
    });

    logger.info?.('[agentic-review] Pruned reviewer-marked unneeded Langtext specs', {
      artikelNummer: trimmedArtikelNummer,
      removedCount: removed.length,
      removedSample: removed.slice(0, 5)
    });
  } catch (error) {
    logger.error?.('[agentic-review] Failed to persist unneeded spec pruning update', {
      artikelNummer: trimmedArtikelNummer,
      error
    });
  }
}


export function applyManualReviewReferenceUpdates(
  artikelNummer: string,
  reviewMetadata: { review_price: number | null; shop_article: boolean | null },
  ctx: {
    getItemReference: { get: (id: string) => ItemRef | undefined };
    persistItemReference?: (ref: ItemRef) => void;
  },
  logger: Pick<Console, 'debug' | 'error' | 'info' | 'warn'> = console
): void {
  const trimmedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  const shouldSetPrice = typeof reviewMetadata.review_price === 'number' && Number.isFinite(reviewMetadata.review_price);
  const shouldSetShop = typeof reviewMetadata.shop_article === 'boolean';

  if (!trimmedArtikelNummer || (!shouldSetPrice && !shouldSetShop)) {
    return;
  }

  let reference: ItemRef | undefined;
  try {
    reference = ctx.getItemReference.get(trimmedArtikelNummer);
  } catch (error) {
    logger.error?.('[agentic-review] Failed to load reference for manual review updates', {
      artikelNummer: trimmedArtikelNummer,
      error
    });
    return;
  }

  if (!reference) {
    logger.warn?.('[agentic-review] Artikelnummer reference not found for manual review updates', {
      artikelNummer: trimmedArtikelNummer
    });
    return;
  }

  if (typeof ctx.persistItemReference !== 'function') {
    logger.error?.('[agentic-review] Persistence helper unavailable; cannot apply manual review updates', {
      artikelNummer: trimmedArtikelNummer
    });
    return;
  }

  try {
    const nextReference: ItemRef = {
      ...reference,
      ...(shouldSetPrice ? { Verkaufspreis: reviewMetadata.review_price } : {}),
      ...(shouldSetShop ? { Shopartikel: reviewMetadata.shop_article ? 1 : 0 } : {})
    };
    ctx.persistItemReference(nextReference);
    logger.info?.('[agentic-review] Applied manual review reference updates', {
      artikelNummer: trimmedArtikelNummer,
      priceUpdated: shouldSetPrice,
      shopUpdated: shouldSetShop
    });
  } catch (error) {
    logger.error?.('[agentic-review] Failed to persist manual review reference updates', {
      artikelNummer: trimmedArtikelNummer,
      error
    });
  }
}



type NormalizedReviewMetadata = {
  information_present: boolean | null;
  missing_spec: string[];
  unneeded_spec: string[];
  bad_format: boolean | null;
  wrong_information: boolean | null;
  wrong_physical_dimensions: boolean | null;
  notes: string | null;
  review_price: number | null;
  shop_article: boolean | null;
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

function normalizeSpecList(value: unknown): string[] {
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
  const reviewPrice = typeof data.review_price === 'number' && Number.isFinite(data.review_price)
    ? data.review_price
    : null;
  return {
    information_present: normalizeNullableBoolean(data.information_present),
    missing_spec: normalizeSpecList(data.missing_spec),
    unneeded_spec: normalizeSpecList(data.unneeded_spec),
    bad_format: normalizeNullableBoolean(data.bad_format),
    wrong_information: normalizeNullableBoolean(data.wrong_information),
    wrong_physical_dimensions: normalizeNullableBoolean(data.wrong_physical_dimensions),
    notes: notesRaw || null,
    review_price: reviewPrice,
    shop_article: normalizeNullableBoolean(data.shop_article),
    reviewedBy: reviewedByRaw || null
  };
}

function persistManualReviewHistoryEntry(
  ctx: { insertAgenticRunReviewHistoryEntry?: { run: (entry: Record<string, unknown>) => { changes?: number } } },
  payload: {
    artikelNummer: string;
    status: string;
    reviewState: string;
    reviewDecision: string | null;
    notes: string | null;
    reviewedBy: string | null;
    reviewMetadata: NormalizedReviewMetadata;
    recordedAt: string;
    action: string;
    actor: string;
  }
): void {
  if (!ctx.insertAgenticRunReviewHistoryEntry?.run) {
    console.warn('[agentic-review] Review history insert dependency missing; skipping manual history persistence', {
      artikelNummer: payload.artikelNummer,
      action: payload.action
    });
    return;
  }

  try {
    const insertResult = ctx.insertAgenticRunReviewHistoryEntry.run({
      Artikel_Nummer: payload.artikelNummer,
      Status: payload.status,
      ReviewState: payload.reviewState,
      ReviewDecision: payload.reviewDecision,
      ReviewNotes: payload.notes,
      ReviewMetadata: JSON.stringify({
        ...payload.reviewMetadata,
        action: payload.action,
        source: 'manual-review'
      }),
      ReviewedBy: payload.reviewedBy,
      RecordedAt: payload.recordedAt
    });

    console.info('[agentic-review] Persisted manual review history entry', {
      artikelNummer: payload.artikelNummer,
      action: payload.action,
      actor: payload.actor,
      reviewState: payload.reviewState,
      reviewDecisionPresent: Boolean(payload.reviewDecision),
      metadataSignalCount: [
        payload.reviewMetadata.information_present,
        payload.reviewMetadata.bad_format,
        payload.reviewMetadata.wrong_information,
        payload.reviewMetadata.wrong_physical_dimensions
      ].filter((value) => value !== null).length,
      missingSpecCount: payload.reviewMetadata.missing_spec.length,
      unneededSpecCount: payload.reviewMetadata.unneeded_spec.length,
      inserted: Boolean(insertResult && (insertResult.changes ?? 1) > 0)
    });
  } catch (error) {
    console.warn('[agentic-review] Failed to persist manual review history entry', {
      artikelNummer: payload.artikelNummer,
      action: payload.action,
      reviewState: payload.reviewState,
      error: toErrorMessage(error)
    });
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
      const hasExplicitFinalDecision = decisionInput === 'approved' || decisionInput === 'rejected';
      // TODO(agentic-review-decision): Keep checklist-derived decision inputs aligned with reviewer guidance for negative signals.
      const hasNegativeChecklistSignal =
        reviewMetadata.information_present === false ||
        reviewMetadata.bad_format === true ||
        reviewMetadata.wrong_information === true ||
        reviewMetadata.wrong_physical_dimensions === true ||
        reviewMetadata.missing_spec.length > 0;
      const hasUnneededSpecFeedback = reviewMetadata.unneeded_spec.length > 0;
      const hasManualPriceFeedback = typeof reviewMetadata.review_price === 'number' && Number.isFinite(reviewMetadata.review_price);
      const derivedChecklistDecision = isChecklistReview
        ? (hasNegativeChecklistSignal ? 'rejected' : 'approved')
        : null;
      const decision = action === 'close'
        ? (hasExplicitFinalDecision ? decisionInput : 'approved')
        : hasExplicitFinalDecision
          ? decisionInput
          : derivedChecklistDecision;
      const isFinalizeTransition = action === 'close' || Boolean(decision);

      if (!actor) {
        return sendJson(res, 400, { error: 'actor is required' });
      }
      if (!isFinalizeTransition || !decision) {
        return sendJson(res, 400, { error: 'decision could not be resolved from review payload' });
      }

      if (isChecklistReview && (hasUnneededSpecFeedback || hasManualPriceFeedback)) {
        console.info('[agentic-review] Ignoring non-blocking review metadata for checklist decision derivation', {
          artikelNummer: itemId,
          unneededSpecCount: reviewMetadata.unneeded_spec.length,
          hasManualPriceFeedback,
          derivedChecklistDecision,
          hasNegativeChecklistSignal
        });
      }

      const reviewedAt = new Date().toISOString();
      const status = decision === 'approved' ? AGENTIC_RUN_STATUS_APPROVED : AGENTIC_RUN_STATUS_REJECTED;
      const reviewStateToPersist = decision;
      const reviewDecisionToPersist = decision;
      const artikelNummer = resolveArtikelNummerForAgentic(itemId, {
        logger: console,
        legacyRoute: route?.legacyRoute
      });
      if (!artikelNummer) {
        return sendJson(res, 400, { error: 'Missing Artikel_Nummer for agentic review' });
      }

      let resolvedRunStatusForHistory: string = 'review';

      try {
        const transitionPayload = {
          Artikel_Nummer: artikelNummer,
          ReviewState: reviewStateToPersist,
          ReviewedBy: reviewedBy,
          LastModified: reviewedAt,
          Status: status,
          LastReviewDecision: reviewDecisionToPersist,
          LastReviewNotes: notes || null
        };

        if (action === 'close') {
          let run: any;
          try {
            run = ctx.getAgenticRun.get(artikelNummer);
          } catch (err) {
            console.error('Failed to load agentic run for close request Artikelnummer', { artikelNummer, err });
            return sendJson(res, 500, { error: 'Failed to load agentic run' });
          }

          const fromState = typeof run?.ReviewState === 'string' ? run.ReviewState : null;
          if (typeof run?.Status === 'string' && run.Status.trim()) {
            resolvedRunStatusForHistory = run.Status.trim();
          } else if (!isChecklistReview && status) {
            resolvedRunStatusForHistory = status;
          }
          console.info('[agentic-review] Attempting review transition', {
            artikelNummer,
            actor,
            action: 'close',
            fromState,
            toState: reviewStateToPersist,
            stateChanged: fromState !== reviewStateToPersist
          });

          try {
            if (!run) {
              const upsertResult = ctx.upsertAgenticRun.run({
                Artikel_Nummer: artikelNummer,
                SearchQuery: null,
                Status: status,
                LastModified: reviewedAt,
                ReviewState: reviewStateToPersist,
                ReviewedBy: reviewedBy,
                LastReviewDecision: reviewDecisionToPersist,
                LastReviewNotes: notes || null,
                LastSearchLinksJson: run?.LastSearchLinksJson ?? null
              });
              if (!upsertResult || upsertResult.changes === 0) {
                throw new Error('Agentic close upsert had no effect');
              }
            } else {
              const result = ctx.updateAgenticReview.run(transitionPayload);
              if (!result || result.changes === 0) {
                throw new Error('Agentic review update had no effect');
              }
            }
          } catch (dbErr) {
            console.error('Agentic close transition failed for Artikelnummer', {
              artikelNummer,
              actor,
              fromState,
              toState: reviewStateToPersist,
              error: toErrorMessage(dbErr)
            });
            return sendJson(res, 500, {
              error: 'Failed to persist review transition',
              details: {
                action: 'close',
                fromState,
                toState: reviewStateToPersist,
                artikelNummer
              }
            });
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

          const fromState = typeof run.ReviewState === 'string' ? run.ReviewState : null;
          if (typeof run?.Status === 'string' && run.Status.trim()) {
            resolvedRunStatusForHistory = run.Status.trim();
          } else if (!isChecklistReview && status) {
            resolvedRunStatusForHistory = status;
          }
          console.info('[agentic-review] Attempting review transition', {
            artikelNummer,
            actor,
            action: requestedAction || action || 'review',
            fromState,
            toState: reviewStateToPersist,
            stateChanged: fromState !== reviewStateToPersist
          });

          try {
            const result = ctx.updateAgenticReview.run(transitionPayload);
            if (!result || result.changes === 0) {
              throw new Error('Agentic review update had no effect');
            }
          } catch (dbErr) {
            console.error('Agentic review transition failed for Artikelnummer', {
              artikelNummer,
              actor,
              fromState,
              toState: reviewStateToPersist,
              error: toErrorMessage(dbErr)
            });
            return sendJson(res, 500, {
              error: 'Failed to persist review transition',
              details: {
                action: requestedAction || action || 'review',
                fromState,
                toState: reviewStateToPersist,
                artikelNummer
              }
            });
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
            console.error('Failed to clear agentic run data after rejection for Artikelnummer', clearErr);
          }
        }
      } catch (err) {
        console.error('Failed to update agentic review for Artikelnummer', err);
        return sendJson(res, 500, { error: (err as Error).message });
      }

      persistManualReviewHistoryEntry(ctx, {
        artikelNummer,
        status: status ?? resolvedRunStatusForHistory,
        reviewState: reviewStateToPersist,
        reviewDecision: reviewDecisionToPersist,
        notes: notes || null,
        reviewedBy,
        reviewMetadata,
        recordedAt: reviewedAt,
        action: action === 'close' ? 'close' : requestedAction || action || 'review',
        actor
      });

      // TODO(agentic-review-metrics): Keep review event metadata aligned with frontend contract changes.
      ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: artikelNummer,
        Event: decision === 'approved' ? 'AgenticReviewApproved' : 'AgenticReviewRejected',
        Meta: JSON.stringify(
          action === 'close'
            ? { action: 'close', decision, reason: 'manual-close', ...reviewMetadata, reviewedBy }
            : { action: requestedAction || action || 'review', decision, ...reviewMetadata, reviewedBy }
        )
      });

      if (isChecklistReview) {
        console.info('[agentic-review] Checklist review finalized with derived decision', {
          artikelNummer,
          actor,
          reviewedBy,
          decision,
          negativeSignalDetected: hasNegativeChecklistSignal
        });
      }

      try {
        applyManualReviewReferenceUpdates(artikelNummer, reviewMetadata, ctx, console);
      } catch (err) {
        console.error('Failed to apply manual review reference updates for Artikelnummer', err);
      }

      if (decision === 'approved') {
        try {
          applyPriceFallbackAfterReview(artikelNummer, ctx, console);
        } catch (err) {
          console.error('Failed to apply fallback sale price after review for Artikelnummer', err);
        }
      }

      try {
        pruneUnneededSpecsAfterReview(artikelNummer, reviewMetadata.unneeded_spec, ctx, console);
      } catch (err) {
        console.error('Failed to prune unneeded spec fields after review for Artikelnummer', err);
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
