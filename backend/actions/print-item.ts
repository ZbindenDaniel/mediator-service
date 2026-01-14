import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { handleUnifiedPrintRequest } from './print-unified';
// TODO(agent): Replace legacy Langtext print fallback once structured payload rendering lands.
// TODO(agent): Document HTML print artifacts so support can trace failures quickly.
// TODO(agent): Monitor ignored template query logs while the 29x90 item label remains fixed.
import type { Item } from '../../models';
import type { ItemLabelPayload } from '../lib/labelHtml';
import { resolvePrinterQueue } from '../print';
import type { PrintFileResult } from '../print';
// TODO(agent): Confirm shared category lookup relocation covers all backend label consumers.
import { buildItemCategoryLookups } from '../../models/item-category-lookups';

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
