import type { IncomingMessage, ServerResponse } from 'http';
import { AGENTIC_RUN_STATUSES, AGENTIC_RUN_STATUS_NOT_STARTED, normalizeAgenticRunStatus, type AgenticRunStatus } from '../../models';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// TODO(agent): Surface topic filter summaries to help operators verify overview feed constraints.
const action = defineHttpAction({
  key: 'overview',
  label: 'Overview',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/overview' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    const OVERVIEW_EVENT_LIMIT = 3;
    try {
      const counts = {
        boxes: ctx.countBoxes.get().c || 0,
        items: ctx.countItems.get().c || 0,
        itemsNoBox: ctx.countItemsNoBox.get().c || 0
      };
      const recentBoxes = ctx.listRecentBoxes.all();
      const recentEvents = ctx.listRecentEvents.all();

      let agenticStateCounts: Record<AgenticRunStatus, number> = AGENTIC_RUN_STATUSES.reduce((acc, status) => {
        acc[status] = 0;
        return acc;
      }, {} as Record<AgenticRunStatus, number>);
      let enrichedItems = 0;
      try {
        const rawStateCounts = (ctx.countAgenticRunsByStatus?.all?.() ?? []) as Array<{ status?: string | null; c?: number }>;
        agenticStateCounts = rawStateCounts.reduce((acc, row) => {
          const normalizedStatus = normalizeAgenticRunStatus(row?.status ?? AGENTIC_RUN_STATUS_NOT_STARTED);
          const nextCount = typeof row?.c === 'number' && Number.isFinite(row.c) ? row.c : 0;
          acc[normalizedStatus] = (acc[normalizedStatus] ?? 0) + nextCount;
          return acc;
        }, agenticStateCounts);
        enrichedItems = ctx.countEnrichedItemReferences?.get?.()?.c || 0;
      } catch (err) {
        console.error('Failed to load agentic overview aggregates', err);
      }

      try {
        const totalEvents = ctx.countEvents.get().c || 0;
        if (totalEvents > OVERVIEW_EVENT_LIMIT) {
          console.info('Overview recent events truncated', {
            limit: OVERVIEW_EVENT_LIMIT,
            total: totalEvents
          });
        }
      } catch (err) {
        console.error('Failed to determine total event count for overview', err);
      }
      sendJson(res, 200, { counts, recentBoxes, recentEvents, agentic: { stateCounts: agenticStateCounts, enrichedItems } });
    } catch (err) {
      console.error('Overview endpoint failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Overview API</p></div>'
});

export default action;
