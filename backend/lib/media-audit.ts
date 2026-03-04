export type MediaAuditAction = 'write' | 'delete' | 'prune' | 'mirror-copy' | 'mirror-skip';
export type MediaAuditScope = 'item' | 'box' | 'erp-sync' | 'import';
export type MediaAuditOutcome = 'start' | 'success' | 'blocked' | 'error' | 'skipped';

export interface MediaAuditIdentifier {
  artikelNummer: string | null;
  itemUUID: string | null;
}

export interface MediaAuditEvent {
  action: MediaAuditAction;
  scope: MediaAuditScope;
  identifier: MediaAuditIdentifier;
  path: string | null;
  root: string | null;
  outcome: MediaAuditOutcome;
  reason: string | null;
  error: string | null;
}

function normalizeIdentifier(value?: Partial<MediaAuditIdentifier> | null): MediaAuditIdentifier {
  return {
    artikelNummer: value?.artikelNummer ?? null,
    itemUUID: value?.itemUUID ?? null,
  };
}

function normalizeError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
}

export function emitMediaAudit(
  event: Omit<MediaAuditEvent, 'identifier' | 'error'> & {
    identifier?: Partial<MediaAuditIdentifier> | null;
    error?: unknown;
  },
  logger: Pick<Console, 'info'> = console
): MediaAuditEvent {
  const normalized: MediaAuditEvent = {
    ...event,
    identifier: normalizeIdentifier(event.identifier),
    error: normalizeError(event.error),
  };

  logger.info('[media-audit]', normalized);
  return normalized;
}
