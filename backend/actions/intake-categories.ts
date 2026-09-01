import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireIntakeAuth } from '../utils/intake-auth';
import type { IntakeCategoryEntry } from '../../models/intake';
import { getItemCategories } from '../lib/taxonomy';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Selectable device categories for the intake TUI, derived from the taxonomy's
// `intakeEnabled` subcategories (ordered by `intakeSortOrder`). Hauptkategorien_A
// is the parent group; Unterkategorien_A identifies the quality contract. Only
// bootable devices are flagged intake-enabled in the taxonomy — monitors/external
// screens are intentionally excluded. Was a hardcoded list; now a projection of
// the runtime taxonomy so a deployment controls its intake set via data.
function buildIntakeCategories(): IntakeCategoryEntry[] {
  const entries: Array<IntakeCategoryEntry & { sortOrder: number }> = [];
  for (const category of getItemCategories()) {
    for (const sub of category.subcategories) {
      if (!sub.intakeEnabled) continue;
      entries.push({
        hauptkategorienA: sub.parentCode ?? category.code,
        unterkategorienA: sub.code,
        label: sub.intakeLabel ?? sub.labelExternal ?? sub.label,
        sortOrder: sub.intakeSortOrder ?? Number.MAX_SAFE_INTEGER
      });
    }
  }
  entries.sort((a, b) => a.sortOrder - b.sortOrder);
  return entries.map(({ sortOrder: _sortOrder, ...entry }) => entry);
}

const action = defineHttpAction({
  key: 'intake-categories',
  label: 'Intake categories',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Intake categories API</p></div>',
  matches: (p, method) => p === '/api/intake/categories' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireIntakeAuth(req, res)) return;
    sendJson(res, 200, { categories: buildIntakeCategories() });
  }
});

export default action;
