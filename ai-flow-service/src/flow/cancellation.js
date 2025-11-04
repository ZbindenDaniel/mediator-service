import { logger } from '../utils/logger.js';
import { FlowError } from './errors.js';

const inflightRuns = new Map();
const runOutcomes = new Map();

function finalizeRunState(state, outcome, details = {}) {
  if (!state || !state.itemId) {
    return;
  }

  const { itemId } = state;
  const current = inflightRuns.get(itemId);
  if (current === state) {
    inflightRuns.delete(itemId);
  }

  try {
    runOutcomes.set(itemId, {
      outcome,
      details,
      finishedAt: Date.now(),
      actor: state?.metadata?.actor ?? null,
      startedAt: state?.startedAt ?? null,
      cancelRequestedAt: state?.cancelRequestedAt ?? null,
    });
  } catch (err) {
    logger.error({ err, itemId, msg: 'failed to record cancellation outcome' });
  }
}

export function beginRun(itemId, metadata = {}) {
  const normalizedId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedId) {
    throw new Error('beginRun requires a non-empty itemId');
  }

  const controller = new AbortController();
  const state = {
    itemId: normalizedId,
    controller,
    status: 'running',
    metadata: { ...metadata },
    startedAt: Date.now(),
    cancelRequestedBy: null,
    cancelRequestedAt: null,
    cancelReason: null,
  };

  inflightRuns.set(normalizedId, state);

  const finalize = (outcome, details) => {
    if (state.finalized) {
      return;
    }
    state.finalized = true;
    state.status = outcome;
    finalizeRunState(state, outcome, details);
  };

  return {
    signal: controller.signal,
    state,
    cancel: (details = {}) => finalize('cancelled', details),
    complete: (details = {}) => finalize('completed', details),
    fail: (details = {}) => finalize('failed', details),
  };
}

export function getRunState(itemId) {
  const normalizedId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedId) {
    return null;
  }
  return inflightRuns.get(normalizedId) ?? null;
}

export function getRunOutcome(itemId) {
  const normalizedId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedId) {
    return null;
  }
  return runOutcomes.get(normalizedId) ?? null;
}

export function requestCancellation(itemId, { actor, reason } = {}) {
  const normalizedId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedId) {
    return {
      ok: false,
      status: 'INVALID_ID',
      message: 'Cancellation requires a valid itemUUid',
      outcome: null,
    };
  }

  const state = inflightRuns.get(normalizedId);
  const lastOutcome = runOutcomes.get(normalizedId) ?? null;

  if (!state) {
    if (lastOutcome?.outcome === 'cancelled') {
      return {
        ok: false,
        status: 'ALREADY_CANCELLED',
        message: 'The run has already been cancelled.',
        outcome: lastOutcome,
      };
    }

    if (lastOutcome?.outcome) {
      return {
        ok: false,
        status: 'ALREADY_FINISHED',
        message: 'The run has already finished and cannot be cancelled.',
        outcome: lastOutcome,
      };
    }

    return {
      ok: false,
      status: 'NOT_FOUND',
      message: 'No in-flight run exists for the provided itemUUid.',
      outcome: null,
    };
  }

  if (state.controller.signal.aborted) {
    return {
      ok: false,
      status: 'ALREADY_ABORTED',
      message: 'Cancellation has already been signaled for this run.',
      outcome: lastOutcome,
    };
  }

  const cancellationReason =
    typeof reason === 'string' && reason.trim().length
      ? reason.trim()
      : 'Cancellation requested via API.';

  state.status = 'cancelling';
  state.cancelRequestedAt = Date.now();
  state.cancelRequestedBy = typeof actor === 'string' && actor.trim().length ? actor.trim() : null;
  state.cancelReason = cancellationReason;

  const cancellationError = new FlowError('RUN_CANCELLED', cancellationReason, 409);
  try {
    state.controller.abort(cancellationError);
  } catch (err) {
    logger.error({ err, itemId: normalizedId, msg: 'failed to abort run controller' });
    return {
      ok: false,
      status: 'ABORT_FAILED',
      message: 'Failed to propagate cancellation to the running flow.',
      outcome: lastOutcome,
    };
  }

  return {
    ok: true,
    status: 'CANCELLATION_REQUESTED',
    message: cancellationReason,
    outcome: lastOutcome,
    requestedBy: state.cancelRequestedBy,
  };
}

export function throwIfCancelled(itemId, signal) {
  const normalizedId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedId) {
    return;
  }

  const resolvedSignal = signal ?? inflightRuns.get(normalizedId)?.controller?.signal;
  if (!resolvedSignal) {
    return;
  }

  if (!resolvedSignal.aborted) {
    return;
  }

  const reason = resolvedSignal.reason;
  if (reason instanceof FlowError) {
    throw reason;
  }

  const message =
    typeof reason?.message === 'string' && reason.message.trim().length
      ? reason.message
      : 'Run cancelled';
  throw new FlowError('RUN_CANCELLED', message, 409, { cause: reason });
}
