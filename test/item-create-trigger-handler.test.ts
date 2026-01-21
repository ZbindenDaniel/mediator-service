import type { AgenticRunTriggerPayload } from '../frontend/src/lib/agentic';
import {
  handleAgenticRunTrigger,
  maybeTriggerAgenticRun,
  type AgenticTriggerFailureReporter
} from '../frontend/src/components/ItemCreate';

describe('handleAgenticRunTrigger', () => {
  async function runWithLog(context: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (error) {
      console.error(`[test] ${context} failed`, error);
      throw error;
    }
  }

  function createLoggerMock() {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as const;
  }

  function createPayload(overrides: Partial<AgenticRunTriggerPayload> = {}): AgenticRunTriggerPayload {
    return {
      itemId: 'uuid-123',
      artikelbeschreibung: 'Beispiel Artikel',
      ...overrides
    };
  }

  it('handles triggered outcome without reporting failures or alerts', async () => {
    await runWithLog('handleAgenticRunTrigger triggered outcome', async () => {
      const logger = createLoggerMock();
      const triggerRequest = jest.fn().mockResolvedValue({ outcome: 'triggered', status: 202 });
      const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
      const alertFn = jest.fn().mockResolvedValue(undefined);
      const payload = createPayload();

      await handleAgenticRunTrigger({
        agenticPayload: payload,
        context: 'test-triggered',
        triggerAgenticRunRequest: triggerRequest,
        reportFailure,
        alertFn,
        logger,
        onSkipped: jest.fn()
      });

      expect(triggerRequest).toHaveBeenCalledTimes(1);
      expect(triggerRequest).toHaveBeenCalledWith({ payload, context: 'test-triggered' });
      const [[triggerArgs]] = triggerRequest.mock.calls;
      expect(triggerArgs.payload).toEqual({
        artikelbeschreibung: 'Beispiel Artikel',
        itemId: 'uuid-123'
      });
      expect(triggerArgs.payload).not.toHaveProperty('item');
      expect(reportFailure).not.toHaveBeenCalled();
      expect(alertFn).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Agentic trigger result', {
        context: 'test-triggered',
        outcome: 'triggered',
        status: 202
      });
    });
  });

  it('handles skipped outcome by reporting the skip and alerting the user', async () => {
    await runWithLog('handleAgenticRunTrigger skipped outcome', async () => {
      const logger = createLoggerMock();
      const triggerRequest = jest
        .fn()
        .mockResolvedValue({ outcome: 'skipped', reason: 'missing-item-id', message: 'Trigger skipped' });
      const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
      const alertFn = jest.fn().mockResolvedValue(undefined);
      const onSkipped = jest.fn();
      const payload = createPayload();

      await handleAgenticRunTrigger({
        agenticPayload: payload,
        context: 'test-skipped',
        triggerAgenticRunRequest: triggerRequest,
        reportFailure,
        alertFn,
        logger,
        onSkipped
      });

      expect(triggerRequest).toHaveBeenCalledTimes(1);
      const [[triggerArgs]] = triggerRequest.mock.calls;
      expect(triggerArgs.payload).toEqual({
        artikelbeschreibung: 'Beispiel Artikel',
        itemId: 'uuid-123'
      });
      expect(triggerArgs.payload).not.toHaveProperty('item');
      expect(reportFailure).toHaveBeenCalledWith({
        itemId: 'uuid-123',
        search: 'Beispiel Artikel',
        context: 'test-skipped',
        responseBody: 'Trigger skipped',
        error: 'missing-item-id'
      });
      expect(alertFn).toHaveBeenCalledWith('Trigger skipped');
      expect(onSkipped).toHaveBeenCalledWith('uuid-123');
      expect(logger.info).toHaveBeenCalledWith('Agentic trigger result', {
        context: 'test-skipped',
        outcome: 'skipped',
        status: undefined
      });
    });
  });

  it('handles failed outcome by reporting failure and alerting the user', async () => {
    await runWithLog('handleAgenticRunTrigger failed outcome', async () => {
      const logger = createLoggerMock();
      const triggerRequest = jest.fn().mockResolvedValue({
        outcome: 'failed',
        reason: 'response-not-ok',
        status: 500,
        message: 'Trigger failed',
        error: { detail: 'kaputt' }
      });
      const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
      const alertFn = jest.fn().mockResolvedValue(undefined);
      const payload = createPayload({ artikelbeschreibung: 'Agentic Artikel' });

      await handleAgenticRunTrigger({
        agenticPayload: payload,
        context: 'test-failed',
        triggerAgenticRunRequest: triggerRequest,
        reportFailure,
        alertFn,
        logger
      });

      expect(triggerRequest).toHaveBeenCalledTimes(1);
      const [[triggerArgs]] = triggerRequest.mock.calls;
      expect(triggerArgs.payload).toEqual({
        artikelbeschreibung: 'Agentic Artikel',
        itemId: 'uuid-123'
      });
      expect(triggerArgs.payload).not.toHaveProperty('item');
      expect(reportFailure).toHaveBeenCalledWith({
        itemId: 'uuid-123',
        search: 'Agentic Artikel',
        context: 'test-failed',
        status: 500,
        responseBody: 'Trigger failed',
        error: { detail: 'kaputt' }
      });
      expect(alertFn).toHaveBeenCalledWith('Trigger failed');
      expect(logger.info).toHaveBeenCalledWith('Agentic trigger result', {
        context: 'test-failed',
        outcome: 'failed',
        status: 500
      });
    });
  });

  it('logs when a skipped outcome lacks an ItemUUID', async () => {
    await runWithLog('handleAgenticRunTrigger skipped missing ItemUUID', async () => {
      const logger = createLoggerMock();
      const triggerRequest = jest.fn().mockResolvedValue({
        outcome: 'skipped',
        reason: 'missing-item-id',
        message: 'Trigger skipped'
      });
      const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
      const alertFn = jest.fn().mockResolvedValue(undefined);
      const payload = createPayload({ itemId: '   ' });

      await handleAgenticRunTrigger({
        agenticPayload: payload,
        context: 'test-skipped-empty-id',
        triggerAgenticRunRequest: triggerRequest,
        reportFailure,
        alertFn,
        logger
      });

      expect(reportFailure).not.toHaveBeenCalled();
      expect(alertFn).toHaveBeenCalledWith('Trigger skipped');
      expect(logger.warn).toHaveBeenCalledWith('Agentic trigger skipped without ItemUUID', {
        context: 'test-skipped-empty-id',
        reason: 'missing-item-id'
      });
    });
  });

  it('logs when reporting failures throws', async () => {
    await runWithLog('handleAgenticRunTrigger reportFailure error', async () => {
      const logger = createLoggerMock();
      const triggerRequest = jest.fn().mockResolvedValue({
        outcome: 'skipped',
        reason: 'missing-item-id',
        message: 'Trigger skipped'
      });
      const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockRejectedValue(new Error('report failed'));
      const alertFn = jest.fn().mockResolvedValue(undefined);
      const payload = createPayload();

      await handleAgenticRunTrigger({
        agenticPayload: payload,
        context: 'test-report-failure',
        triggerAgenticRunRequest: triggerRequest,
        reportFailure,
        alertFn,
        logger
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to report skipped agentic trigger',
        expect.any(Error)
      );
      expect(alertFn).toHaveBeenCalledWith('Trigger skipped');
    });
  });

  it('logs when alerting fails after a failed trigger', async () => {
    await runWithLog('handleAgenticRunTrigger alert failure', async () => {
      const logger = createLoggerMock();
      const triggerRequest = jest.fn().mockResolvedValue({
        outcome: 'failed',
        reason: 'response-not-ok',
        status: 500,
        message: 'Trigger failed',
        error: { detail: 'kaputt' }
      });
      const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
      const alertFn = jest.fn().mockRejectedValue(new Error('alert failed'));
      const payload = createPayload();

      await handleAgenticRunTrigger({
        agenticPayload: payload,
        context: 'test-alert-failure',
        triggerAgenticRunRequest: triggerRequest,
        reportFailure,
        alertFn,
        logger
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to display agentic trigger failure message',
        expect.any(Error)
      );
    });
  });

  it('logs when agentic trigger throws unexpectedly', async () => {
    await runWithLog('handleAgenticRunTrigger unexpected error', async () => {
      const logger = createLoggerMock();
      const triggerRequest = jest.fn().mockRejectedValue(new Error('network down'));
      const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
      const alertFn = jest.fn().mockResolvedValue(undefined);
      const payload = createPayload();

      await handleAgenticRunTrigger({
        agenticPayload: payload,
        context: 'test-trigger-exception',
        triggerAgenticRunRequest: triggerRequest,
        reportFailure,
        alertFn,
        logger
      });

      expect(logger.error).toHaveBeenCalledWith('Failed to trigger agentic run', expect.any(Error));
      expect(reportFailure).toHaveBeenCalledWith({
        itemId: 'uuid-123',
        search: 'Beispiel Artikel',
        context: 'test-trigger-exception',
        error: expect.any(Error)
      });
    });
  });

  it('skips triggering agentic run when backend already dispatched', () => {
    const logger = createLoggerMock();
    const triggerRequest = jest.fn();
    const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
    const alertFn = jest.fn().mockResolvedValue(undefined);
    const handleTrigger = jest.fn();

    maybeTriggerAgenticRun({
      agenticPayload: createPayload(),
      context: 'backend-dispatched',
      shouldUseAgenticForm: true,
      backendDispatched: true,
      triggerAgenticRunRequest: triggerRequest,
      reportFailure,
      alertFn,
      logger,
      onSkipped: jest.fn(),
      handleTrigger
    });

    expect(handleTrigger).not.toHaveBeenCalled();
    expect(triggerRequest).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Skipping agentic trigger because backend already dispatched run',
      { context: 'backend-dispatched' }
    );
  });

  it('skips triggering agentic run when agentic form is disabled', () => {
    const logger = createLoggerMock();
    const triggerRequest = jest.fn();
    const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
    const alertFn = jest.fn().mockResolvedValue(undefined);
    const handleTrigger = jest.fn();

    maybeTriggerAgenticRun({
      agenticPayload: createPayload(),
      context: 'agentic-disabled',
      shouldUseAgenticForm: false,
      triggerAgenticRunRequest: triggerRequest,
      reportFailure,
      alertFn,
      logger,
      onSkipped: jest.fn(),
      handleTrigger
    });

    expect(handleTrigger).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Skipping agentic trigger because agentic form is not active', {
      context: 'agentic-disabled'
    });
  });

  it('logs when async agentic trigger rejects', async () => {
    await runWithLog('maybeTriggerAgenticRun rejected trigger', async () => {
      const logger = createLoggerMock();
      const triggerRequest = jest.fn();
      const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
      const alertFn = jest.fn().mockResolvedValue(undefined);
      const handleTrigger = jest.fn().mockRejectedValue(new Error('reject'));

      maybeTriggerAgenticRun({
        agenticPayload: createPayload(),
        context: 'reject-trigger',
        shouldUseAgenticForm: true,
        triggerAgenticRunRequest: triggerRequest,
        reportFailure,
        alertFn,
        logger,
        onSkipped: jest.fn(),
        handleTrigger
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(logger.error).toHaveBeenCalledWith('Unhandled error while processing agentic trigger', expect.any(Error));
    });
  });

  it('logs when starting agentic trigger throws synchronously', async () => {
    await runWithLog('maybeTriggerAgenticRun synchronous throw', async () => {
      const logger = createLoggerMock();
      const triggerRequest = jest.fn();
      const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
      const alertFn = jest.fn().mockResolvedValue(undefined);
      const handleTrigger = jest.fn(() => {
        throw new Error('sync boom');
      });

      maybeTriggerAgenticRun({
        agenticPayload: createPayload(),
        context: 'sync-throw',
        shouldUseAgenticForm: true,
        triggerAgenticRunRequest: triggerRequest,
        reportFailure,
        alertFn,
        logger,
        onSkipped: jest.fn(),
        handleTrigger
      });

      expect(logger.error).toHaveBeenCalledWith('Failed to start agentic trigger workflow', expect.any(Error));
    });
  });
});
