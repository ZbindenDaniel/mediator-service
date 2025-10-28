import type { Logger } from '../../utils/logger';
import type { AgenticRunStatus } from '../../../models';

export interface AgenticInputs {
  requestedStatus?: string | null;
  agenticSearch?: string | null;
  fallbackDescription?: string | null;
}

export interface AgenticPreparation {
  status: AgenticRunStatus;
  searchQuery: string;
}

const ALLOWED_STATUSES: AgenticRunStatus[] = ['queued', 'running'];

export function prepareAgenticTrigger(
  inputs: AgenticInputs,
  logger: Logger
): AgenticPreparation {
  const requestedStatus = (inputs.requestedStatus || 'queued').trim().toLowerCase();
  let status: AgenticRunStatus = 'queued';
  if (ALLOWED_STATUSES.includes(requestedStatus as AgenticRunStatus)) {
    status = requestedStatus as AgenticRunStatus;
  } else if (requestedStatus) {
    logger.warn('Unsupported agentic status requested, defaulting to queued', {
      requestedStatus
    });
  }

  const rawSearch = inputs.agenticSearch || inputs.fallbackDescription || '';
  const searchQuery = rawSearch.trim();

  return { status, searchQuery };
}
