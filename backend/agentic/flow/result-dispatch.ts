import { FlowError } from './errors';
import type { AgenticResultPayload } from '../result-handler';
import type { ItemFlowLogger } from './item-flow';

export interface DispatchAgenticResultOptions {
  artikelNummer: string;
  payload: AgenticResultPayload;
  logger?: ItemFlowLogger;
  saveRequestPayload: (artikelNummer: string, payload: unknown) => Promise<void> | void;
  applyAgenticResult?: (payload: AgenticResultPayload) => Promise<void> | void;
  markNotificationSuccess: (artikelNummer: string) => Promise<void> | void;
  markNotificationFailure: (artikelNummer: string, errorMessage: string) => Promise<void> | void;
  checkCancellation?: () => void;
}

export async function dispatchAgenticResult({
  artikelNummer,
  payload,
  logger,
  saveRequestPayload,
  applyAgenticResult,
  markNotificationSuccess,
  markNotificationFailure,
  checkCancellation
}: DispatchAgenticResultOptions): Promise<void> {
  try {
    await saveRequestPayload(artikelNummer, payload);
  } catch (err) {
    logger?.error?.({ err, msg: 'failed to persist request payload', artikelNummer });
    throw err;
  }

  try {
    checkCancellation?.();
    if (!applyAgenticResult) {
      throw new FlowError('RESULT_HANDLER_MISSING', 'Agentic result handler unavailable', 500);
    }

    await applyAgenticResult(payload);
    checkCancellation?.();
    await markNotificationSuccess(artikelNummer);
  } catch (err) {
    logger?.error?.({ err, msg: 'agentic result dispatch failed', artikelNummer });
    try {
      await markNotificationFailure(
        artikelNummer,
        err instanceof Error ? err.message : 'agentic result dispatch failed'
      );
    } catch (notificationErr) {
      logger?.error?.({ err: notificationErr, msg: 'failed to mark notification failure', artikelNummer });
    }
    throw err;
  }
}
