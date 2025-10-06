export interface AgenticRunTriggerPayload {
  itemId?: string | null;
  artikelbeschreibung?: string | null;
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
      console.warn('Agentic API base URL not configured');
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

export async function triggerAgenticRun({ runUrl, payload, context }: AgenticRunTriggerOptions): Promise<void> {
  if (!runUrl) {
    console.warn(`Agentic trigger skipped (${context}): run URL is not configured.`);
    return;
  }

  const itemIdCandidate =
    typeof payload.itemId === 'string' && payload.itemId.trim() ? payload.itemId.trim() : '';

  const artikelbeschreibungCandidate =
    typeof payload.artikelbeschreibung === 'string' && payload.artikelbeschreibung.trim()
      ? payload.artikelbeschreibung.trim()
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
