import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { handleUnifiedPrintRequest } from './print-unified';

// TODO(unify-print): Remove print-box wrapper once /api/print/:labelType/:id is fully adopted.

const action = defineHttpAction({
  key: 'print-box',
  label: 'Print box label',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/print\/box\/[^/]+$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    await handleUnifiedPrintRequest(req, res, ctx, { labelTypeOverride: 'box' });
  },
  view: () => '<div class="card"><p class="muted">Print box API</p></div>'
});

export default action;
