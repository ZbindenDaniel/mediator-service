import type { IncomingMessage, ServerResponse } from 'http';
import { AGENTIC_RUN_STATUSES, AGENTIC_RUN_STATUS_NOT_STARTED, normalizeAgenticRunStatus, type AgenticRunStatus } from '../../models';
import type { Co2ImpactLabel } from '../../models/co2';
import { calculateCo2Impact } from '../lib/co2Calculator';
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
        boxes: await ctx.countBoxes() || 0,
        items: await ctx.countItems() || 0,
        itemsNoBox: await ctx.countItemsNoBox() || 0
      };
      const recentBoxes = await ctx.listRecentBoxes();
      const recentEvents = await ctx.listRecentEvents();

      let agenticStateCounts: Record<AgenticRunStatus, number> = AGENTIC_RUN_STATUSES.reduce((acc, status) => {
        acc[status] = 0;
        return acc;
      }, {} as Record<AgenticRunStatus, number>);
      let enrichedItems = 0;
      try {
        const rawStateCounts = (await ctx.countAgenticRunsByStatus?.()) as Array<{ status?: string | null; c?: string | number }> ?? [];
        agenticStateCounts = rawStateCounts.reduce((acc, row) => {
          const normalizedStatus = normalizeAgenticRunStatus(row?.status ?? AGENTIC_RUN_STATUS_NOT_STARTED);
          const nextCount = Number.isFinite(Number(row?.c)) ? Number(row.c) : 0;
          acc[normalizedStatus] = (acc[normalizedStatus] ?? 0) + nextCount;
          return acc;
        }, agenticStateCounts);
        enrichedItems = (await ctx.countEnrichedItemReferences?.()) ?? 0;
      } catch (err) {
        console.error('Failed to load agentic overview aggregates', err);
      }

      const co2LabelCounts: Record<Co2ImpactLabel, number> = {
        high: 0, medium: 0, low: 0, irrelevant: 0
      };
      const co2ScoreSums: Record<Co2ImpactLabel, number> = {
        high: 0, medium: 0, low: 0, irrelevant: 0
      };
      try {
        const co2Rows = (await ctx.listItemsForCo2?.() ?? []) as Array<{ Unterkategorien_A?: unknown; Quality?: unknown }>;
        for (const row of co2Rows) {
          const result = calculateCo2Impact({
            unterkategorien: row.Unterkategorien_A != null ? [row.Unterkategorien_A] : [],
            quality: typeof row.Quality === 'number' ? row.Quality : null
          }, console);
          if (result) {
            co2LabelCounts[result.label]++;
            co2ScoreSums[result.label] += result.score;
          }
        }
      } catch (err) {
        console.error('Failed to compute CO2 recovery potential counts for overview', err);
      }

      try {
        const totalEvents = await ctx.countEvents() || 0;
        if (totalEvents > OVERVIEW_EVENT_LIMIT) {
          console.info('Overview recent events truncated', {
            limit: OVERVIEW_EVENT_LIMIT,
            total: totalEvents
          });
        }
      } catch (err) {
        console.error('Failed to determine total event count for overview', err);
      }
      let totalWeightKg = 0;
      try {
        totalWeightKg = (await ctx.sumInventoryWeightKg?.()) ?? 0;
      } catch (err) {
        console.error('Failed to load inventory weight aggregate', err);
      }
      let totalPriceValue = 0;
      try {
        totalPriceValue = (await ctx.sumInventoryPriceValue?.()) ?? 0;
      } catch (err) {
        console.error('Failed to load inventory price aggregate', err);
      }

      sendJson(res, 200, { counts, recentBoxes, recentEvents, agentic: { stateCounts: agenticStateCounts, enrichedItems }, totalWeightKg, totalPriceValue, co2LabelCounts, co2ScoreSums });
    } catch (err) {
      console.error('Overview endpoint failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Overview API</p></div>'
});

export default action;
