export type FrontendLogger = Pick<Console, 'info' | 'warn' | 'error'>;

export const logger: FrontendLogger = console;

export function logError(message: string, error?: unknown, context?: Record<string, unknown>) {
  try {
    logger.error?.(message, { error, ...context });
  } catch (logFailure) {
    console.error('Failed to log error', logFailure);
  }
}
