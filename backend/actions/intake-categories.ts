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
const INTAKE_CATEGORIES: IntakeCategoryEntry[] = [
  { hauptkategorienA: 2, unterkategorienA: 201, label: 'Laptop' },
  { hauptkategorienA: 1, unterkategorienA: 102, label: 'Desktop-PC' },
  { hauptkategorienA: 1, unterkategorienA: 103, label: 'Server' },
  { hauptkategorienA: 3, unterkategorienA: 301, label: 'Monitor' },
  { hauptkategorienA: 3, unterkategorienA: 302, label: 'All-in-One' },
  { hauptkategorienA: 2, unterkategorienA: 204, label: 'Tablet' },
  { hauptkategorienA: 4, unterkategorienA: 401, label: 'Bildschirm (extern)' },
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
