import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { runChatFlow, loadChatModel } from '../agentic/flow/chat-flow';
import { FlowError } from '../agentic/flow/errors';
import { persistChatSessionSnapshot } from '../agentic/utils/json';
import { echoSqliteQuery } from '../agentic/tools/sqlite-echo';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const CHAT_SESSION_DIR = path.join(process.cwd(), 'data', 'chat-sessions');

const action = defineHttpAction({
  key: 'chat',
  label: 'Chat agent',
  appliesTo: () => false,
  matches: (pathName, method) => pathName === '/api/chat' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse) {
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
      }
    } catch (err) {
      console.error('[chat] Failed to read chat request body', err);
      return sendJson(res, 400, { error: 'invalid-body' });
    }

    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.error('[chat] Failed to parse chat request JSON', err);
      return sendJson(res, 400, { error: 'invalid-json' });
    }

    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages) {
      console.warn('[chat] Missing messages payload');
      return sendJson(res, 400, { error: 'missing-messages' });
    }

    try {
      const result = await runChatFlow(
        { messages },
        {
          logger: console,
          sqliteTool: echoSqliteQuery,
          loadChatModel,
          persistSession: (snapshot) => {
            // TODO(chat-storage): Replace JSON snapshot persistence once chat transcripts gain a dedicated store.
            const filePath = path.join(CHAT_SESSION_DIR, `${snapshot.id}.json`);
            persistChatSessionSnapshot(snapshot, filePath, console);
          }
        }
      );
      return sendJson(res, 200, { ok: true, result });
    } catch (err) {
      const flowError = err instanceof FlowError ? err : null;
      console.error('[chat] Chat flow failed', err);
      return sendJson(res, flowError?.statusCode ?? 500, {
        error: flowError?.code ?? 'chat-flow-failed',
        message: err instanceof Error ? err.message : 'chat-flow-failed'
      });
    }
  },
  view: () => '<div class="card"><p class="muted">Chat API</p></div>'
});

export default action;
