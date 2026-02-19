import path from 'path';
import { spawn } from 'child_process';
import type { IncomingMessage, ServerResponse } from 'http';
import { stageItemsExport, type ItemsExportArtifact } from './export-items';
import { defineHttpAction } from './index';

// TODO(sync-erp): Extend script result parsing when docs/erp-sync.sh begins emitting structured machine-readable status fields.
// TODO(sync-erp): Keep this action script-parity only unless an explicit future requirement reintroduces API-side continuation orchestration.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function parseItemIds(payload: unknown): string[] {
  const itemIds = (payload as { itemIds?: unknown })?.itemIds;
  if (!Array.isArray(itemIds)) {
    throw new Error('itemIds must be an array');
  }

  const normalized = itemIds
    .filter((itemId): itemId is string => typeof itemId === 'string')
    .map((itemId) => itemId.trim())
    .filter(Boolean);

  if (normalized.length === 0 || normalized.length !== itemIds.length) {
    throw new Error('itemIds must be a non-empty array of non-empty strings');
  }

  return Array.from(new Set(normalized));
}

interface ScriptExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runErpSyncScript(scriptPath: string, csvPath: string): Promise<ScriptExecutionResult> {
  return new Promise<ScriptExecutionResult>((resolve, reject) => {
    const proc = spawn('bash', [scriptPath, csvPath], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);

    proc.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

function resolveErpSyncScriptPath(logger: Pick<Console, 'info' | 'warn'>): string {
  const scriptPath = path.resolve(process.cwd(), 'docs/erp-sync.sh');
  logger.info('[sync-erp] script_path_resolved', { scriptPath });
  return scriptPath;
}

const action = defineHttpAction({
  key: 'sync-erp',
  label: 'Sync ERP',
  appliesTo: () => false,
  matches: (requestPath, method) => requestPath === '/api/sync/erp' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    let stagedExport: ItemsExportArtifact | null = null;

    try {
      console.info('[sync-erp] request_received');

      let payload: unknown;
      try {
        payload = await readJsonBody(req);
      } catch (error) {
        console.error('[sync-erp] request_received parse_failed', { error });
        return sendJson(res, 400, {
          ok: false,
          phase: 'request_received',
          error: 'Invalid JSON payload.'
        });
      }

      let itemIds: string[];
      try {
        itemIds = parseItemIds(payload);
      } catch (error) {
        return sendJson(res, 400, {
          ok: false,
          phase: 'request_received',
          error: error instanceof Error ? error.message : 'Invalid itemIds payload.'
        });
      }

      const items = ctx.listItemsForExport.all({
        createdAfter: null,
        updatedAfter: null,
        itemIds
      });

      if (!Array.isArray(items) || items.length === 0) {
        return sendJson(res, 404, {
          ok: false,
          phase: 'export_staged',
          error: 'No matching items found for provided itemIds.'
        });
      }

      const boxes = typeof ctx.listBoxes?.all === 'function' ? ctx.listBoxes.all() : [];
      stagedExport = await stageItemsExport({
        archiveBaseName: `erp-sync-${Date.now()}`,
        boxes: Array.isArray(boxes) ? boxes : [],
        exportMode: 'automatic_import',
        includeMedia: false,
        items,
        logger: console
      });

      console.info('[sync-erp] export_staged', {
        csvPath: stagedExport.itemsPath,
        itemCount: items.length
      });

      const scriptPath = resolveErpSyncScriptPath(console);
      console.info('[sync-erp] script_started', { scriptPath });
      const scriptResult = await runErpSyncScript(scriptPath, stagedExport.itemsPath);
      console.info('[sync-erp] script_finished', { exitCode: scriptResult.exitCode });

      if (scriptResult.exitCode === 0) {
        return sendJson(res, 200, {
          ok: true,
          phase: 'script_finished',
          exitCode: scriptResult.exitCode,
          stdout: scriptResult.stdout,
          stderr: scriptResult.stderr
        });
      }

      return sendJson(res, 502, {
        ok: false,
        phase: 'script_finished',
        exitCode: scriptResult.exitCode,
        stdout: scriptResult.stdout,
        stderr: scriptResult.stderr,
        error: 'ERP sync script exited with a non-zero code.'
      });
    } catch (error) {
      console.error('[sync-erp] script_finished runtime_exception', { error });
      return sendJson(res, 500, {
        ok: false,
        phase: 'script_finished',
        error: error instanceof Error ? error.message : 'Unexpected runtime error during ERP sync.'
      });
    } finally {
      if (stagedExport) {
        try {
          await stagedExport.cleanup();
        } catch (error) {
          console.warn('[sync-erp] cleanup_failed', { error });
        }
      }
      console.info('[sync-erp] cleanup_done');
    }
  },
  view: () => '<div class="card"><p class="muted">ERP sync</p></div>'
});

export default action;
