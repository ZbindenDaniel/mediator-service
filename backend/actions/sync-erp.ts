import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import type { IncomingMessage, ServerResponse } from 'http';
import { stageItemsExport, type ItemsExportArtifact } from './export-items';
import { defineHttpAction } from './index';
import { ERP_MEDIA_MIRROR_DIR, ERP_MEDIA_MIRROR_ENABLED, LOCAL_MEDIA_DIR } from '../config';
import { formatArtikelNummerForMedia, resolveMediaFolder } from '../lib/media';
import { emitMediaAudit } from '../lib/media-audit';
import { resolvePathWithinRoot } from '../lib/path-guard';

// TODO(sync-erp): Extend script result parsing when backend/scripts/erp-sync.sh begins emitting structured machine-readable status fields.
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

function parsePipeDelimitedMediaEntries(rawValue: string): string[] {
  return rawValue
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const ERP_MEDIA_SOURCE_ROOT = LOCAL_MEDIA_DIR;

type ExplicitMediaEntryNormalization =
  | { kind: 'filename-only'; value: string }
  | { kind: 'legacy-path'; value: string }
  | { kind: 'invalid'; reason: string };

function normalizeExplicitMediaEntry(rawEntry: string): ExplicitMediaEntryNormalization {
  const normalized = rawEntry.replace(/\\/g, '/').trim();
  if (!normalized) {
    return { kind: 'invalid', reason: 'empty-entry' };
  }

  if (!normalized.includes('/')) {
    const fileName = path.posix.basename(normalized);
    if (!fileName || fileName === '.' || fileName === '..') {
      return { kind: 'invalid', reason: 'invalid-filename-entry' };
    }
    return { kind: 'filename-only', value: fileName };
  }

  const withoutPrefix = normalized.startsWith('/media/')
    ? normalized.slice('/media/'.length)
    : normalized.replace(/^\/+/, '');

  const relative = path.posix.normalize(withoutPrefix);
  if (!relative || relative === '.' || relative.startsWith('..') || path.posix.isAbsolute(relative)) {
    return { kind: 'invalid', reason: 'invalid-legacy-path-entry' };
  }

  return { kind: 'legacy-path', value: relative };
}

interface MirrorMediaCandidateItem {
  ItemUUID?: string | null;
  Artikel_Nummer?: string | null;
  Grafikname?: string | null;
  ImageNames?: string | null;
}

export function resolveExplicitMediaMirrorSources(
  items: MirrorMediaCandidateItem[],
  logger: Pick<Console, 'warn' | 'info' | 'error'> = console
): string[] {
  const resolved = new Set<string>();

  for (const item of items) {
    const fromImageNames = typeof item.ImageNames === 'string' ? item.ImageNames.trim() : '';
    const fromGrafikname = typeof item.Grafikname === 'string' ? item.Grafikname.trim() : '';
    const rawEntries = fromImageNames
      ? parsePipeDelimitedMediaEntries(fromImageNames)
      : fromGrafikname
        ? parsePipeDelimitedMediaEntries(fromGrafikname)
        : [];

    for (const rawEntry of rawEntries) {
      const normalizedEntry = normalizeExplicitMediaEntry(rawEntry);
      if (normalizedEntry.kind === 'invalid') {
        logger.warn('[sync-erp] media_entry_invalid_skipped', {
          itemId: item.ItemUUID ?? null,
          artikelNummer: item.Artikel_Nummer ?? null,
          entry: rawEntry,
          reason: normalizedEntry.reason
        });
        emitMediaAudit({
          action: 'mirror-skip',
          scope: 'erp-sync',
          identifier: { artikelNummer: item.Artikel_Nummer ?? null, itemUUID: item.ItemUUID ?? null },
          path: rawEntry,
          root: ERP_MEDIA_SOURCE_ROOT,
          outcome: 'blocked',
          reason: 'invalid-media-entry',
        });
        continue;
      }

      let relativeEntry = normalizedEntry.value;
      if (normalizedEntry.kind === 'filename-only') {
        const mediaFolder = resolveMediaFolder(item.ItemUUID ?? 'unknown-item', item.Artikel_Nummer, logger);
        relativeEntry = path.posix.join(mediaFolder.replace(/\\/g, '/'), normalizedEntry.value);
        logger.info('[sync-erp] media_entry_filename_resolved', {
          itemId: item.ItemUUID ?? null,
          artikelNummer: item.Artikel_Nummer ?? null,
          entry: rawEntry,
          resolvedRelativePath: relativeEntry
        });
      } else {
        logger.info('[sync-erp] media_entry_legacy_path_resolved', {
          itemId: item.ItemUUID ?? null,
          artikelNummer: item.Artikel_Nummer ?? null,
          entry: rawEntry,
          resolvedRelativePath: relativeEntry
        });
      }

      let absolutePath: string | null = null;
      try {
        absolutePath = resolvePathWithinRoot(ERP_MEDIA_SOURCE_ROOT, relativeEntry, {
          logger,
          operation: 'sync-erp:explicit-media-path'
        });
      } catch (error) {
        logger.warn('[sync-erp] media_entry_probe_failed', {
          itemId: item.ItemUUID ?? null,
          artikelNummer: item.Artikel_Nummer ?? null,
          entry: rawEntry,
          resolvedRelativePath: relativeEntry,
          reason: 'path-resolution-threw',
          error
        });
      }

      if (!absolutePath) {
        logger.warn('[sync-erp] media_entry_blocked_skipped', {
          itemId: item.ItemUUID ?? null,
          artikelNummer: item.Artikel_Nummer ?? null,
          entry: rawEntry,
          resolvedRelativePath: relativeEntry,
          reason: 'outside-source-root'
        });
        emitMediaAudit({
          action: 'mirror-skip',
          scope: 'erp-sync',
          identifier: { artikelNummer: item.Artikel_Nummer ?? null, itemUUID: item.ItemUUID ?? null },
          path: relativeEntry,
          root: ERP_MEDIA_SOURCE_ROOT,
          outcome: 'blocked',
          reason: 'media-path-outside-root',
        });
        continue;
      }

      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(absolutePath);
      } catch (error) {
        logger.warn('[sync-erp] media_entry_missing_skipped', {
          itemId: item.ItemUUID ?? null,
          artikelNummer: item.Artikel_Nummer ?? null,
          entry: rawEntry,
          resolvedPath: absolutePath,
          reason: 'missing-or-inaccessible-file',
          error
        });
        emitMediaAudit({
          action: 'mirror-skip',
          scope: 'erp-sync',
          identifier: { artikelNummer: item.Artikel_Nummer ?? null, itemUUID: item.ItemUUID ?? null },
          path: absolutePath,
          root: ERP_MEDIA_SOURCE_ROOT,
          outcome: 'skipped',
          reason: 'media-file-missing',
          error: error instanceof Error ? error.message : String(error)
        });
        continue;
      }

      if (!stat.isFile()) {
        logger.warn('[sync-erp] media_entry_not_file_skipped', {
          itemId: item.ItemUUID ?? null,
          artikelNummer: item.Artikel_Nummer ?? null,
          entry: rawEntry,
          resolvedPath: absolutePath
        });
        emitMediaAudit({
          action: 'mirror-skip',
          scope: 'erp-sync',
          identifier: { artikelNummer: item.Artikel_Nummer ?? null, itemUUID: item.ItemUUID ?? null },
          path: absolutePath,
          root: ERP_MEDIA_SOURCE_ROOT,
          outcome: 'blocked',
          reason: 'media-path-not-file',
        });
        continue;
      }

      resolved.add(absolutePath);
    }
  }

  return Array.from(resolved);
}

export function resolveArtikelNummerMirrorScope(
  items: Array<{ ItemUUID?: string | null; Artikel_Nummer?: string | null }>,
  logger: Pick<Console, 'warn' | 'info' | 'error'> = console
): string[] {
  const resolved = new Set<string>();

  for (const item of items) {
    const formatted = formatArtikelNummerForMedia(item.Artikel_Nummer, logger);
    if (!formatted) {
      logger.warn('[sync-erp] artikelnummer_missing_for_media_scope', {
        itemId: item.ItemUUID ?? null
      });
      continue;
    }

    if (formatted.includes('/') || formatted.includes('\\') || formatted === '.' || formatted === '..') {
      logger.warn('[sync-erp] artikelnummer_invalid_for_media_scope', {
        itemId: item.ItemUUID ?? null,
        artikelNummer: formatted
      });
      continue;
    }

    resolved.add(formatted);
  }

  return Array.from(resolved);
}

interface ScriptExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface MediaCopyMarker {
  status: 'success' | 'failed' | 'skipped' | 'unknown';
  detail: string | null;
}

function deriveLastObservedPhase(output: string): string | null {
  let lastObservedPhase: string | null = null;
  const lines = output.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    try {
      if (line.includes('media_copy_result')) {
        lastObservedPhase = 'media_copy_result';
        continue;
      }

      if (line.includes('media_copy_discovery')) {
        lastObservedPhase = 'media_copy_discovery';
        continue;
      }

      if (line.includes('phase=import')) {
        lastObservedPhase = 'import';
        continue;
      }

      if (line.includes('phase=test')) {
        lastObservedPhase = 'test';
      }
    } catch (error) {
      console.warn('[sync-erp] phase_parse_failed', { error, line });
    }
  }

  return lastObservedPhase;
}

export function buildErpSyncScriptEnv(
  mediaSourceFiles: string[],
  mediaMirrorDir: string | null,
  mediaSourceDir: string
): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ERP_MEDIA_SOURCE_DIR: mediaSourceDir,
    // Contract: ERP_SYNC_ITEM_IDS is newline-delimited; entries may contain commas (e.g. GVFS/WebDAV paths).
    ERP_SYNC_ITEM_IDS: mediaSourceFiles.join('\n')
  };

  if (mediaMirrorDir) {
    childEnv.ERP_MEDIA_MIRROR_DIR = mediaMirrorDir;
  } else {
    delete childEnv.ERP_MEDIA_MIRROR_DIR;
  }

  return childEnv;
}

async function runErpSyncScript(
  scriptPath: string,
  csvPath: string,
  mediaSourceFiles: string[],
  mediaMirrorDir: string | null,
  mediaSourceDir: string,
  timeoutMs: number
): Promise<ScriptExecutionResult> {
  return new Promise<ScriptExecutionResult>((resolve, reject) => {
    let childEnv: NodeJS.ProcessEnv;
    try {
      childEnv = buildErpSyncScriptEnv(mediaSourceFiles, mediaMirrorDir, mediaSourceDir);
    } catch (error) {
      console.error('[sync-erp] script_env_prepare_failed', {
        error,
        mediaMirrorDir,
        mediaSourceDir
      });
      reject(error);
      return;
    }

    const proc = spawn('bash', [scriptPath, csvPath], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let timedOut = false;
    let lastObservedPhase: string | null = null;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      console.error('[sync-erp] script_timeout', { timeoutMs, scriptPath, lastObservedPhase });
      proc.kill('SIGTERM');
    }, timeoutMs);

    const flushBufferedLines = (
      buffered: string,
      logger: Pick<Console, 'info' | 'error'>,
      level: 'info' | 'error',
      tag: '[sync-erp] script_stdout' | '[sync-erp] script_stderr'
    ): string => {
      const normalized = buffered.replace(/\r\n|\r/g, '\n');
      const parts = normalized.split('\n');
      const trailing = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const parsedPhase = deriveLastObservedPhase(trimmed);
          if (parsedPhase) {
            lastObservedPhase = parsedPhase;
          }
        } catch (error) {
          console.warn('[sync-erp] phase_parse_failed', { error, line: trimmed });
        }

        logger[level](tag, { line: trimmed });
      }

      return trailing;
    };

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      stdoutBuffer = flushBufferedLines(stdoutBuffer, console, 'info', '[sync-erp] script_stdout');
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      stderrBuffer += text;
      stderrBuffer = flushBufferedLines(stderrBuffer, console, 'error', '[sync-erp] script_stderr');
    });

    proc.on('error', (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    proc.on('close', (exitCode) => {
      clearTimeout(timeoutHandle);
      const pendingStdout = stdoutBuffer.trim();
      if (pendingStdout) {
        console.info('[sync-erp] script_stdout', { line: pendingStdout });
      }
      const pendingStderr = stderrBuffer.trim();
      if (pendingStderr) {
        console.error('[sync-erp] script_stderr', { line: pendingStderr });
      }
      resolve({
        exitCode: exitCode ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut
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



// TODO(sync-erp-media-marker): Switch this parser to machine-readable JSON if backend/scripts/erp-sync.sh emits JSON markers in future.
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

const ERP_SYNC_SCRIPT_DEFAULT_RELATIVE_PATH = 'backend/scripts/erp-sync.sh';

export function resolveErpSyncScriptPath(
  logger: Pick<Console, 'info'>
): { scriptPath: string; defaultPath: string; overridePath: string | null; cwd: string } {
  const cwd = process.cwd();
  const defaultPath = path.resolve(cwd, ERP_SYNC_SCRIPT_DEFAULT_RELATIVE_PATH);
  const overridePath = process.env.ERP_SYNC_SCRIPT_PATH?.trim() || null;
  const scriptPath = overridePath
    ? (path.isAbsolute(overridePath) ? overridePath : path.resolve(cwd, overridePath))
    : defaultPath;

  logger.info('[sync-erp] script_path_resolved', {
    cwd,
    defaultPath,
    overridePath,
    scriptPath,
  });

  return { scriptPath, defaultPath, overridePath, cwd };
}

export function validateErpSyncScriptPath(
  scriptPath: string,
  logger: Pick<Console, 'error'>,
  diagnostics: { cwd: string; defaultPath: string; overridePath: string | null }
): string | null {
  try {
    const scriptStat = fs.statSync(scriptPath);
    if (!scriptStat.isFile()) {
      logger.error('[sync-erp] script_preflight_not_file', {
        ...diagnostics,
        scriptPath,
      });
      return 'ERP sync script path is invalid. Expected a regular file.';
    }
  } catch (error) {
    logger.error('[sync-erp] script_preflight_stat_failed', {
      ...diagnostics,
      scriptPath,
      error,
    });
    return 'ERP sync script is missing or not accessible.';
  }

  return null;
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
        source: ERP_MEDIA_SOURCE_ROOT
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
      const scopedArtikelNummern = resolveArtikelNummerMirrorScope(items, console);
      const explicitMediaSources = resolveExplicitMediaMirrorSources(items, console);
      console.info('[sync-erp] script_item_scope', {
        requestedInstanceCount: itemIds.length,
        resolvedArtikelCount: scopedArtikelNummern.length,
        resolvedMediaSourceCount: explicitMediaSources.length
      });

      if (scopedArtikelNummern.length === 0) {
        emitMediaAudit({
          action: 'mirror-skip',
          scope: 'erp-sync',
          identifier: { artikelNummer: null, itemUUID: itemIds.join(',') || null },
          path: null,
          root: ERP_MEDIA_SOURCE_ROOT,
          outcome: 'blocked',
          reason: 'no-artikelnummer-scope',
        });
        return sendJson(res, 422, {
          ok: false,
          phase: 'export_staged',
          error: 'No Artikelnummer values resolved for media mirroring scope.'
        });
      }

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

      let scriptPath: string;
      try {
        const scriptResolution = resolveErpSyncScriptPath(console);
        scriptPath = scriptResolution.scriptPath;
        const preflightError = validateErpSyncScriptPath(scriptPath, console, {
          cwd: scriptResolution.cwd,
          defaultPath: scriptResolution.defaultPath,
          overridePath: scriptResolution.overridePath,
        });
        if (preflightError) {
          return sendJson(res, 500, {
            ok: false,
            phase: 'script_started',
            error: preflightError,
          });
        }
      } catch (error) {
        console.error('[sync-erp] script_preflight_failed', { error });
        return sendJson(res, 500, {
          ok: false,
          phase: 'script_started',
          error: 'Unexpected runtime error while preparing ERP sync script execution.',
        });
      }

      const scriptTimeoutMs = Number.parseInt(process.env.ERP_SYNC_SCRIPT_TIMEOUT_MS || '300000', 10);
      const normalizedScriptTimeoutMs = Number.isFinite(scriptTimeoutMs) && scriptTimeoutMs > 0 ? scriptTimeoutMs : 300000;
      console.info('[sync-erp] script_started', { scriptPath, timeoutMs: normalizedScriptTimeoutMs });
      emitMediaAudit({
        action: ERP_MEDIA_MIRROR_ENABLED ? 'mirror-copy' : 'mirror-skip',
        scope: 'erp-sync',
        identifier: { artikelNummer: scopedArtikelNummern.join(','), itemUUID: itemIds.join(',') },
        path: ERP_MEDIA_MIRROR_DIR || null,
        root: ERP_MEDIA_SOURCE_ROOT,
        outcome: 'start',
        reason: ERP_MEDIA_MIRROR_ENABLED ? 'script-start' : 'mirror-disabled',
      });
      const scriptResult = await runErpSyncScript(
        scriptPath,
        stagedExport.itemsPath,
        explicitMediaSources,
        ERP_MEDIA_MIRROR_ENABLED ? ERP_MEDIA_MIRROR_DIR : null,
        ERP_MEDIA_SOURCE_ROOT,
        normalizedScriptTimeoutMs
      );
      let mediaCopyMarker: MediaCopyMarker = { status: 'unknown', detail: null };
      let mediaCopyMarkerPhase = 'script_finished';
      let lastObservedPhase: string | null = null;
      try {
        mediaCopyMarker = parseMediaCopyMarker(`${scriptResult.stdout}\n${scriptResult.stderr}`);
      } catch (error) {
        mediaCopyMarkerPhase = 'unknown';
        console.error('[sync-erp] media_copy_marker_parse_failed', {
          phase: mediaCopyMarkerPhase,
          error
        });
      }

      try {
        lastObservedPhase = deriveLastObservedPhase(`${scriptResult.stdout}\n${scriptResult.stderr}`);
      } catch (error) {
        console.warn('[sync-erp] phase_parse_failed', { error });
      }

      console.info('[sync-erp] script_finished', {
        exitCode: scriptResult.exitCode,
        timedOut: scriptResult.timedOut,
        lastObservedPhase,
        mediaCopyStatus: mediaCopyMarker.status,
        mediaCopyDetail: mediaCopyMarker.detail,
        mediaCopyPhase: mediaCopyMarkerPhase
      });
      emitMediaAudit({
        action: mediaCopyMarker.status === 'skipped' || !ERP_MEDIA_MIRROR_ENABLED ? 'mirror-skip' : 'mirror-copy',
        scope: 'erp-sync',
        identifier: { artikelNummer: scopedArtikelNummern.join(','), itemUUID: itemIds.join(',') },
        path: ERP_MEDIA_MIRROR_DIR || null,
        root: ERP_MEDIA_SOURCE_ROOT,
        outcome:
          scriptResult.exitCode === 0
            ? mediaCopyMarker.status === 'failed'
              ? 'error'
              : mediaCopyMarker.status === 'skipped'
                ? 'skipped'
                : 'success'
            : 'error',
        reason: mediaCopyMarker.detail,
        error: scriptResult.exitCode === 0 ? null : scriptResult.stderr || 'script-exit-non-zero',
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
        timedOut: scriptResult.timedOut,
        stdout: scriptResult.stdout,
        stderr: scriptResult.stderr,
        error: scriptResult.timedOut
          ? 'ERP sync script exceeded execution timeout and was terminated.'
          : 'ERP sync script exited with a non-zero code.'
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
