// TODO(agent): Revisit locked field normalization after agent output editing stabilizes.
import { FlowError } from './errors';
import { throwIfCancelled } from './cancellation';
import { type AgenticTarget } from './item-flow-schemas';
import type { ItemFlowLogger, RunItemFlowInput } from './item-flow';

export interface PreparedItemContext {
  itemId: string;
  target: AgenticTarget;
  searchTerm: string;
  checkCancellation: () => void;
  cancellationSignal: AbortSignal | null;
}

// TODO(migration): remove legacy itemUUid inputs once all callers send Artikel_Nummer only.
function resolveItemId(
  target: unknown,
  providedId: string | undefined | null,
  logger?: ItemFlowLogger
): { itemId: string; targetId: string; legacyItemUUid: string } {
  const candidate = target && typeof target === 'object' ? (target as Record<string, unknown>) : null;
  const targetId =
    typeof candidate?.Artikel_Nummer === 'string'
      ? candidate.Artikel_Nummer.trim()
      : typeof candidate?.artikelNummer === 'string'
        ? candidate.artikelNummer.trim()
        : '';
  const legacyItemUUid = typeof candidate?.itemUUid === 'string' ? candidate.itemUUid.trim() : '';
  if (legacyItemUUid) {
    logger?.warn?.({ msg: 'legacy itemUUid supplied in target; prefer Artikel_Nummer', itemUUid: legacyItemUUid });
  }
  const itemId = typeof providedId === 'string' && providedId.trim().length ? providedId.trim() : targetId;
  return { itemId, targetId, legacyItemUUid };
}

// TODO(migration): remove itemUUid normalization once callers migrate to Artikel_Nummer.
function normalizeTarget(target: unknown, itemId: string): AgenticTarget {
  const candidate = (target && typeof target === 'object' ? target : {}) as Partial<AgenticTarget> &
    Record<string, unknown>;
  const artikelbeschreibung = typeof candidate.Artikelbeschreibung === 'string' ? candidate.Artikelbeschreibung.trim() : '';

  const sanitizedTarget: Record<string, unknown> = { ...candidate };
  const rawLocked = Array.isArray(candidate.__locked) ? candidate.__locked : null;

  if (typeof candidate.reviewNotes === 'string') {
    const trimmedNotes = candidate.reviewNotes.trim();
    if (trimmedNotes) {
      sanitizedTarget.reviewNotes = trimmedNotes;
    } else {
      delete sanitizedTarget.reviewNotes;
    }
  }

  if (rawLocked) {
    const filteredLocked = rawLocked
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value && value.toLowerCase() !== 'artikelbeschreibung');

    if (filteredLocked.length > 0) {
      sanitizedTarget.__locked = filteredLocked;
    } else {
      delete sanitizedTarget.__locked;
    }
  }

  delete sanitizedTarget.itemUUid;
  delete sanitizedTarget.artikelNummer;

  return {
    ...(sanitizedTarget as Partial<AgenticTarget>),
    Artikel_Nummer: itemId,
    Artikelbeschreibung: artikelbeschreibung
  } as AgenticTarget;
}

export function prepareItemContext(input: RunItemFlowInput, logger: ItemFlowLogger): PreparedItemContext {
  const { itemId, targetId } = resolveItemId(input.target, input.id, logger);

  if (!itemId) {
    const err = new FlowError('INVALID_TARGET', 'Target requires a non-empty "Artikel_Nummer"', 400);
    logger.error?.({ err, msg: 'target missing Artikel_Nummer' });
    throw err;
  }

  // TODO: streamline validation once broader target normalization is refactored.
  let normalizedTarget: AgenticTarget;
  try {
    normalizedTarget = normalizeTarget(input.target, itemId);
    const artikelbeschreibung = normalizedTarget.Artikelbeschreibung;
    if (typeof artikelbeschreibung !== 'string' || !artikelbeschreibung.trim().length) {
      const err = new FlowError('INVALID_TARGET', 'Target requires a non-empty "Artikelbeschreibung"', 400);
      logger.error?.({ err, msg: 'target missing Artikelbeschreibung', itemId });
      throw err;
    }
  } catch (err) {
    if (err instanceof FlowError) {
      throw err;
    }
    logger.error?.({ err, msg: 'target normalization failed', itemId, targetId, target: input.target });
    throw new FlowError('INVALID_TARGET', 'Failed to normalize target', 400, { cause: err });
  }

  const searchTerm =
    typeof input.search === 'string' && input.search.trim().length ? input.search.trim() : normalizedTarget.Artikelbeschreibung;

  const cancellationSignal = input.cancellationSignal ?? null;
  const checkCancellation = () => {
    try {
      throwIfCancelled(itemId, cancellationSignal);
    } catch (err) {
      logger.warn?.({ err, msg: 'run cancellation detected', itemId });
      throw err;
    }
  };

  if (cancellationSignal?.addEventListener) {
    try {
      cancellationSignal.addEventListener(
        'abort',
        (event) => {
          const reason = (event?.target as AbortSignal | undefined)?.reason;
          const reasonMessage =
            typeof (reason as { message?: string } | undefined)?.message === 'string' && reason?.message.trim().length
              ? reason.message.trim()
              : 'Run cancellation requested';
          logger.info?.({ msg: 'cancellation signal received', itemId, reason: reasonMessage });
        },
        { once: true }
      );
    } catch (err) {
      logger.error?.({ err, msg: 'failed to register cancellation listener', itemId });
    }
  }

  checkCancellation();

  return {
    itemId,
    target: normalizedTarget,
    searchTerm,
    checkCancellation,
    cancellationSignal
  };
}
