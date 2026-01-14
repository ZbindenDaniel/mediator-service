import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
// TODO(agent): Align shelf box detail payload naming with frontend expectations before adding more nested data.

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
      const getBoxHelper = ctx.getBox;
      if (!getBoxHelper || typeof getBoxHelper.get !== 'function') {
        console.error('box-detail getBox helper is missing', logContext);
        return sendJson(res, 500, { error: 'box detail unavailable' });
      }
      let box: any;
      try {
        box = getBoxHelper.get(normalizedId);
      } catch (error) {
        console.error('box-detail failed to load box', { ...logContext, error });
        return sendJson(res, 500, { error: 'box detail unavailable' });
      }
      if (!box) return sendJson(res, 404, { error: 'not found' });

      const itemsHelper = ctx.itemsByBox;
      if (!itemsHelper || typeof itemsHelper.all !== 'function') {
        console.error('box-detail itemsByBox helper is missing', logContext);
        return sendJson(res, 500, { error: 'box detail unavailable' });
      }
      let items: any[] = [];
      try {
        items = itemsHelper.all(normalizedId);
      } catch (error) {
        console.error('box-detail failed to load items', { ...logContext, error });
        return sendJson(res, 500, { error: 'box detail unavailable' });
      }

      const eventsHelper = ctx.listEventsForBox;
      if (!eventsHelper || typeof eventsHelper.all !== 'function') {
        console.error('box-detail listEventsForBox helper is missing', logContext);
        return sendJson(res, 500, { error: 'box detail unavailable' });
      }
      let events: any[] = [];
      try {
        events = eventsHelper.all(normalizedId);
      } catch (error) {
        console.error('box-detail failed to load events', { ...logContext, error });
        return sendJson(res, 500, { error: 'box detail unavailable' });
      }

      // TODO(agent): Centralize shelf-contained box filtering rules once shelf/box queries are shared.
      let containedBoxes: any[] | undefined;
      if (isShelf) {
        const boxesByLocationHelper = ctx.boxesByLocation;
        if (!boxesByLocationHelper || typeof boxesByLocationHelper.all !== 'function') {
          console.warn('box-detail boxesByLocation helper missing for shelf', logContext);
          containedBoxes = [];
        } else {
          try {
            const rawContained = boxesByLocationHelper.all(normalizedId);
            const filtered = Array.isArray(rawContained)
              ? rawContained.filter((contained: { BoxID?: string | null }) => {
                  const containedId = typeof contained?.BoxID === 'string' ? contained.BoxID.trim() : '';
                  if (!containedId) {
                    return false;
                  }
                  if (containedId.toUpperCase().startsWith('S-')) {
                    return false;
                  }
                  return containedId !== normalizedId;
                })
              : [];
            if (filtered.length !== (rawContained?.length ?? 0)) {
              console.info('box-detail filtered shelf-contained boxes', {
                ...logContext,
                total: rawContained?.length ?? 0,
                remaining: filtered.length
              });
            }
            containedBoxes = filtered;
          } catch (error) {
            console.error('box-detail failed to load contained boxes', { ...logContext, error });
            return sendJson(res, 500, { error: 'box detail unavailable' });
          }
        }
      }

      sendJson(res, 200, { box, items, events, containedBoxes });
    } catch (err) {
      console.error('Box detail failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Box detail API</p></div>'
});

export default action;
