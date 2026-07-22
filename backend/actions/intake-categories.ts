import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireIntakeAuth } from '../utils/intake-auth';
import type { IntakeCategoryEntry } from '../../models/intake';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Selectable device categories for the intake TUI.
// Hauptkategorien_A is the top-level group; Unterkategorien_A identifies the quality contract.
// Only bootable devices belong here: the intake station is a netboot TUI, so a device must be
// able to boot the image to reach this step. Monitors/external screens are intentionally excluded.
// Hauptkategorien_A codes follow the canonical taxonomy in models/item-categories.ts (10/20/…),
// not the legacy 1/2/… shorthand — keep them in sync.
const INTAKE_CATEGORIES: IntakeCategoryEntry[] = [
  { hauptkategorienA: 20, unterkategorienA: 201, label: 'Laptop' },
  { hauptkategorienA: 10, unterkategorienA: 102, label: 'Desktop-PC' },
  { hauptkategorienA: 10, unterkategorienA: 103, label: 'Server' },
  { hauptkategorienA: 10, unterkategorienA: 302, label: 'All-in-One' },
  { hauptkategorienA: 20, unterkategorienA: 204, label: 'Tablet' },
];

const action = defineHttpAction({
  key: 'intake-categories',
  label: 'Intake categories',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Intake categories API</p></div>',
  matches: (p, method) => p === '/api/intake/categories' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireIntakeAuth(req, res)) return;
    sendJson(res, 200, { categories: INTAKE_CATEGORIES });
  }
});

export default action;
