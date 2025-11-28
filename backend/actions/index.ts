import fs from 'fs';
import path from 'path';
import { Entity } from '../../models';
import type { IncomingMessage, ServerResponse } from 'http';

export interface Action {
  key: string;
  label: string;
  appliesTo: (entity: Entity) => boolean;
  view: (entity: Entity) => string;
  matches?: (path: string, method: string) => boolean;
  handle?: (req: IncomingMessage, res: ServerResponse, ctx: any) => Promise<void> | void;
}

export interface HttpAction extends Omit<Action, 'matches' | 'handle'> {
  matches: (path: string, method: string) => boolean;
  handle: (req: IncomingMessage, res: ServerResponse, ctx: any) => Promise<void> | void;
}

export function defineHttpAction<TAction extends HttpAction>(action: TAction): TAction {
  return action;
}

function normalizeAction(mod: any, filename: string): Action {
  const a = (mod && typeof mod === 'object') ? mod : {};
  const key = typeof a.key === 'string' ? a.key : path.basename(filename, path.extname(filename));
  const label = typeof a.label === 'string' ? a.label : key;
  const appliesTo = typeof a.appliesTo === 'function' ? a.appliesTo : () => true;
  const view = typeof a.view === 'function'
    ? a.view
    : (entity: Entity) => `<div class="card"><h3>${label}</h3><p class="muted">No view implemented for ${key}.</p></div>`;
  const matches = typeof a.matches === 'function' ? a.matches : () => false;
  const handle = typeof a.handle === 'function' ? a.handle : async () => {};
  return { key, label, appliesTo, view, matches, handle };
}

export function loadActions(): Action[] {
  const dir = __dirname;
  // TODO(chat-backend): Register the chatFlow HTTP action (dry-run SQLite agent) here once chat session storage and SQLite-tool adapters are ready (see docs/chat-agent-plan.md).
  return fs.readdirSync(dir)
    .filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.startsWith('index.'))
    .map(f => {
      const full = path.join(dir, f);
      try {
        const mod = require(full);
        return normalizeAction(mod.default ?? mod, f);
      } catch (e) {
        console.error('Failed to load action', f, e);
        return normalizeAction({
          key: path.basename(f, path.extname(f)),
          label: `Broken: ${f}`,
          view: () => `<div class="card"><h3>${f}</h3><p class="muted">Failed to load.</p></div>`
        }, f);
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export default { loadActions };

export { default as bulkMoveItemsAction } from './bulk-move-items';
export { default as bulkDeleteItemsAction } from './bulk-delete-items';
