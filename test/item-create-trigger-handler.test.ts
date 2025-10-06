import type { AgenticRunTriggerPayload } from '../frontend/src/lib/agentic';
import {
  handleAgenticRunTrigger,
  type AgenticTriggerFailureReporter
} from '../frontend/src/components/ItemCreate';

describe('handleAgenticRunTrigger', () => {
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
    const logger = createLoggerMock();
    const triggerRequest = jest.fn().mockResolvedValue({ outcome: 'triggered', status: 202 });
    const reportFailure: AgenticTriggerFailureReporter = jest.fn().mockResolvedValue(undefined);
    const alertFn = jest.fn().mockResolvedValue(undefined);
    const payload = createPayload();

    await handleAgenticRunTrigger({
      agenticPayload: payload,
      context: 'test-triggered',
      agenticRunUrl: 'https://example.invalid/run',
      triggerAgenticRunRequest: triggerRequest,
      reportFailure,
      alertFn,
      logger,
      onSkipped: jest.fn()
    });

    expect(triggerRequest).toHaveBeenCalledWith({
      runUrl: 'https://example.invalid/run',
      payload,
      context: 'test-triggered'
    });
    expect(reportFailure).not.toHaveBeenCalled();
    expect(alertFn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Agentic trigger result', {
      context: 'test-triggered',
      outcome: 'triggered',
      status: 202
    });
  });

  it('handles skipped outcome by reporting the skip and alerting the user', async () => {
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
      agenticRunUrl: 'https://example.invalid/run',
      triggerAgenticRunRequest: triggerRequest,
      reportFailure,
      alertFn,
      logger,
      onSkipped
    });

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

  it('handles failed outcome by reporting failure and alerting the user', async () => {
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
      agenticRunUrl: 'https://example.invalid/run',
      triggerAgenticRunRequest: triggerRequest,
      reportFailure,
      alertFn,
      logger
    });

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
