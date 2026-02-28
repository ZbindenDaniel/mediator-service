import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { IncomingMessage, ServerResponse } from 'http';
import { ERP_MEDIA_MIRROR_DIR } from '../config';
import { MEDIA_DIR } from '../lib/media';
import { mirrorDirectoryTree } from '../lib/mediaMirror';
import { stageItemsExport, type ItemsExportArtifact } from './export-items';
import { defineHttpAction } from './index';
import { ERP_MEDIA_MIRROR_DIR, ERP_MEDIA_MIRROR_ENABLED } from '../config';
import { MEDIA_DIR } from '../lib/media';

// TODO(sync-erp): Extend script result parsing when docs/erp-sync.sh begins emitting structured machine-readable status fields.
// TODO(sync-erp-media-mirror): Add targeted tests for media mirror failure handling inside ERP sync flow.
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


function resolveErpMediaMirrorTargetPath(): string {
  const configured = ERP_MEDIA_MIRROR_DIR.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }

  const mediaBaseName = path.basename(MEDIA_DIR);
  const mediaParent = path.dirname(MEDIA_DIR);
  if (mediaBaseName === 'shopbilder') {
    return path.join(mediaParent, 'shopbilder-import');
  }

  return path.join(mediaParent, `${mediaBaseName}-import`);
}

interface ScriptExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface MediaCopyMarker {
  status: 'success' | 'failed' | 'skipped' | 'unknown';
  detail: string | null;
}

async function runErpSyncScript(
  scriptPath: string,
  csvPath: string,
  mediaMirrorDir: string | null,
  mediaSourceDir: string
): Promise<ScriptExecutionResult> {
  return new Promise<ScriptExecutionResult>((resolve, reject) => {
    const proc = spawn('bash', [scriptPath, csvPath], {
      env: mediaMirrorDir
        ? { ...process.env, ERP_MEDIA_MIRROR_DIR: mediaMirrorDir, ERP_MEDIA_SOURCE_DIR: mediaSourceDir }
        : { ...process.env, ERP_MEDIA_SOURCE_DIR: mediaSourceDir },
      stdio: ['ignore', 'pipe', 'pipe']
    });

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

// TODO(sync-erp-media-mirror-runtime): Add filesystem readiness checks for mirror destination once script-side mirroring is reintroduced.
function logMediaMirrorRuntime(logger: Pick<Console, 'info'>): void {
  logger.info('[sync-erp] media_mirroring_runtime', {
    enabled: ERP_MEDIA_MIRROR_ENABLED,
    destination: ERP_MEDIA_MIRROR_DIR || null
  });
}



// TODO(sync-erp-media-marker): Switch this parser to machine-readable JSON if docs/erp-sync.sh emits JSON markers in future.
function parseMediaCopyMarker(output: string): MediaCopyMarker {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const mediaLine = lines.find((line) => line.startsWith('[erp-sync] media_copy_result'));
  if (!mediaLine) {
    return { status: 'unknown', detail: null };
  }

  if (mediaLine.includes('status=success')) {
    return { status: 'success', detail: mediaLine };
  }

  if (mediaLine.includes('status=failed')) {
    return { status: 'failed', detail: mediaLine };
  }

  if (mediaLine.includes('status=skipped')) {
    return { status: 'skipped', detail: mediaLine };
  }

  return { status: 'unknown', detail: mediaLine };
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
      logMediaMirrorRuntime(console);
      console.info('[sync-erp] media_copy_expectation', {
        expected: ERP_MEDIA_MIRROR_ENABLED ? 'enabled' : 'disabled',
        destination: ERP_MEDIA_MIRROR_DIR || null,
        source: MEDIA_DIR
      });

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

      const mediaMirrorSource = MEDIA_DIR;
      const mediaMirrorDestination = resolveErpMediaMirrorTargetPath();
      try {
        if (!fs.existsSync(mediaMirrorSource)) {
          console.warn('[sync-erp] media_mirror_source_missing', {
            source: mediaMirrorSource,
            destination: mediaMirrorDestination
          });
        } else {
          console.info('[sync-erp] media_mirror_started', {
            source: mediaMirrorSource,
            destination: mediaMirrorDestination
          });
          const mirrorResult = await mirrorDirectoryTree(mediaMirrorSource, mediaMirrorDestination);
          console.info('[sync-erp] media_mirror_finished', {
            source: mediaMirrorSource,
            destination: mediaMirrorDestination,
            copiedFileCount: mirrorResult.copiedFileCount,
            ensuredDirectoryCount: mirrorResult.ensuredDirectoryCount
          });
        }
      } catch (error) {
        console.error('[sync-erp] media_mirror_failed', {
          source: mediaMirrorSource,
          destination: mediaMirrorDestination,
          message: error instanceof Error ? error.message : String(error),
          error
        });
        throw new Error('Media mirror failed before ERP import execution.');
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
      // TODO(sync-erp-media-mirror-script): Keep export staging CSV-only; shell script owns optional media mirroring via ERP_MEDIA_MIRROR_DIR.
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
      const scriptResult = await runErpSyncScript(
        scriptPath,
        stagedExport.itemsPath,
        ERP_MEDIA_MIRROR_ENABLED ? ERP_MEDIA_MIRROR_DIR : null,
        MEDIA_DIR
      );
      const mediaCopyMarker = parseMediaCopyMarker(`${scriptResult.stdout}\n${scriptResult.stderr}`);
      console.info('[sync-erp] script_finished', {
        exitCode: scriptResult.exitCode,
        mediaCopyStatus: mediaCopyMarker.status,
        mediaCopyDetail: mediaCopyMarker.detail
      });

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
