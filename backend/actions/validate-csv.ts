import type { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'csv-parse/sync';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function validateRow(row: Record<string, any>): string[] {
  const errors: string[] = [];
  if (!row.ItemUUID) errors.push('ItemUUID missing');
  if (!row.BoxID) errors.push('BoxID missing');
  return errors;
}

const action: Action = {
  key: 'validate-csv',
  label: 'Validate CSV',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/import/validate' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse) {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const records = parse(body, { columns: true, skip_empty_lines: true });
      const errors = records
        .map((row: any, idx: number) => ({ row: idx + 1, errors: validateRow(row) }))
        .filter((r: any) => r.errors.length);
      if (errors.length) return sendJson(res, 400, { ok: false, errors });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('CSV validation failed', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">CSV validation API</p></div>'
};

export default action;
