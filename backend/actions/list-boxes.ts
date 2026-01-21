// TODO(agent): add action tests.
import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

// TODO(agent): Consider pagination or response limiting for filtered list box queries.
// TODO(agent): Evaluate indexing shelf category segments if filtered list requests increase.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function normalizeCategoryFilter(rawCategory: string | null): { normalized: string | null; invalid: boolean } {
  if (!rawCategory) {
    return { normalized: null, invalid: false };
  }

  const trimmed = rawCategory.trim();
  if (!trimmed) {
    return { normalized: null, invalid: false };
  }

  if (!/^\d{1,4}$/.test(trimmed)) {
    return { normalized: null, invalid: true };
  }

  return { normalized: trimmed.padStart(4, '0'), invalid: false };
}

function matchesShelfCategory(box: { BoxID?: string; LocationId?: string | null }, category: string): boolean {
  const candidateIds = [box.BoxID, box.LocationId];
  const pattern = new RegExp(`^S-[^-]+-[^-]+-${category}-`, 'i');
  return candidateIds.some((id) => typeof id === 'string' && pattern.test(id));
}

const action = defineHttpAction({
  key: 'list-boxes',
  label: 'List boxes',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/boxes' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = new URL(req.url ?? '/api/boxes', 'http://localhost');
      const rawType = url.searchParams.get('type') ?? '';
      const normalizedType = rawType.trim().toUpperCase();
      const { normalized: normalizedCategory, invalid: invalidCategory } = normalizeCategoryFilter(
        url.searchParams.get('category')
      );

      if (normalizedType && !/^[A-Z0-9]$/.test(normalizedType)) {
        console.warn('Invalid box type filter for list-boxes', { rawType });
        return sendJson(res, 400, { error: 'invalid box type filter' });
      }
      if (invalidCategory) {
        console.warn('Invalid shelf category filter for list-boxes', { rawCategory: url.searchParams.get('category') });
        return sendJson(res, 400, { error: 'invalid shelf category filter' });
      }

      const queryHelper = ctx.listBoxes;
      if (!queryHelper || typeof queryHelper.all !== 'function') {
        console.error('list-boxes helper is missing or invalid');
        return sendJson(res, 500, { error: 'list boxes unavailable' });
      }

      if (normalizedType && typeof queryHelper.byType !== 'function') {
        console.error('list-boxes type filter requested but unsupported');
        return sendJson(res, 500, { error: 'filtered list boxes unavailable' });
      }

      let boxes = normalizedType ? queryHelper.byType(normalizedType) : queryHelper.all();
      if (normalizedCategory && normalizedType && normalizedType !== 'S') {
        console.warn('Shelf category filter ignored for non-shelf list-boxes query', {
          type: normalizedType,
          category: normalizedCategory
        });
      }

      if (normalizedCategory && normalizedType === 'S') {
        try {
          boxes = boxes.filter((box: { BoxID?: string; LocationId?: string | null }) =>
            matchesShelfCategory(box, normalizedCategory)
          );
        } catch (error) {
          console.error('list-boxes category filter failed', { category: normalizedCategory, error });
          return sendJson(res, 500, { error: 'filtered list boxes unavailable' });
        }
      }

      console.log('list-boxes', {
        count: boxes.length,
        filtered: Boolean(normalizedType || normalizedCategory),
        type: normalizedType || undefined,
        category: normalizedCategory || undefined
      });
      sendJson(res, 200, { boxes });
    } catch (err) {
      console.error('List boxes failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">List boxes API</p></div>'
});

export default action;
