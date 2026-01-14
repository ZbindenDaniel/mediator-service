import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { handleUnifiedPrintRequest } from './print-unified';

// TODO(unify-print): Remove print-item wrapper once /api/print/:labelType/:id is fully adopted.

const action = defineHttpAction({
  key: 'print-item',
  label: 'Print item label',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/print\/item\/[^/]+$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    await handleUnifiedPrintRequest(req, res, ctx, { labelTypeOverride: 'item' });
  },
  view: () => '<div class="card"><p class="muted">Print item API</p></div>'
});

export default action;
