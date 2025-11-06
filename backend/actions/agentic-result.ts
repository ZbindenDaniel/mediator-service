import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { AgenticRequestContext } from '../../models';
import { AGENTIC_RUN_STATUS_FAILED, AGENTIC_RUN_STATUS_RUNNING } from '../../models';
import { recordAgenticRequestLogUpdate } from '../agentic';
import { handleAgenticResult, AgenticResultProcessingError } from '../agentic/result-handler';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'agentic-result',
  label: 'Agentic result webhook',
  appliesTo: () => false,
  matches: (path, method) => method === 'POST' && /^\/api\/agentic\/items\/[^/]+\/result$/.test(path),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const requestLogger = console;
    let requestContext: AgenticRequestContext | null = null;
    try {
      if (!req.url) return sendJson(res, 400, { error: 'Invalid request' });
      const match = req.url.match(/^\/api\/agentic\/items\/([^/]+)\/result$/);
      const itemId = match ? decodeURIComponent(match[1]) : '';
      if (!itemId) {
        console.warn('Agentic result missing item id');
        return sendJson(res, 400, { error: 'Invalid item id' });
      }

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload: any;
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch (err) {
        console.error('Failed to parse agentic payload', err);
        return sendJson(res, 400, { error: 'Invalid JSON payload' });
      }

      try {
        const result = handleAgenticResult({ itemId, payload }, { ctx, logger: requestLogger });
        requestContext = result.requestContext;
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        if (err instanceof AgenticResultProcessingError) {
          requestContext = err.requestContext;
          if (err.statusCode >= 500) {
            console.error('Agentic result processing failed', err);
          }
          return sendJson(res, err.statusCode, err.responseBody);
        }
        throw err;
      }
    } catch (err) {
      console.error('Agentic result handler failed', err);
      const failureMessage = err instanceof Error ? err.message : String(err);
      recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
        error: failureMessage,
        searchQuery: null,
        logger: requestLogger
      });
      return sendJson(res, 500, { error: 'Internal error' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic result endpoint</p></div>'
};

export default action;
