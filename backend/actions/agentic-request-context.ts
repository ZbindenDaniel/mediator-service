import type { AgenticRequestContext } from '../../models';

function toTrimmedString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveRequestIdCandidate(payload: Record<string, any>, fallbackId: string | null): string | null {
  const candidates: Array<unknown> = [
    payload.requestId,
    payload.requestID,
    payload.requestUuid,
    payload.requestUUID,
    payload.uuid,
    payload.request?.id,
    payload.request?.uuid,
    payload.request?.requestId,
    payload.callback?.requestId,
    payload.callback?.id,
    payload.metadata?.requestId,
    payload.meta?.requestId
  ];

  for (const candidate of candidates) {
    const resolved = toTrimmedString(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return toTrimmedString(fallbackId);
}

function resolveNotificationMetadata(payload: Record<string, any>): AgenticRequestContext['notification'] {
  const notificationSource = payload.notification ?? payload.callback ?? payload.meta ?? null;
  if (!notificationSource || typeof notificationSource !== 'object') {
    return null;
  }

  const completedAt =
    toTrimmedString((notificationSource as Record<string, any>).completedAt) ??
    toTrimmedString((notificationSource as Record<string, any>).notifiedAt) ??
    null;
  const error =
    toTrimmedString((notificationSource as Record<string, any>).error) ??
    toTrimmedString((notificationSource as Record<string, any>).lastError) ??
    null;

  if (!completedAt && !error) {
    const hasExplicitFlags =
      Object.prototype.hasOwnProperty.call(notificationSource, 'completedAt') ||
      Object.prototype.hasOwnProperty.call(notificationSource, 'notifiedAt') ||
      Object.prototype.hasOwnProperty.call(notificationSource, 'error') ||
      Object.prototype.hasOwnProperty.call(notificationSource, 'lastError');
    if (!hasExplicitFlags) {
      return null;
    }
  }

  return { completedAt, error };
}

export function resolveAgenticRequestContext(
  payload: unknown,
  fallbackId: string | null
): AgenticRequestContext | null {
  if (!payload || typeof payload !== 'object') {
    const fallback = toTrimmedString(fallbackId);
    if (!fallback) {
      return null;
    }
    return { id: fallback, payload: payload ?? null };
  }

  const payloadRecord = payload as Record<string, any>;
  const requestId = resolveRequestIdCandidate(payloadRecord, fallbackId ? String(fallbackId) : null);
  if (!requestId) {
    return null;
  }

  const notification = resolveNotificationMetadata(payloadRecord);
  return {
    id: requestId,
    payload,
    notification
  };
}
