import { FlowError } from './errors';
import type { AgenticResultPayload } from '../result-handler';
import type { ItemFlowLogger } from './item-flow';

export interface DispatchAgenticResultOptions {
  itemId: string;
  payload: AgenticResultPayload;
  logger?: ItemFlowLogger;
  saveRequestPayload: (itemId: string, payload: unknown) => Promise<void> | void;
  applyAgenticResult?: (payload: AgenticResultPayload) => Promise<void> | void;
  markNotificationSuccess: (itemId: string) => Promise<void> | void;
  markNotificationFailure: (itemId: string, errorMessage: string) => Promise<void> | void;
  checkCancellation?: () => void;
}

export async function dispatchAgenticResult({
  itemId,
  payload,
  logger,
  saveRequestPayload,
  applyAgenticResult,
  markNotificationSuccess,
  markNotificationFailure,
  checkCancellation
}: DispatchAgenticResultOptions): Promise<void> {
  try {
    await saveRequestPayload(itemId, payload);
  } catch (err) {
    logger?.error?.({ err, msg: 'failed to persist request payload', itemId });
    throw err;
  }

  try {
    checkCancellation?.();
    if (!applyAgenticResult) {
      throw new FlowError('RESULT_HANDLER_MISSING', 'Agentic result handler unavailable', 500);
    }

    await applyAgenticResult(payload);
    checkCancellation?.();
    await markNotificationSuccess(itemId);
  } catch (err) {
    logger?.error?.({ err, msg: 'agentic result dispatch failed', itemId });
    try {
      await markNotificationFailure(
        itemId,
        err instanceof Error ? err.message : 'agentic result dispatch failed'
      );
    } catch (notificationErr) {
      logger?.error?.({ err: notificationErr, msg: 'failed to mark notification failure', itemId });
    }
    throw err;
  }
}
