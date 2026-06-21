import { dispatchAgenticResult } from '../flow/result-dispatch';
import type { AgenticResultPayload } from '../result-handler';

function buildPayload(overrides: Partial<AgenticResultPayload> = {}): AgenticResultPayload {
  return {
    artikelNummer: 'item-123',
    Artikel_Nummer: 'item-123',
    status: 'completed',
    error: null,
    needsReview: false,
    summary: 'ok',
    reviewDecision: null,
    reviewNotes: null,
    reviewedBy: null,
    actor: 'agent',
    item: { Artikel_Nummer: 'item-123' },
    ...overrides
  };
}

describe('dispatchAgenticResult', () => {
  test('calls applyAgenticResult with the payload and marks notification success', async () => {
    const applyAgenticResult = jest.fn(async () => undefined);
    const saveRequestPayload = jest.fn(async () => undefined);
    const markNotificationSuccess = jest.fn(async () => undefined);
    const markNotificationFailure = jest.fn(async () => undefined);
    const payload = buildPayload();

    await dispatchAgenticResult({
      artikelNummer: 'item-123',
      payload,
      saveRequestPayload,
      applyAgenticResult,
      markNotificationSuccess,
      markNotificationFailure
    });

    expect(saveRequestPayload).toHaveBeenCalledWith('item-123', payload);
    expect(applyAgenticResult).toHaveBeenCalledWith(payload);
    expect(markNotificationSuccess).toHaveBeenCalledWith('item-123');
    expect(markNotificationFailure).not.toHaveBeenCalled();
  });

  test('throws RESULT_HANDLER_MISSING when applyAgenticResult is not provided', async () => {
    const saveRequestPayload = jest.fn(async () => undefined);
    const markNotificationSuccess = jest.fn(async () => undefined);
    const markNotificationFailure = jest.fn(async () => undefined);

    await expect(
      dispatchAgenticResult({
        artikelNummer: 'item-missing-handler',
        payload: buildPayload({ artikelNummer: 'item-missing-handler' }),
        saveRequestPayload,
        markNotificationSuccess,
        markNotificationFailure
      })
    ).rejects.toThrow('Agentic result handler unavailable');

    expect(markNotificationFailure).toHaveBeenCalledWith('item-missing-handler', 'Agentic result handler unavailable');
  });

  test('calls markNotificationFailure and re-throws when applyAgenticResult throws', async () => {
    const error = new Error('upstream error');
    const applyAgenticResult = jest.fn(async () => { throw error; });
    const saveRequestPayload = jest.fn(async () => undefined);
    const markNotificationSuccess = jest.fn(async () => undefined);
    const markNotificationFailure = jest.fn(async () => undefined);

    await expect(
      dispatchAgenticResult({
        artikelNummer: 'item-err',
        payload: buildPayload({ artikelNummer: 'item-err' }),
        saveRequestPayload,
        applyAgenticResult,
        markNotificationSuccess,
        markNotificationFailure
      })
    ).rejects.toThrow('upstream error');

    expect(markNotificationSuccess).not.toHaveBeenCalled();
    expect(markNotificationFailure).toHaveBeenCalledWith('item-err', 'upstream error');
  });

  test('does not swallow saveRequestPayload errors', async () => {
    const saveRequestPayload = jest.fn(async () => { throw new Error('save failed'); });
    const applyAgenticResult = jest.fn(async () => undefined);
    const markNotificationSuccess = jest.fn(async () => undefined);
    const markNotificationFailure = jest.fn(async () => undefined);

    await expect(
      dispatchAgenticResult({
        artikelNummer: 'item-save-err',
        payload: buildPayload({ artikelNummer: 'item-save-err' }),
        saveRequestPayload,
        applyAgenticResult,
        markNotificationSuccess,
        markNotificationFailure
      })
    ).rejects.toThrow('save failed');

    expect(applyAgenticResult).not.toHaveBeenCalled();
  });
});
