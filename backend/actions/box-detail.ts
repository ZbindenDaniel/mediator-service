import type { IncomingMessage, ServerResponse } from 'http';
import { groupItemsForResponse } from '../lib/itemGrouping';
import { defineHttpAction } from './index';
// TODO(agent): Align shelf box detail payload naming with frontend expectations before adding more nested data.
// TODO(grouped-items): Remove legacy flat items response once frontend consumes groupedItems.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'box-detail',
  label: 'Box detail',
  appliesTo: () => false,
  matches: (path, method) => /^\/api\/boxes\/[^/]+$/.test(path) && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/boxes\/([^/]+)/);
      const id = match ? decodeURIComponent(match[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'Invalid box id' });
      const normalizedId = id.trim();
      const isShelf = normalizedId.toUpperCase().startsWith('S-');
      const logContext = { boxId: normalizedId, isShelf };

      let box: any;
      try {
        box = await ctx.getBox(normalizedId);
      } catch (error) {
        console.error('box-detail failed to load box', { ...logContext, error });
        return sendJson(res, 500, { error: 'box detail unavailable' });
      }
      if (!box) return sendJson(res, 404, { error: 'not found' });

      let items: any[] = [];
      try {
        items = await ctx.itemsByBox(normalizedId);
      } catch (error) {
        console.error('box-detail failed to load items', { ...logContext, error });
        return sendJson(res, 500, { error: 'box detail unavailable' });
      }

      let events: any[] = [];
      try {
        events = await ctx.listEventsForBox(normalizedId);
      } catch (error) {
        console.error('box-detail failed to load events', { ...logContext, error });
        return sendJson(res, 500, { error: 'box detail unavailable' });
      }

      // TODO(agent): Centralize shelf-contained box filtering rules once shelf/box queries are shared.
      let containedBoxes: any[] | undefined;
      if (isShelf) {
        try {
          const rawContained = await ctx.boxesByLocation(normalizedId);
          containedBoxes = Array.isArray(rawContained)
            ? rawContained.filter((contained: { BoxID?: string | null }) => {
                const containedId = typeof contained?.BoxID === 'string' ? contained.BoxID.trim() : '';
                if (!containedId) return false;
                if (containedId.toUpperCase().startsWith('S-')) return false;
                return containedId !== normalizedId;
              })
            : [];
        } catch (error) {
          console.error('box-detail failed to load contained boxes', { ...logContext, error });
          return sendJson(res, 500, { error: 'box detail unavailable' });
        }

        if (containedBoxes.length > 0) {
          try {
            // prefer the clearer stashed-style batch load, with defensive array normalization
            const shelfItemArrays = await Promise.all(
              containedBoxes
                .map((contained: { BoxID?: string | null }) =>
                  typeof contained?.BoxID === 'string' ? contained.BoxID.trim() : ''
                )
                .filter(Boolean)
                .map(async (containedId: string) => {
                  const result = await ctx.itemsByBox(containedId);
                  return Array.isArray(result) ? result : [];
                })
            );
            const shelfContainedItems = shelfItemArrays.flat();
            if (shelfContainedItems.length > 0) {
              console.info('box-detail loaded items from shelf-contained boxes', {
                ...logContext,
                containedBoxes: containedBoxes.length,
                shelfItems: items.length,
                containedItems: shelfContainedItems.length
              });
              items = [...items, ...shelfContainedItems];
            }
          } catch (error) {
            console.error('box-detail failed to load items from shelf-contained boxes', { ...logContext, error });
            return sendJson(res, 500, { error: 'box detail unavailable' });
          }
        }
      }

      const groupedItems = groupItemsForResponse(items, { logger: console });

      sendJson(res, 200, { box, items, groupedItems, events, containedBoxes });
    } catch (err) {
      console.error('Box detail failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Box detail API</p></div>'
});

export default action;
