export interface AgenticRunTriggerPayload {
  itemId?: string | null;
  artikelbeschreibung?: string | null;
  /**
   * @deprecated Temporary support for legacy payloads while the UI transitions to the
   *             new agent service contract.
   */
  id?: string | null;
  /**
   * @deprecated Temporary support for legacy payloads while the UI transitions to the
   *             new agent service contract.
   */
  search?: string | null;
}

export interface AgenticRunTriggerOptions {
  runUrl: string | null;
  payload: AgenticRunTriggerPayload;
  context: string;
}

type AgenticEnv = typeof globalThis & {
  AGENTIC_API_BASE?: string;
  process?: { env?: Record<string, string | undefined> };
};

export function resolveAgenticApiBase(): string | null {
  try {
    const globalScope = globalThis as AgenticEnv;
    const candidate = globalScope.AGENTIC_API_BASE ?? globalScope.process?.env?.AGENTIC_API_BASE;
    if (!candidate) {
      return null;
    }
    return candidate.replace(/\/+$/, '');
  } catch (err) {
    console.error('Failed to resolve agentic API base URL', err);
    return null;
  }
}

export function buildAgenticRunUrl(agenticApiBase: string | null): string | null {
  if (!agenticApiBase) {
    return null;
  }
  try {
    return new URL('/run', agenticApiBase).toString();
  } catch (err) {
    console.error('Failed to construct agentic run URL', err);
    return null;
  }
}

export function buildAgenticCancelUrl(agenticApiBase: string | null): string | null {
  if (!agenticApiBase) {
    return null;
  }
  try {
    return new URL('/run/cancel', agenticApiBase).toString();
  } catch (err) {
    console.error('Failed to construct agentic cancel URL', err);
    return null;
  }
}

export async function triggerAgenticRun({ runUrl, payload, context }: AgenticRunTriggerOptions): Promise<void> {
  if (!runUrl) {
    console.warn(`Agentic trigger skipped (${context}): run URL is not configured.`);
    return;
  }

  const itemIdCandidate =
    typeof payload.itemId === 'string' && payload.itemId.trim()
      ? payload.itemId.trim()
      : typeof payload.id === 'string' && payload.id.trim()
        ? payload.id.trim()
        : '';

  const artikelbeschreibungCandidate =
    typeof payload.artikelbeschreibung === 'string' && payload.artikelbeschreibung.trim()
      ? payload.artikelbeschreibung.trim()
      : typeof payload.search === 'string' && payload.search.trim()
        ? payload.search.trim()
        : '';

  if (!artikelbeschreibungCandidate) {
    console.warn(`Agentic trigger skipped (${context}): missing Artikelbeschreibung`);
    return;
  }

  const itemId = itemIdCandidate;
  if (!itemId) {
    console.warn(`Agentic trigger skipped (${context}): missing ItemUUID`);
    return;
  }

  try {
    const body = {
      item: {
        Artikelbeschreibung: artikelbeschreibungCandidate,
        ItemUUID: itemId
      }
    } as const;

    const response = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      let errorDetails: unknown = null;
      try {
        errorDetails = await response.clone().json();
      } catch (jsonErr) {
        try {
          errorDetails = await response.text();
        } catch (textErr) {
          errorDetails = { message: 'Failed to read response body', cause: textErr };
        }
        console.warn(`Agentic trigger failed during ${context}: non-JSON error payload`, jsonErr);
      }
      console.error(`Agentic trigger failed during ${context}`, response.status, errorDetails);
    }
  } catch (err) {
    console.error(`Agentic trigger invocation failed during ${context}`, err);
  }
}

export interface AgenticRunCancelOptions {
  cancelUrl: string | null;
  itemId: string | null | undefined;
  actor?: string | null;
  context: string;
}

export async function cancelAgenticRun({ cancelUrl, itemId, actor, context }: AgenticRunCancelOptions): Promise<void> {
  if (!cancelUrl) {
    console.warn(`Agentic cancel skipped (${context}): cancel URL is not configured.`);
    return;
  }

  const trimmedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!trimmedItemId) {
    console.warn(`Agentic cancel skipped (${context}): missing ItemUUID`);
    return;
  }

  const trimmedActor = typeof actor === 'string' ? actor.trim() : '';

  try {
    const body = {
      item: { ItemUUID: trimmedItemId },
      actor: trimmedActor || undefined
    } as const;

    const response = await fetch(cancelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      // TODO: Include richer context payload when the agentic API expects extended item metadata.
      let errorDetails: unknown = null;
      try {
        errorDetails = await response.clone().json();
      } catch (jsonErr) {
        try {
          errorDetails = await response.text();
        } catch (textErr) {
          errorDetails = { message: 'Failed to read response body', cause: textErr };
        }
        console.warn(`Agentic cancel failed during ${context}: non-JSON error payload`, jsonErr);
      }
      const err = new Error(`Agentic cancel failed during ${context}`);
      console.error(err.message, response.status, errorDetails);
      throw err;
    }
  } catch (err) {
    console.error(`Agentic cancel invocation failed during ${context}`, err);
    throw err instanceof Error ? err : new Error('Agentic cancel invocation failed');
  }
}
