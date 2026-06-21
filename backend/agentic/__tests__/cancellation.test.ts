import { beginRun, getRunState, getRunOutcome, requestCancellation, throwIfCancelled } from '../flow/cancellation';
import { FlowError } from '../flow/errors';

// Each test uses a unique itemId so module-level state maps don't leak across tests.
let seq = 0;
const nextId = () => `CANCEL-TEST-${++seq}`;

describe('beginRun', () => {
  it('registers a running state and returns an AbortSignal', () => {
    const id = nextId();
    const { signal, state } = beginRun(id);

    expect(state.status).toBe('running');
    expect(state.itemId).toBe(id);
    expect(signal.aborted).toBe(false);
    expect(getRunState(id)).toBe(state);

    state.finalized = true; // prevent leak — not calling complete() here
  });

  it('transitions to completed on complete()', () => {
    const id = nextId();
    const { complete } = beginRun(id);

    complete({ reason: 'done' });

    expect(getRunState(id)).toBeNull();
    expect(getRunOutcome(id)?.outcome).toBe('completed');
    expect(getRunOutcome(id)?.details).toEqual({ reason: 'done' });
  });

  it('transitions to failed on fail()', () => {
    const id = nextId();
    const { fail } = beginRun(id);

    fail({ error: 'boom' });

    expect(getRunState(id)).toBeNull();
    expect(getRunOutcome(id)?.outcome).toBe('failed');
  });

  it('transitions to cancelled on cancel()', () => {
    const id = nextId();
    const { cancel } = beginRun(id);

    cancel();

    expect(getRunState(id)).toBeNull();
    expect(getRunOutcome(id)?.outcome).toBe('cancelled');
  });

  it('ignores subsequent finalize calls after the first', () => {
    const id = nextId();
    const { complete, fail } = beginRun(id);

    complete({ first: true });
    fail({ second: true }); // should be a no-op

    expect(getRunOutcome(id)?.outcome).toBe('completed');
    expect(getRunOutcome(id)?.details).toEqual({ first: true });
  });

  it('throws when called with an empty itemId', () => {
    expect(() => beginRun('')).toThrow('beginRun requires a non-empty itemId');
    expect(() => beginRun('   ')).toThrow('beginRun requires a non-empty itemId');
  });

  it('trims whitespace from itemId', () => {
    const id = nextId();
    const { complete } = beginRun(`  ${id}  `);
    expect(getRunState(id)).not.toBeNull();
    complete();
  });
});

describe('getRunState / getRunOutcome', () => {
  it('returns null for an unknown itemId', () => {
    expect(getRunState('does-not-exist-xyz')).toBeNull();
    expect(getRunOutcome('does-not-exist-xyz')).toBeNull();
  });

  it('returns null for empty or whitespace-only itemId', () => {
    expect(getRunState('')).toBeNull();
    expect(getRunOutcome('')).toBeNull();
    expect(getRunState('   ')).toBeNull();
  });
});

describe('requestCancellation', () => {
  it('returns INVALID_ID for empty string', () => {
    const result = requestCancellation('');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('INVALID_ID');
  });

  it('returns NOT_FOUND when no run exists and no prior outcome', () => {
    const result = requestCancellation('ghost-item-xyz');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('NOT_FOUND');
  });

  it('returns ALREADY_CANCELLED when last outcome was cancelled', () => {
    const id = nextId();
    const { cancel } = beginRun(id);
    cancel();

    const result = requestCancellation(id);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('ALREADY_CANCELLED');
    expect(result.outcome?.outcome).toBe('cancelled');
  });

  it('returns ALREADY_FINISHED when last outcome was completed', () => {
    const id = nextId();
    const { complete } = beginRun(id);
    complete();

    const result = requestCancellation(id);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('ALREADY_FINISHED');
  });

  it('returns CANCELLATION_REQUESTED and aborts the signal for a running run', () => {
    const id = nextId();
    const { signal, state } = beginRun(id);

    const result = requestCancellation(id, { actor: 'test-user', reason: 'stopped by test' });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('CANCELLATION_REQUESTED');
    expect(result.requestedBy).toBe('test-user');
    expect(signal.aborted).toBe(true);
    expect(state.status).toBe('cancelling');
    expect(state.cancelReason).toBe('stopped by test');
  });

  it('uses default reason when none is provided', () => {
    const id = nextId();
    beginRun(id);

    const result = requestCancellation(id);
    expect(result.ok).toBe(true);
    expect(result.message).toBe('Cancellation requested via API.');
  });

  it('returns ALREADY_ABORTED if the signal is already aborted', () => {
    const id = nextId();
    beginRun(id);

    requestCancellation(id); // first cancellation
    const second = requestCancellation(id);
    expect(second.ok).toBe(false);
    expect(second.status).toBe('ALREADY_ABORTED');
  });
});

describe('throwIfCancelled', () => {
  it('is a no-op for an unknown itemId', () => {
    expect(() => throwIfCancelled('not-in-flight-xyz')).not.toThrow();
  });

  it('is a no-op for an empty itemId', () => {
    expect(() => throwIfCancelled('')).not.toThrow();
  });

  it('is a no-op while the run is still active', () => {
    const id = nextId();
    const { complete } = beginRun(id);
    expect(() => throwIfCancelled(id)).not.toThrow();
    complete();
  });

  it('throws FlowError after cancellation is requested', () => {
    const id = nextId();
    beginRun(id);
    requestCancellation(id, { reason: 'Test abort' });

    expect(() => throwIfCancelled(id)).toThrow(FlowError);
    let caught: FlowError | undefined;
    try {
      throwIfCancelled(id);
    } catch (err) {
      caught = err as FlowError;
    }
    expect(caught?.code).toBe('RUN_CANCELLED');
    expect(caught?.message).toBe('Test abort');
  });

  it('accepts an explicit AbortSignal instead of looking up by itemId', () => {
    const controller = new AbortController();
    const flowErr = new FlowError('RUN_CANCELLED', 'Explicit abort', 409);
    controller.abort(flowErr);

    expect(() => throwIfCancelled('any-id', controller.signal)).toThrow(FlowError);
  });
});
