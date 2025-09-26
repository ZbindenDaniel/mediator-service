export interface AgenticRunTriggerPayload {
  id?: string | null;
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

export async function triggerAgenticRun({ runUrl, payload, context }: AgenticRunTriggerOptions): Promise<void> {
  if (!runUrl) {
    console.warn(`Agentic trigger skipped (${context}): run URL is not configured.`);
    return;
  }

  const itemId = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!itemId) {
    console.warn(`Agentic trigger skipped (${context}): missing ItemUUID`);
    return;
  }

  const search = typeof payload.search === 'string' ? payload.search : '';
  if (!search) {
    console.warn(`Agentic trigger skipped (${context}): missing search term`);
    return;
  }

  try {
    const response = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId, search })
    });
    if (!response.ok) {
      console.error(`Agentic trigger failed during ${context}`, response.status);
    }
  } catch (err) {
    console.error(`Agentic trigger invocation failed during ${context}`, err);
  }
}
