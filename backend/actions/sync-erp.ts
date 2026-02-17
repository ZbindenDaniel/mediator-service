import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  ERP_IMPORT_FORM_FIELD,
  ERP_IMPORT_AUTH_FIELD_PREFIX,
  ERP_IMPORT_CLIENT_ID,
  ERP_IMPORT_FORM_CHARSET,
  ERP_IMPORT_FORM_DEFAULT_BOOKING_GROUP,
  ERP_IMPORT_FORM_DEFAULT_UNIT,
  ERP_IMPORT_FORM_PART_CLASSIFICATION,
  ERP_IMPORT_FORM_SEPARATOR,
  ERP_IMPORT_INCLUDE_MEDIA,
  ERP_SYNC_ENABLED,
  ERP_IMPORT_PASSWORD,
  ERP_IMPORT_TIMEOUT_MS,
  ERP_IMPORT_POLL_INTERVAL_MS,
  ERP_IMPORT_POLL_TIMEOUT_MS,
  ERP_IMPORT_URL,
  ERP_IMPORT_USERNAME
} from '../config';
import { ItemsExportArtifact, stageItemsExport } from './export-items';
import { defineHttpAction } from './index';

// TODO(agent): Capture ERP sync response metadata (job IDs) once the upstream API returns them.
// TODO(agent): Consolidate ERP import HTTP client with shared networking utilities once available.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
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

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Invalid JSON payload');
  }
}

function normalizeItemIds(rawItemIds: unknown): string[] {
  if (!Array.isArray(rawItemIds)) {
    return [];
  }
  const normalized: string[] = [];
  for (const candidate of rawItemIds) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    if (!normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }
  return normalized;
}

type ErpImportValue = string | number;

interface ErpImportFieldMap {
  action: string;
  actionTest: string;
  actionImport: string;
  escapeChar: string;
  profileType: string;
  quoteChar: string;
  separator: string;
  applyBookingGroup: string;
  articleNumberPolicy: string;
  charset: string;
  defaultBookingGroup: string;
  duplicates: string;
  numberFormat: string;
  partType: string;
  sellPriceAdjustment: string;
  sellPriceAdjustmentType: string;
  sellPricePlaces: number;
  shopArticleIfMissing: number;
  partClassification: string;
  defaultUnit: string;
}

const ERP_IMPORT_FIELD_NAMES = {
  action: 'action',
  actionTest: 'action_test',
  actionImport: 'action_import',
  escapeChar: 'escape_char',
  profileType: 'profile.type',
  quoteChar: 'quote_char',
  separator: 'sep_char',
  applyBookingGroup: 'settings.apply_buchungsgruppe',
  articleNumberPolicy: 'settings.article_number_policy',
  charset: 'settings.charset',
  defaultBookingGroup: 'settings.default_buchungsgruppe',
  duplicates: 'settings.duplicates',
  numberFormat: 'settings.numberformat',
  partType: 'settings.part_type',
  sellPriceAdjustment: 'settings.sellprice_adjustment',
  sellPriceAdjustmentType: 'settings.sellprice_adjustment_type',
  sellPricePlaces: 'settings.sellprice_places',
  shopArticleIfMissing: 'settings.shoparticle_if_missing',
  partClassification: 'settings.part_classification',
  defaultUnit: 'settings.default_unit'
} as const satisfies Record<keyof ErpImportFieldMap, string>;

// TODO(agent-erp-form-contract): Keep ERP field-value defaults aligned with docs/erp-sync.sh after upstream ERP changes.
function buildErpImportFieldMap(): ErpImportFieldMap {
  return {
    action: 'CsvImport/import',
    actionTest: '0',
    actionImport: '1',
    escapeChar: 'quote',
    profileType: 'parts',
    quoteChar: 'quote',
    separator: ERP_IMPORT_FORM_SEPARATOR || 'comma',
    applyBookingGroup: 'all',
    articleNumberPolicy: 'update_parts',
    charset: ERP_IMPORT_FORM_CHARSET || 'UTF-8',
    defaultBookingGroup: ERP_IMPORT_FORM_DEFAULT_BOOKING_GROUP || '453',
    duplicates: 'no_check',
    numberFormat: '1000.00',
    partType: 'part',
    sellPriceAdjustment: '0',
    sellPriceAdjustmentType: 'percent',
    sellPricePlaces: 2,
    shopArticleIfMissing: 1,
    partClassification: ERP_IMPORT_FORM_PART_CLASSIFICATION || '2',
    defaultUnit: ERP_IMPORT_FORM_DEFAULT_UNIT || 'Stck'
  };
}

function toFormArg(fieldName: string, value: ErpImportValue): string {
  return `${fieldName}=${String(value)}`;
}

function buildAuthFieldName(baseName: 'login' | 'password' | 'client_id', authPrefix?: string): string {
  const normalizedPrefix = (authPrefix || '').trim();
  return normalizedPrefix ? `${normalizedPrefix}${baseName}` : baseName;
}

interface ImportOptions {
  actor: string;
  artifact: ItemsExportArtifact;
  clientId: string;
  formField: string;
  authFieldPrefix?: string;
  includeMedia: boolean;
  logger?: Pick<Console, 'error' | 'info' | 'warn'>;
  password: string;
  timeoutMs: number;
  url: string;
  username: string;
}

interface ImportResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  effectiveUrl: string;
}

type ImportPhase = 'test' | 'polling' | 'import';
type PollState = 'processing' | 'ready' | 'failed' | 'auth_lost' | 'unknown';

interface ImportPhaseResult extends ImportResult {
  phase: ImportPhase;
  acceptedByMarker: boolean;
  state?: PollState;
  job?: string | null;
  reportId?: string | null;
}

interface ImportExecutionResult {
  test: ImportPhaseResult;
  polling: ImportPhaseResult | null;
  import: ImportPhaseResult | null;
  markerValidationPassed: boolean;
  failurePhase: ImportPhase | null;
}

interface ParsedErpResponse {
  job: string | null;
  reportId: string | null;
  state: PollState;
}

const ERP_TEST_ACCEPTANCE_MARKERS = ['Ihr Import wird verarbeitet'];
const ERP_POLL_FAILURE_MARKERS = ['Import fehlgeschlagen', 'Fehler beim Import'];


const ERP_LOGIN_REDIRECT_MARKERS = ['LoginScreen/user_login', 'name="login"', 'id="login"', 'type="password"'];

function hasAuthLossMarkers(stdout: string, effectiveUrl: string): boolean {
  const responseText = `${stdout}\n${effectiveUrl}`;
  return ERP_LOGIN_REDIRECT_MARKERS.some((marker) => responseText.includes(marker));
}

function trimDiagnosticOutput(raw: string, maxLength = 500): string {
  const trimmed = raw.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}…`;
}

function matchesAcceptanceMarker(stdout: string): boolean {
  const normalizedStdout = stdout.trim();
  return ERP_TEST_ACCEPTANCE_MARKERS.some((marker) => normalizedStdout.includes(marker));
}

function extractQueryParam(urlValue: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = urlValue.match(new RegExp(`[?&]${escapedKey}=([^&#]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function parseErpImportState(stdout: string, effectiveUrl: string): ParsedErpResponse {
  const responseText = `${stdout}\n${effectiveUrl}`;
  const isReady =
    responseText.includes('Import-Vorschau') || responseText.includes('action=CsvImport/report');
  const isProcessing =
    responseText.includes('Import Status') || responseText.includes('action=CsvImport/result');
  const hasFailureMarker = ERP_POLL_FAILURE_MARKERS.some((marker) => responseText.includes(marker));
  const hasAuthLostMarker = hasAuthLossMarkers(stdout, effectiveUrl);
  const job = extractQueryParam(responseText, 'job');
  const reportId = extractQueryParam(responseText, 'id');

  if (hasFailureMarker) {
    return { job, reportId, state: 'failed' };
  }

  if (hasAuthLostMarker) {
    return { job, reportId, state: 'auth_lost' };
  }

  if (isReady && reportId) {
    return { job, reportId, state: 'ready' };
  }

  if (isProcessing && job) {
    return { job, reportId, state: 'processing' };
  }

  if (isReady) {
    return { job, reportId, state: 'ready' };
  }

  if (isProcessing) {
    return { job, reportId, state: 'processing' };
  }

  return { job, reportId, state: 'unknown' };
}

function buildPollingUrl(baseUrl: string, parsed: ParsedErpResponse): string {
  if (parsed.reportId) {
    return `${baseUrl}?action=CsvImport/report&id=${encodeURIComponent(parsed.reportId)}`;
  }
  if (parsed.job) {
    return `${baseUrl}?action=CsvImport/result&job=${encodeURIComponent(parsed.job)}`;
  }
  return baseUrl;
}

// TODO(agent): Confirm whether ERP import requires curl retries on transient 5xx responses.
// TODO(agent): Add structured log fields for curl timing metrics once we track ERP latency.
// TODO(sync-erp-phases): Keep phase-marker matching aligned with ERP response wording changes.
// TODO(sync-erp-polling-parser): Extend parser if ERP introduces JSON responses for import status endpoints.
// TODO(sync-erp-session-cookies): Replace temporary cookie-jar flow if ERP provides stable token-based polling APIs.
async function runCurlImport(options: ImportOptions): Promise<ImportExecutionResult> {
  const { actor, artifact, clientId, formField, includeMedia, logger, password, timeoutMs, url, username } = options;
  const loggerRef = logger ?? console;
  // TODO(agent): Reconcile ERP import content type selection with export artifact shape when media rules evolve.
  const expectedKind = includeMedia ? 'zip' : 'csv';
  const archiveKind = artifact.kind;
  if (archiveKind !== expectedKind) {
    throw new Error(`ERP export artifact mismatch: expected ${expectedKind}, received ${archiveKind}.`);
  }
  const mimeType = archiveKind === 'zip' ? 'application/zip' : 'text/csv';
  const fieldName = formField || 'file';
  const timeoutSeconds = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.ceil(timeoutMs / 1000) : undefined;
  const erpFields = buildErpImportFieldMap();
  const authLoginFieldName = buildAuthFieldName('login', options.authFieldPrefix);
  const authPasswordFieldName = buildAuthFieldName('password', options.authFieldPrefix);
  const authClientIdFieldName = buildAuthFieldName('client_id', options.authFieldPrefix);

  let cookieDirPath: string | null = null;
  let cookieJarPath: string | null = null;

  const buildCookieArgs = (): string[] => {
    if (!cookieJarPath) {
      return [];
    }
    return ['--cookie-jar', cookieJarPath, '--cookie', cookieJarPath];
  };

  const runCurl = async (phase: ImportPhase, args: string[]): Promise<ImportResult> => {
    const redactedArgs = args.map((arg) => {
      if (/(^|})login=/.test(arg)) {
        return `${arg.split('=')[0]}=***`;
      }
      if (/(^|})password=/.test(arg)) {
        return `${arg.split('=')[0]}=***`;
      }
      if (/(^|})client_id=/.test(arg)) {
        return `${arg.split('=')[0]}=***`;
      }
      return arg;
    });

    loggerRef.info?.('[sync-erp] curl import request', {
      url,
      phase,
      fieldName,
      includeMedia,
      archivePath: artifact.archivePath,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      args: redactedArgs
    });

    try {
      const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      if (child.stdout) {
        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
      }

      return await new Promise<ImportResult>((resolve, reject) => {
        child.on('error', (error) => {
          loggerRef.error?.('[sync-erp] curl spawn failed', { phase, error });
          reject(error);
        });

        child.on('close', (code, signal) => {
          if (signal) {
            stderr = `${stderr}${stderr ? '\\n' : ''}curl terminated with signal ${signal}`;
          }
          const exitCode = typeof code === 'number' ? code : -1;

          const lineBreakIndex = stdout.lastIndexOf('\n');
          const effectiveUrl = lineBreakIndex >= 0 ? stdout.slice(lineBreakIndex + 1).trim() : '';
          stdout = lineBreakIndex >= 0 ? stdout.slice(0, lineBreakIndex) : stdout;

          if (stdout.trim()) {
            loggerRef.info?.('[sync-erp] curl stdout', { phase, stdout: stdout.trim() });
          }

          if (effectiveUrl) {
            loggerRef.info?.('[sync-erp] curl effective url', { phase, effectiveUrl });
          }

          if (stderr.trim()) {
            loggerRef.warn?.('[sync-erp] curl stderr', { phase, stderr: stderr.trim() });
          }

          resolve({ exitCode, stdout, stderr, effectiveUrl });
        });
      });
    } catch (error) {
      loggerRef.error?.('[sync-erp] curl execution failed', { phase, error });
      throw error;
    }
  };

  const buildImportArgs = (phase: 'test' | 'import'): string[] => {
    const actionTestValue = phase === 'test' ? '1' : erpFields.actionTest;
    const actionImportValue = phase === 'import' ? erpFields.actionImport : '0';
    const args = [
      '-X',
      'POST',
      '--silent',
      '--insecure',
      '--show-error',
      '--location',
      '--write-out',
      '\n%{url_effective}',
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.action, erpFields.action),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.actionTest, actionTestValue),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.actionImport, actionImportValue),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.escapeChar, erpFields.escapeChar),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.profileType, erpFields.profileType),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.quoteChar, erpFields.quoteChar),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.separator, erpFields.separator),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.applyBookingGroup, erpFields.applyBookingGroup),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.articleNumberPolicy, erpFields.articleNumberPolicy),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.charset, erpFields.charset),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.defaultBookingGroup, erpFields.defaultBookingGroup),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.duplicates, erpFields.duplicates),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.numberFormat, erpFields.numberFormat),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.partType, erpFields.partType),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.sellPriceAdjustment, erpFields.sellPriceAdjustment),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.sellPriceAdjustmentType, erpFields.sellPriceAdjustmentType),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.sellPricePlaces, erpFields.sellPricePlaces),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.shopArticleIfMissing, erpFields.shopArticleIfMissing),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.partClassification, erpFields.partClassification),
      '-F',
      toFormArg(ERP_IMPORT_FIELD_NAMES.defaultUnit, erpFields.defaultUnit),
      '-F',
      `${fieldName}=@${artifact.archivePath};type=${mimeType}`,
      '-F',
      toFormArg(authClientIdFieldName, clientId || '1'),
      '-F',
      `actor=${actor}`,
      ...buildCookieArgs(),
      url
    ];

    if (username) {
      args.splice(args.length - 1, 0, '-F', toFormArg(authLoginFieldName, username));
    }

    if (password) {
      args.splice(args.length - 1, 0, '-F', toFormArg(authPasswordFieldName, password));
    }

    if (timeoutSeconds) {
      args.splice(6, 0, '--max-time', `${timeoutSeconds}`);
    }

    return args;
  };

  const buildPollArgs = (pollUrl: string): string[] => {
    const args = [
      '--silent',
      '--insecure',
      '--show-error',
      '--location',
      '--write-out',
      '\n%{url_effective}',
      ...buildCookieArgs(),
      pollUrl
    ];

    if (timeoutSeconds) {
      args.splice(6, 0, '--max-time', `${timeoutSeconds}`);
    }

    return args;
  };

  try {
    cookieDirPath = await mkdtemp(path.join(os.tmpdir(), 'erp-sync-cookie-'));
    cookieJarPath = path.join(cookieDirPath, 'session.cookies');
    loggerRef.info?.('[sync-erp] ERP cookie jar created', { cookieJarPath });
  } catch (cookieCreateError) {
    loggerRef.error?.('[sync-erp] Failed to initialize ERP cookie jar', { cookieCreateError });
    throw cookieCreateError;
  }

  try {
  const testResult = await runCurl('test', buildImportArgs('test'));
  let testAcceptedByMarker = false;
  let parsedTest: ParsedErpResponse = { job: null, reportId: null, state: 'unknown' };
  try {
    testAcceptedByMarker = matchesAcceptanceMarker(testResult.stdout);
    parsedTest = parseErpImportState(testResult.stdout, testResult.effectiveUrl);
  } catch (parseError) {
    loggerRef.error?.('[sync-erp] Failed to parse ERP test response', {
      phase: 'test',
      exitCode: testResult.exitCode,
      parseError
    });
    testAcceptedByMarker = false;
  }

  loggerRef.info?.('[sync-erp] ERP phase validation', {
    phase: 'test',
    exitCode: testResult.exitCode,
    matchedMarker: testAcceptedByMarker,
    state: parsedTest.state,
    job: parsedTest.job,
    reportId: parsedTest.reportId
  });

  if (testResult.exitCode !== 0 || !testAcceptedByMarker) {
    return {
      test: {
        ...testResult,
        phase: 'test',
        acceptedByMarker: testAcceptedByMarker,
        state: parsedTest.state,
        job: parsedTest.job,
        reportId: parsedTest.reportId
      },
      polling: null,
      import: null,
      markerValidationPassed: false,
      failurePhase: 'test'
    };
  }

  const pollIntervalMs = Math.max(250, ERP_IMPORT_POLL_INTERVAL_MS);
  const pollTimeoutMs = Math.max(pollIntervalMs, ERP_IMPORT_POLL_TIMEOUT_MS);
  const pollStartedAt = Date.now();
  let attempt = 0;
  let currentState = parsedTest;
  let pollingResult: ImportPhaseResult | null = null;

  try {
    while (Date.now() - pollStartedAt <= pollTimeoutMs) {
      attempt += 1;
      const elapsedMs = Date.now() - pollStartedAt;
      loggerRef.info?.('[sync-erp] ERP polling iteration', {
        attempt,
        elapsedMs,
        state: currentState.state,
        job: currentState.job,
        reportId: currentState.reportId
      });

      if (currentState.state === 'ready') {
        pollingResult = {
          exitCode: 0,
          stdout: '',
          stderr: '',
          effectiveUrl: buildPollingUrl(url, currentState),
          phase: 'polling',
          acceptedByMarker: true,
          state: 'ready',
          job: currentState.job,
          reportId: currentState.reportId
        };
        break;
      }

      if (currentState.state === 'failed' || currentState.state === 'auth_lost' || currentState.state === 'unknown') {
        pollingResult = {
          exitCode: 1,
          stdout: '',
          stderr: 'ERP processing state signaled failure or unknown status',
          effectiveUrl: buildPollingUrl(url, currentState),
          phase: 'polling',
          acceptedByMarker: false,
          state: currentState.state,
          job: currentState.job,
          reportId: currentState.reportId
        };
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const pollUrl = buildPollingUrl(url, currentState);
      const pollRequest = await runCurl('polling', buildPollArgs(pollUrl));
      try {
        const authLostDetected = hasAuthLossMarkers(pollRequest.stdout, pollRequest.effectiveUrl);
        if (authLostDetected) {
          loggerRef.warn?.('[sync-erp] ERP polling detected login redirect', {
            phase: 'polling',
            effectiveUrl: pollRequest.effectiveUrl
          });
          currentState = { job: null, reportId: null, state: 'auth_lost' };
        } else {
          currentState = parseErpImportState(pollRequest.stdout, pollRequest.effectiveUrl);
        }
      } catch (authDetectionError) {
        loggerRef.error?.('[sync-erp] Failed to evaluate ERP polling auth state', {
          phase: 'polling',
          authDetectionError
        });
        currentState = { job: null, reportId: null, state: 'unknown' };
      }
      pollingResult = {
        ...pollRequest,
        phase: 'polling',
        acceptedByMarker: currentState.state === 'ready',
        state: currentState.state,
        job: currentState.job,
        reportId: currentState.reportId
      };
    }
  } catch (pollError) {
    loggerRef.error?.('[sync-erp] ERP polling failed', { pollError });
    return {
      test: {
        ...testResult,
        phase: 'test',
        acceptedByMarker: testAcceptedByMarker,
        state: parsedTest.state,
        job: parsedTest.job,
        reportId: parsedTest.reportId
      },
      polling: {
        exitCode: -1,
        stdout: '',
        stderr: (pollError as Error).message,
        effectiveUrl: buildPollingUrl(url, currentState),
        phase: 'polling',
        acceptedByMarker: false,
        state: 'unknown',
        job: currentState.job,
        reportId: currentState.reportId
      },
      import: null,
      markerValidationPassed: true,
      failurePhase: 'polling'
    };
  }

  if (!pollingResult) {
    pollingResult = {
      exitCode: 1,
      stdout: '',
      stderr: 'ERP polling timed out without a ready import report',
      effectiveUrl: buildPollingUrl(url, currentState),
      phase: 'polling',
      acceptedByMarker: false,
      state: currentState.state,
      job: currentState.job,
      reportId: currentState.reportId
    };
  }

  if (pollingResult.state !== 'ready') {
    return {
      test: {
        ...testResult,
        phase: 'test',
        acceptedByMarker: testAcceptedByMarker,
        state: parsedTest.state,
        job: parsedTest.job,
        reportId: parsedTest.reportId
      },
      polling: pollingResult,
      import: null,
      markerValidationPassed: true,
      failurePhase: 'polling'
    };
  }

  const importResult = await runCurl('import', buildImportArgs('import'));
  const importAcceptedByMarker = importResult.exitCode === 0;
  let parsedImport: ParsedErpResponse = { job: null, reportId: null, state: 'unknown' };
  try {
    parsedImport = parseErpImportState(importResult.stdout, importResult.effectiveUrl);
  } catch (parseError) {
    loggerRef.error?.('[sync-erp] Failed to parse ERP import response', {
      phase: 'import',
      exitCode: importResult.exitCode,
      parseError
    });
  }

  loggerRef.info?.('[sync-erp] ERP phase validation', {
    phase: 'import',
    exitCode: importResult.exitCode,
    matchedMarker: importAcceptedByMarker,
    state: parsedImport.state,
    job: parsedImport.job,
    reportId: parsedImport.reportId
  });

  return {
    test: {
      ...testResult,
      phase: 'test',
      acceptedByMarker: testAcceptedByMarker,
      state: parsedTest.state,
      job: parsedTest.job,
      reportId: parsedTest.reportId
    },
    polling: pollingResult,
    import: {
      ...importResult,
      phase: 'import',
      acceptedByMarker: importAcceptedByMarker,
      state: parsedImport.state,
      job: parsedImport.job,
      reportId: parsedImport.reportId
    },
    markerValidationPassed: true,
    failurePhase: importAcceptedByMarker ? null : 'import'
  };
  } finally {
    if (cookieDirPath) {
      try {
        await rm(cookieDirPath, { recursive: true, force: true });
        loggerRef.info?.('[sync-erp] ERP cookie jar cleaned up', { cookieDirPath });
      } catch (cookieCleanupError) {
        loggerRef.warn?.('[sync-erp] Failed to clean up ERP cookie jar', {
          cookieDirPath,
          cookieCleanupError
        });
      }
    }
  }
}

const action = defineHttpAction({
  key: 'sync-erp',
  label: 'Sync ERP',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/sync/erp' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    let stagedExport: ItemsExportArtifact | null = null;
    try {
      let payload: any;
      try {
        payload = await readJsonBody(req);
      } catch (parseError) {
        console.warn('[sync-erp] Failed to parse JSON payload', parseError);
        return sendJson(res, 400, { error: 'Ungültige Anfrage: JSON-Body konnte nicht gelesen werden.' });
      }

      if (!ERP_SYNC_ENABLED) {
        console.warn('[sync-erp] ERP sync blocked by ERP_SYNC_ENABLED flag');
        return sendJson(res, 503, { error: 'ERP-Synchronisierung ist aktuell deaktiviert. Bitte ERP_SYNC_ENABLED aktivieren.' });
      }

      const actor = typeof payload?.actor === 'string' ? payload.actor.trim() : '';
      if (!actor) {
        return sendJson(res, 400, { error: 'Benutzername fehlt: Feld "actor" ist erforderlich.' });
      }

      if (!ERP_IMPORT_URL) {
        console.error('[sync-erp] ERP_IMPORT_URL is not configured');
        return sendJson(res, 500, { error: 'ERP-Import-Ziel ist nicht konfiguriert (ERP_IMPORT_URL fehlt).' });
      }

      const itemIds = normalizeItemIds(payload?.itemIds);
      const items = ctx.listItemsForExport.all({
        createdAfter: null,
        updatedAfter: null,
        itemIds
      });

      if (!Array.isArray(items) || items.length === 0) {
        console.warn('[sync-erp] No export rows available for ERP sync', { itemIdsCount: itemIds.length });
        return sendJson(res, 404, { error: 'Keine Artikel für den ERP-Sync gefunden.' });
      }

      if (ERP_IMPORT_INCLUDE_MEDIA) {
        console.error('[sync-erp] ERP import requires CSV payloads but ERP_IMPORT_INCLUDE_MEDIA=true was configured');
        return sendJson(res, 409, {
          error:
            'ERP-Import erwartet CSV ohne Medien. Bitte ERP_IMPORT_INCLUDE_MEDIA=false setzen oder Importmodus anpassen.'
        });
      }

      const boxes = typeof ctx.listBoxes?.all === 'function' ? ctx.listBoxes.all() : [];
      stagedExport = await stageItemsExport({
        archiveBaseName: `erp-sync-${Date.now()}`,
        boxes: Array.isArray(boxes) ? boxes : [],
        exportMode: 'erp',
        includeMedia: ERP_IMPORT_INCLUDE_MEDIA,
        items,
        logger: console
      });

      if (typeof ctx?.db?.transaction === 'function' && typeof ctx?.logEvent === 'function') {
        try {
          const logExport = ctx.db.transaction((rows: any[], a: string) => {
            for (const row of rows) {
              ctx.logEvent({
                Actor: a,
                EntityType: 'Item',
                EntityId: row.ItemUUID,
                Event: 'Exported',
                Meta: JSON.stringify({
                  target: 'erp',
                  includeMedia: ERP_IMPORT_INCLUDE_MEDIA,
                  filteredItemIds: itemIds
                })
              });
            }
          });
          logExport(items, actor);
        } catch (logError) {
          console.error('[sync-erp] Failed to log ERP export events', logError);
        }
      }

      console.info('[sync-erp] Starting ERP curl import');
      let curlResult: ImportExecutionResult;
      try {
        curlResult = await runCurlImport({
          actor,
          artifact: stagedExport,
          clientId: ERP_IMPORT_CLIENT_ID,
          formField: ERP_IMPORT_FORM_FIELD,
          authFieldPrefix: ERP_IMPORT_AUTH_FIELD_PREFIX,
          includeMedia: ERP_IMPORT_INCLUDE_MEDIA,
          logger: console,
          password: ERP_IMPORT_PASSWORD,
          timeoutMs: ERP_IMPORT_TIMEOUT_MS,
          url: ERP_IMPORT_URL,
          username: ERP_IMPORT_USERNAME
        });
      } catch (curlError) {
        console.error('[sync-erp] Failed to execute ERP import', curlError);
        return sendJson(res, 502, {
          error: 'ERP-Import konnte nicht gestartet werden.',
          details: (curlError as Error).message
        });
      }

      if (!curlResult.markerValidationPassed) {
        const testStdout = trimDiagnosticOutput(curlResult.test.stdout);
        const testStderr = trimDiagnosticOutput(curlResult.test.stderr);
        console.error('[sync-erp] ERP import test phase rejected', {
          phase: curlResult.test.phase,
          exitCode: curlResult.test.exitCode,
          matchedMarker: curlResult.test.acceptedByMarker
        });
        return sendJson(res, 502, {
          error: 'ERP-Testlauf wurde nicht bestätigt. Import wurde nicht gestartet.',
          failurePhase: 'test',
          state: curlResult.test.state,
          effectiveUrl: curlResult.test.effectiveUrl || null,
          phases: {
            test: {
              status: curlResult.test.exitCode === 0 ? 'failed-validation' : 'failed-execution',
              exitCode: curlResult.test.exitCode,
              matchedMarker: curlResult.test.acceptedByMarker,
              stdout: testStdout,
              stderr: testStderr,
              job: curlResult.test.job ?? null,
              reportId: curlResult.test.reportId ?? null,
              state: curlResult.test.state,
              effectiveUrl: curlResult.test.effectiveUrl || null
            },
            polling: {
              status: 'skipped'
            },
            import: {
              status: 'skipped'
            }
          }
        });
      }

      if (curlResult.failurePhase === 'polling' || !curlResult.polling || curlResult.polling.state !== 'ready') {
        console.error('[sync-erp] ERP polling phase did not reach ready state', {
          state: curlResult.polling?.state ?? 'unknown',
          exitCode: curlResult.polling?.exitCode ?? -1,
          job: curlResult.polling?.job ?? null,
          reportId: curlResult.polling?.reportId ?? null
        });
        return sendJson(res, 502, {
          error: 'ERP-Import konnte nicht fortgesetzt werden, da keine Import-Vorschau bereit war.',
          failurePhase: 'polling',
          state: curlResult.polling?.state ?? 'unknown',
          effectiveUrl: curlResult.polling?.effectiveUrl || null,
          phases: {
            test: {
              status: 'passed',
              exitCode: curlResult.test.exitCode,
              matchedMarker: curlResult.test.acceptedByMarker,
              job: curlResult.test.job ?? null,
              reportId: curlResult.test.reportId ?? null,
              state: curlResult.test.state,
              effectiveUrl: curlResult.test.effectiveUrl || null
            },
            polling: {
              status: 'failed',
              exitCode: curlResult.polling?.exitCode ?? -1,
              state: curlResult.polling?.state ?? 'unknown',
              job: curlResult.polling?.job ?? null,
              reportId: curlResult.polling?.reportId ?? null,
              stdout: trimDiagnosticOutput(curlResult.polling?.stdout ?? ''),
              stderr: trimDiagnosticOutput(curlResult.polling?.stderr ?? ''),
              effectiveUrl: curlResult.polling?.effectiveUrl || null
            },
            import: {
              status: 'skipped'
            }
          }
        });
      }

      if (!curlResult.import || curlResult.import.exitCode !== 0) {
        console.error('[sync-erp] ERP import failed', {
          exitCode: curlResult.import?.exitCode ?? -1
        });
        return sendJson(res, 502, {
          error: 'ERP-Import ist fehlgeschlagen.',
          failurePhase: 'import',
          state: curlResult.import?.state ?? 'unknown',
          effectiveUrl: curlResult.import?.effectiveUrl || null,
          phases: {
            test: {
              status: 'passed',
              exitCode: curlResult.test.exitCode,
              matchedMarker: curlResult.test.acceptedByMarker,
              job: curlResult.test.job ?? null,
              reportId: curlResult.test.reportId ?? null,
              state: curlResult.test.state,
              effectiveUrl: curlResult.test.effectiveUrl || null
            },
            polling: {
              status: 'passed',
              exitCode: curlResult.polling.exitCode,
              state: curlResult.polling.state,
              job: curlResult.polling.job ?? null,
              reportId: curlResult.polling.reportId ?? null,
            effectiveUrl: curlResult.polling.effectiveUrl || null
            },
            import: {
              status: 'failed',
              exitCode: curlResult.import?.exitCode ?? -1,
              matchedMarker: curlResult.import?.acceptedByMarker ?? false,
              stderr: trimDiagnosticOutput(curlResult.import?.stderr ?? ''),
              stdout: trimDiagnosticOutput(curlResult.import?.stdout ?? ''),
              job: curlResult.import?.job ?? null,
              reportId: curlResult.import?.reportId ?? null,
              state: curlResult.import?.state,
              effectiveUrl: curlResult.import?.effectiveUrl || null
            }
          }
        });
      }

      return sendJson(res, 200, {
        ok: true,
        failurePhase: curlResult.failurePhase,
        state: curlResult.import.state,
        effectiveUrl: curlResult.import.effectiveUrl || null,
        phases: {
          test: {
            status: 'passed',
            exitCode: curlResult.test.exitCode,
            matchedMarker: curlResult.test.acceptedByMarker,
            job: curlResult.test.job ?? null,
            reportId: curlResult.test.reportId ?? null,
            state: curlResult.test.state,
            effectiveUrl: curlResult.test.effectiveUrl || null
          },
          polling: {
            status: 'passed',
            exitCode: curlResult.polling.exitCode,
            state: curlResult.polling.state,
            job: curlResult.polling.job ?? null,
            reportId: curlResult.polling.reportId ?? null,
            effectiveUrl: curlResult.polling.effectiveUrl || null
          },
          import: {
            status: 'passed',
            exitCode: curlResult.import.exitCode,
            matchedMarker: curlResult.import.acceptedByMarker,
            job: curlResult.import.job ?? null,
            reportId: curlResult.import.reportId ?? null,
            state: curlResult.import.state,
            effectiveUrl: curlResult.import.effectiveUrl || null
          }
        },
        artifact: path.basename(stagedExport.archivePath),
        itemCount: items.length,
        includeMedia: ERP_IMPORT_INCLUDE_MEDIA
      });
    } catch (error) {
      console.error('[sync-erp] Failed to sync ERP', error);
      return sendJson(res, 500, { error: 'ERP-Synchronisierung fehlgeschlagen. Bitte Logs prüfen und erneut versuchen.' });
    } finally {
      if (stagedExport) {
        try {
          await stagedExport.cleanup();
        } catch (cleanupError) {
          console.error('[sync-erp] Failed to clean up ERP export staging directory', cleanupError);
        }
      }
    }
  },
  view: () => '<div class="card"><p class="muted">ERP sync</p></div>'
});

export default action;
