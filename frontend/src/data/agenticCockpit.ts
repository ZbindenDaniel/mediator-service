// API client for the KI cockpit (/ki). Read is open to the agentic feature; the write levers are
// admin-gated server-side (forward-auth identity headers, sent automatically) — a non-admin gets 401/403,
// which the caller surfaces as "admin only" rather than an error.

export type AgenticFlagKey = 'autoApprove' | 'autoRework' | 'autoReview';

export interface PipelineCockpit {
  flags: { autoApprove: boolean; autoRework: boolean; autoReview: boolean };
  autoDispatch: boolean;
  thresholds: { autoApproveMinGrade: number; maxWaitingRuns: number; selfHealCooldownMinutes: number };
  queue: { waiting: number; running: number; notStarted: number };
  selfHeal: {
    standardsVersion: number | null;
    staleCount: number;
    counts: { rework: number; restamp: number; reword: number; rerun: number };
    byStatus: Record<string, number>;
  };
}

export interface SweepNowResult {
  warmedUp?: boolean;
  staleCount?: number;
  reason?: string | null;
  enqueued?: Array<{ artikelNummer: string; acted: string }>;
  restamped?: number;
  note?: string;
}

/** Thrown by a lever call when the operator isn't an admin (server 401/403). */
export class AdminRequiredError extends Error {
  constructor() {
    super('admin-required');
    this.name = 'AdminRequiredError';
  }
}

async function postAdmin<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (res.status === 401 || res.status === 403) throw new AdminRequiredError();
  if (!res.ok && res.status !== 202) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function fetchPipelineCockpit(): Promise<PipelineCockpit> {
  const res = await fetch('/api/agentic/cockpit');
  if (!res.ok) throw new Error(`Cockpit laden fehlgeschlagen (${res.status})`);
  return (await res.json()) as PipelineCockpit;
}

export function setAgenticFlag(flag: AgenticFlagKey, enabled: boolean): Promise<{ flag: AgenticFlagKey; enabled: boolean }> {
  return postAdmin('/api/admin/agentic-flags', { flag, enabled });
}

export function setAutoDispatch(enabled: boolean): Promise<{ enabled: boolean }> {
  return postAdmin('/api/admin/agentic-dispatch', { enabled });
}

export function runSelfHealNow(): Promise<SweepNowResult> {
  return postAdmin('/api/admin/agentic-self-heal');
}
