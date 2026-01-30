import { FlowError } from './errors';

interface RunMetadata {
  actor?: string | null;
}

interface RunState {
  itemId: string;
  controller: AbortController;
  status: 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
  metadata: RunMetadata;
  startedAt: number;
  cancelRequestedBy: string | null;
  cancelRequestedAt: number | null;
  cancelReason: string | null;
  finalized?: boolean;
}

interface RunOutcome {
  outcome: 'completed' | 'failed' | 'cancelled';
  details: Record<string, unknown>;
  finishedAt: number;
  actor: string | null;
  startedAt: number | null;
  cancelRequestedAt: number | null;
}

interface CancellationResult {
  ok: boolean;
  status:
    | 'INVALID_ID'
    | 'NOT_FOUND'
    | 'ALREADY_CANCELLED'
    | 'ALREADY_FINISHED'
    | 'ALREADY_ABORTED'
    | 'ABORT_FAILED'
    | 'CANCELLATION_REQUESTED';
  message: string;
  outcome: RunOutcome | null;
  requestedBy?: string | null;
}

const inflightRuns = new Map<string, RunState>();
const runOutcomes = new Map<string, RunOutcome>();

function finalizeRunState(state: RunState | undefined, outcome: RunOutcome['outcome'], details: Record<string, unknown> = {}): void {
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
      actor: state.metadata?.actor ?? null,
      startedAt: state.startedAt ?? null,
      cancelRequestedAt: state.cancelRequestedAt ?? null
    });
  } catch (err) {
    console.error('[agentic-cancellation] failed to record run outcome', { itemId, error: err });
  }
}

export function beginRun(itemId: string, metadata: RunMetadata = {}): {
  signal: AbortSignal;
  state: RunState;
  cancel: (details?: Record<string, unknown>) => void;
  complete: (details?: Record<string, unknown>) => void;
  fail: (details?: Record<string, unknown>) => void;
} {
  const normalizedId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedId) {
    throw new Error('beginRun requires a non-empty itemId');
  }

  const controller = new AbortController();
  const state: RunState = {
    itemId: normalizedId,
    controller,
    status: 'running',
    metadata: { ...metadata },
    startedAt: Date.now(),
    cancelRequestedBy: null,
    cancelRequestedAt: null,
    cancelReason: null
  };

  inflightRuns.set(normalizedId, state);

  const finalize = (outcome: RunOutcome['outcome'], details: Record<string, unknown> = {}): void => {
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
    fail: (details = {}) => finalize('failed', details)
  };
}

export function getRunState(itemId: string): RunState | null {
  const normalizedId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedId) {
    return null;
  }
  return inflightRuns.get(normalizedId) ?? null;
}

export function getRunOutcome(itemId: string): RunOutcome | null {
  const normalizedId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedId) {
    return null;
  }
  return runOutcomes.get(normalizedId) ?? null;
}

export function requestCancellation(
  itemId: string,
  options: { actor?: string | null; reason?: string | null } = {}
): CancellationResult {
  const normalizedId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedId) {
    return {
      ok: false,
      status: 'INVALID_ID',
      message: 'Cancellation requires a valid Artikel_Nummer',
      outcome: null
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
        outcome: lastOutcome
      };
    }

    if (lastOutcome?.outcome) {
      return {
        ok: false,
        status: 'ALREADY_FINISHED',
        message: 'The run has already finished and cannot be cancelled.',
        outcome: lastOutcome
      };
    }

    return {
      ok: false,
      status: 'NOT_FOUND',
      message: 'No in-flight run exists for the provided Artikel_Nummer.',
      outcome: null
    };
  }

  if (state.controller.signal.aborted) {
    return {
      ok: false,
      status: 'ALREADY_ABORTED',
      message: 'Cancellation has already been signaled for this run.',
      outcome: lastOutcome
    };
  }

  const cancellationReason =
    typeof options.reason === 'string' && options.reason.trim().length
      ? options.reason.trim()
      : 'Cancellation requested via API.';

  state.status = 'cancelling';
  state.cancelRequestedAt = Date.now();
  state.cancelRequestedBy = typeof options.actor === 'string' && options.actor.trim().length ? options.actor.trim() : null;
  state.cancelReason = cancellationReason;

  const cancellationError = new FlowError('RUN_CANCELLED', cancellationReason, 409);
  try {
    state.controller.abort(cancellationError);
  } catch (err) {
    console.error('[agentic-cancellation] failed to abort run controller', { itemId: normalizedId, error: err });
    return {
      ok: false,
      status: 'ABORT_FAILED',
      message: 'Failed to propagate cancellation to the running flow.',
      outcome: lastOutcome
    };
  }

  return {
    ok: true,
    status: 'CANCELLATION_REQUESTED',
    message: cancellationReason,
    outcome: lastOutcome,
    requestedBy: state.cancelRequestedBy
  };
}

export function throwIfCancelled(itemId: string, signal?: AbortSignal | null): void {
  const normalizedId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedId) {
    return;
  }

  const resolvedSignal = signal ?? inflightRuns.get(normalizedId)?.controller.signal;
  if (!resolvedSignal) {
    return;
  }

  if (!resolvedSignal.aborted) {
    return;
  }

  const reason = (resolvedSignal as AbortSignal & { reason?: unknown }).reason;
  if (reason instanceof FlowError) {
    throw reason;
  }

  const message =
    typeof (reason as { message?: string } | undefined)?.message === 'string' && reason?.message.trim().length
      ? reason.message
      : 'Run cancelled';
  throw new FlowError('RUN_CANCELLED', message, 409, { cause: reason });
}
