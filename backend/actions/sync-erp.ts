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
  ERP_IMPORT_POLLING_ENABLED,
  ERP_IMPORT_URL,
  ERP_IMPORT_USERNAME
} from '../config';
import { ItemsExportArtifact, stageItemsExport } from './export-items';
import { defineHttpAction } from './index';

// TODO(agent): Capture ERP sync response metadata (job IDs) once the upstream API returns them.
// TODO(agent): Consolidate ERP import HTTP client with shared networking utilities once available.
// TODO(sync-erp-baseline-path): Remove baseline no-poll path after continuation URL polling is proven stable in production.
// TODO(sync-erp-script-parity-default): Re-evaluate whether script-parity should remain default after polling-only diagnostics are stabilized.

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
type PollState =
  | 'processing'
  | 'ready'
  | 'failed'
  | 'auth_lost'
  | 'context_lost'
  | 'unexpected_home'
  | 'unknown'
  | 'invalid_response';

interface ImportPhaseResult extends ImportResult {
  phase: ImportPhase;
  acceptedByMarker: boolean;
  state?: PollState;
  job?: string | null;
  reportId?: string | null;
}

interface ImportExecutionResult {
  mode: ImportMode;
  baselineFlow: boolean;
  test: ImportPhaseResult;
  polling: ImportPhaseResult | null;
  import: ImportPhaseResult | null;
  importContinuation: {
    completed: boolean;
    timedOut: boolean;
    lastState: PollState;
  } | null;
  markerValidationPassed: boolean;
  failurePhase: ImportPhase | null;
}

type ImportMode = 'script-parity' | 'polling-enabled';

type PollTargetSource = 'fromTestResponse' | 'fromLastPoll' | 'fallbackBaseController';

interface ReportReadinessContext {
  reportId: string;
  job: string | null;
  reportUrl: string;
}

interface ReportReadinessStateSummary {
  processing: boolean;
  lastUrl: string;
  job: string | null;
  reportId: string | null;
}

interface ParsedErpResponse {
  job: string | null;
  reportId: string | null;
  state: PollState;
  acceptedByMarker: boolean;
  evidence: {
    hasImportStatusH2: boolean;
    hasImportVorschauH2: boolean;
    isLoginForm: boolean;
    effectiveUrlAction: string | null;
  };
  diagnostics?: string;
}

type ErpIdentifierSource = 'effectiveUrl' | 'htmlHref' | 'scriptPayload';

interface ExtractedErpIdentifiers {
  job: string | null;
  reportId: string | null;
  sources: {
    job: ErpIdentifierSource | null;
    reportId: ErpIdentifierSource | null;
  };
}

const ERP_POLL_FAILURE_MARKERS = ['Import fehlgeschlagen', 'Fehler beim Import'];

const ERP_LOGIN_FORM_MARKERS = ['name="login"', 'id="login"', 'type="password"'];
const ERP_LOGIN_REDIRECT_URL_MARKER = 'LoginScreen/user_login';
const ERP_AUTHENTICATED_HOME_MARKERS = ['dashboard', 'startseite', 'home', 'willkommen'];
const ERP_CONTEXT_LOST_ACTION = 'company_logo';
const ERP_CONTEXT_LOST_MAX_POLLS = 2;

function hasAuthLossMarkers(stdout: string, effectiveUrl: string): boolean {
  const normalizedResponse = stdout.toLowerCase();
  const normalizedUrl = effectiveUrl.toLowerCase();
  const hasLoginForm = ERP_LOGIN_FORM_MARKERS.some((marker) => normalizedResponse.includes(marker));
  return hasLoginForm || normalizedUrl.includes(ERP_LOGIN_REDIRECT_URL_MARKER.toLowerCase());
}

function trimDiagnosticOutput(raw: string, maxLength = 500): string {
  const trimmed = raw.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}…`;
}

function buildReportReadinessUrl(baseUrl: string, reportId: string): string {
  const trimmedReportId = reportId.trim();
  if (!trimmedReportId) {
    throw new Error('ERP report id is empty.');
  }

  try {
    const parsedBaseUrl = new URL(baseUrl);
    parsedBaseUrl.searchParams.set('action', 'CsvImport/report');
    parsedBaseUrl.searchParams.set('no_layout', '1');
    parsedBaseUrl.searchParams.set('id', trimmedReportId);
    return parsedBaseUrl.toString();
  } catch (error) {
    const normalizedBaseUrl = baseUrl.includes('?') ? baseUrl.split('?')[0] : baseUrl;
    return `${normalizedBaseUrl}?action=CsvImport/report&no_layout=1&id=${encodeURIComponent(trimmedReportId)}`;
  }
}

function buildControllerReferer(baseUrl: string): string {
  try {
    const parsedBaseUrl = new URL(baseUrl);
    const pathname = parsedBaseUrl.pathname;
    const normalizedPathname = pathname.endsWith('/') ? pathname : pathname.replace(/[^/]+$/, '');
    parsedBaseUrl.pathname = `${normalizedPathname}controller.pl`;
    parsedBaseUrl.search = '';
    parsedBaseUrl.hash = '';
    return parsedBaseUrl.toString();
  } catch (error) {
    const normalizedBaseUrl = baseUrl.replace(/[?#].*$/, '');
    const normalizedPath = normalizedBaseUrl.endsWith('/')
      ? normalizedBaseUrl
      : normalizedBaseUrl.replace(/[^/]+$/, '');
    return `${normalizedPath}controller.pl`;
  }
}

function hasImportPreviewHeading(stdout: string): boolean {
  return /<h2[^>]*>\s*Import-Vorschau\s*<\/h2>/i.test(stdout);
}

function summarizeReadinessState(parsed: ParsedErpResponse, lastUrl: string): ReportReadinessStateSummary {
  return {
    processing: parsed.state === 'processing',
    lastUrl,
    job: parsed.job,
    reportId: parsed.reportId
  };
}

// TODO(sync-erp-report-readiness): Revisit report-id extraction once ERP exposes a stable JSON response for action_test.
function deriveReportReadinessContext(testResult: ImportResult, logger: Pick<Console, 'warn'>, baseUrl: string): ReportReadinessContext {
  try {
    const identifiers = extractErpIdentifiers(testResult.stdout, testResult.effectiveUrl);
    const reportId = identifiers.reportId;
    const job = identifiers.job;

    logger.warn?.('[sync-erp] ERP readiness identifier extraction', {
      reportId,
      reportSource: identifiers.sources.reportId || 'none',
      job,
      jobSource: identifiers.sources.job || 'none',
      effectiveUrl: trimDiagnosticOutput(testResult.effectiveUrl, 200)
    });

    if (!reportId) {
      const fallbackReason = job
        ? `Missing report id in action_test response URL/HTML (job-only continuation available: ${job}).`
        : 'Missing report id in action_test response URL/HTML.';
      throw new Error(fallbackReason);
    }

    return {
      reportId,
      job,
      reportUrl: buildReportReadinessUrl(baseUrl, reportId)
    };
  } catch (error) {
    logger.warn?.('[sync-erp] Failed to derive report readiness context from action_test', {
      effectiveUrl: trimDiagnosticOutput(testResult.effectiveUrl, 200),
      stdoutSample: trimDiagnosticOutput(testResult.stdout, 200),
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function extractQueryParam(urlValue: string, key: string): string | null {
  try {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = urlValue.match(new RegExp(`[?&]${escapedKey}=([^&#]+)`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch (error) {
    console.warn('[sync-erp] Failed to extract query parameter', {
      key,
      urlSample: trimDiagnosticOutput(urlValue, 120),
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2f;/gi, '/')
    .replace(/&#47;/gi, '/');
}

function decodeUrlEncodedFragments(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractIdentifierFromPattern(value: string, type: 'resultJob' | 'reportId'): string | null {
  const pattern =
    type === 'resultJob'
      ? /action\s*=\s*CsvImport\s*\/\s*result[^\n"'<>]*?[?&]job\s*=\s*(\d+)/i
      : /action\s*=\s*CsvImport\s*\/\s*report[^\n"'<>]*?[?&]id\s*=\s*(\d+)/i;
  const match = value.match(pattern);
  return match?.[1] || null;
}

// TODO(sync-erp-identifier-patterns): Expand parser patterns if ERP starts embedding continuation URLs in additional data attributes.
function extractErpIdentifiers(stdout: string, effectiveUrl: string): ExtractedErpIdentifiers {
  try {
    const htmlHrefMatches = Array.from(stdout.matchAll(/href\s*=\s*['\"]([^'\"]+)['\"]/gi)).map(
      (match) => match[1] || ''
    );
    const scriptPayloadMatches = Array.from(stdout.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)).map(
      (match) => match[1] || ''
    );

    const candidates: Array<{ source: ErpIdentifierSource; value: string }> = [
      { source: 'effectiveUrl', value: effectiveUrl },
      ...htmlHrefMatches.map((value) => ({ source: 'htmlHref' as const, value })),
      ...scriptPayloadMatches.map((value) => ({ source: 'scriptPayload' as const, value }))
    ];

    let job: string | null = null;
    let reportId: string | null = null;
    let jobSource: ErpIdentifierSource | null = null;
    let reportSource: ErpIdentifierSource | null = null;

    for (const candidate of candidates) {
      const normalizedCandidate = decodeUrlEncodedFragments(decodeHtmlEntities(candidate.value));
      const responseText = `${normalizedCandidate}\n${decodeHtmlEntities(candidate.value)}`;
      if (!reportId) {
        reportId = extractQueryParam(responseText, 'id') || extractIdentifierFromPattern(responseText, 'reportId');
        if (reportId) {
          reportSource = candidate.source;
        }
      }
      if (!job) {
        job = extractQueryParam(responseText, 'job') || extractIdentifierFromPattern(responseText, 'resultJob');
        if (job) {
          jobSource = candidate.source;
        }
      }
      if (reportId && job) {
        break;
      }
    }

    return {
      job,
      reportId,
      sources: {
        job: jobSource,
        reportId: reportSource
      }
    };
  } catch (error) {
    console.warn('[sync-erp] Failed to extract ERP identifiers from response payload', {
      effectiveUrl: trimDiagnosticOutput(effectiveUrl, 120),
      stdoutSample: trimDiagnosticOutput(stdout, 200),
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      job: null,
      reportId: null,
      sources: {
        job: null,
        reportId: null
      }
    };
  }
}

function extractEffectiveUrlAction(effectiveUrl: string): string | null {
  if (!effectiveUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(effectiveUrl);
    return parsedUrl.searchParams.get('action');
  } catch (error) {
    console.warn('[sync-erp] Failed to parse effective URL with URL API, falling back to regex extraction', {
      effectiveUrl: trimDiagnosticOutput(effectiveUrl, 120),
      error: error instanceof Error ? error.message : String(error)
    });
    return extractQueryParam(effectiveUrl, 'action');
  }
}

function isAuthenticatedHomeResponse(stdout: string, effectiveUrl: string, effectiveUrlAction: string | null): boolean {
  if (effectiveUrlAction) {
    return false;
  }

  const normalizedResponse = stdout.toLowerCase();
  const hasHomeMarker = ERP_AUTHENTICATED_HOME_MARKERS.some((marker) => normalizedResponse.includes(marker));
  if (!hasHomeMarker) {
    return false;
  }

  try {
    const parsedUrl = new URL(effectiveUrl);
    const normalizedPath = parsedUrl.pathname.toLowerCase();
    return normalizedPath.endsWith('/controller.php') || normalizedPath.endsWith('/index.php');
  } catch (error) {
    console.warn('[sync-erp] Could not validate authenticated homepage URL shape', {
      effectiveUrl: trimDiagnosticOutput(effectiveUrl, 120),
      error: error instanceof Error ? error.message : String(error)
    });
    return /controller\.php|index\.php/i.test(effectiveUrl);
  }
}

function parseErpImportState(stdout: string, effectiveUrl: string): ParsedErpResponse {
  // TODO(sync-erp-home-markers): Revisit homepage marker heuristics when ERP offers a stable post-login context endpoint.
  // TODO(sync-erp-parser): Extract parser into shared ERP sync utility if additional actions need the same evidence contract.
  try {
    const responseText = `${stdout}\n${effectiveUrl}`;
    const hasImportStatusH2 = /<h2[^>]*>\s*Import Status\s*<\/h2>/i.test(responseText);
    const hasImportVorschauH2 = /<h2[^>]*>\s*Import-Vorschau\s*<\/h2>/i.test(responseText);
    const isLoginForm = hasAuthLossMarkers(stdout, effectiveUrl);
    const effectiveUrlAction = extractEffectiveUrlAction(effectiveUrl);
    const isAuthenticatedHome = isAuthenticatedHomeResponse(stdout, effectiveUrl, effectiveUrlAction);
    const isContextLost =
      effectiveUrlAction === ERP_CONTEXT_LOST_ACTION && /\/login\.pl(?:$|\?)/i.test(effectiveUrl);
    const hasResultAction = effectiveUrlAction === 'CsvImport/result';
    const hasReportAction = effectiveUrlAction === 'CsvImport/report';
    const hasFailureMarker = ERP_POLL_FAILURE_MARKERS.some((marker) => responseText.includes(marker));
    const identifiers = extractErpIdentifiers(stdout, effectiveUrl);
    const job = identifiers.job;
    const reportId = identifiers.reportId;

    let state: PollState = 'unknown';
    if (hasFailureMarker) {
      state = 'failed';
    } else if (isLoginForm) {
      state = 'auth_lost';
    } else if (isContextLost) {
      state = 'context_lost';
    } else if (isAuthenticatedHome) {
      state = 'unexpected_home';
    } else if (hasImportVorschauH2 || (hasReportAction && !!reportId)) {
      state = 'ready';
    } else if (hasImportStatusH2 || hasResultAction) {
      state = 'processing';
    }

    const acceptedByMarker = (state === 'processing' || state === 'ready') && !isLoginForm;

    console.info('[sync-erp] ERP identifier extraction', {
      effectiveUrl: trimDiagnosticOutput(effectiveUrl, 120),
      reportId,
      reportSource: identifiers.sources.reportId || 'none',
      job,
      jobSource: identifiers.sources.job || 'none'
    });

    if (state === 'unknown') {
      console.warn('[sync-erp] ERP parser encountered unknown response pattern', {
        effectiveUrl: trimDiagnosticOutput(effectiveUrl, 120),
        hasImportStatusH2,
        hasImportVorschauH2,
        isLoginForm,
        isAuthenticatedHome,
        effectiveUrlAction
      });
    }

    return {
      job,
      reportId,
      state,
      acceptedByMarker,
      evidence: {
        hasImportStatusH2,
        hasImportVorschauH2,
        isLoginForm,
        effectiveUrlAction
      }
    };
  } catch (parseError) {
    return {
      job: null,
      reportId: null,
      state: 'invalid_response',
      acceptedByMarker: false,
      evidence: {
        hasImportStatusH2: false,
        hasImportVorschauH2: false,
        isLoginForm: false,
        effectiveUrlAction: null
      },
      diagnostics: parseError instanceof Error ? parseError.message : 'Unknown parser failure'
    };
  }
}

function logParseEvidence(
  logger: Pick<Console, 'info' | 'warn' | 'error'>,
  phase: ImportPhase,
  parsed: ParsedErpResponse
): void {
  logger.info?.('[sync-erp] ERP parser evidence', {
    phase,
    state: parsed.state,
    acceptedByMarker: parsed.acceptedByMarker,
    hasImportStatusH2: parsed.evidence.hasImportStatusH2,
    hasImportVorschauH2: parsed.evidence.hasImportVorschauH2,
    isLoginForm: parsed.evidence.isLoginForm,
    effectiveUrlAction: parsed.evidence.effectiveUrlAction,
    diagnostics: parsed.diagnostics
  });
}

// TODO(sync-erp-continuation-url): Revisit continuation URL extraction if ERP changes CsvImport redirect/query behavior.
function extractContinuationUrl(
  phase: ImportPhase,
  baseUrl: string,
  effectiveUrl: string,
  parsed: ParsedErpResponse,
  logger: Pick<Console, 'warn'>
): string | null {
  try {
    if (effectiveUrl) {
      const parsedEffectiveUrl = new URL(effectiveUrl);
      const action = parsedEffectiveUrl.searchParams.get('action');
      const job = parsedEffectiveUrl.searchParams.get('job') || parsed.job;
      const reportId = parsedEffectiveUrl.searchParams.get('id') || parsed.reportId;
      if (action === 'CsvImport/report' && reportId) {
        return parsedEffectiveUrl.toString();
      }
      if (action === 'CsvImport/result' && job) {
        return parsedEffectiveUrl.toString();
      }
    }

    if (parsed.reportId) {
      return `${baseUrl}?action=CsvImport/report&id=${encodeURIComponent(parsed.reportId)}`;
    }
    if (parsed.job) {
      return `${baseUrl}?action=CsvImport/result&job=${encodeURIComponent(parsed.job)}`;
    }
    return null;
  } catch (urlParseError) {
    logger.warn?.('[sync-erp] Failed to extract continuation URL from ERP response', {
      phase,
      effectiveUrl: trimDiagnosticOutput(effectiveUrl, 200),
      job: parsed.job,
      reportId: parsed.reportId,
      urlParseError: urlParseError instanceof Error ? urlParseError.message : String(urlParseError)
    });

    if (parsed.reportId) {
      return `${baseUrl}?action=CsvImport/report&id=${encodeURIComponent(parsed.reportId)}`;
    }
    if (parsed.job) {
      return `${baseUrl}?action=CsvImport/result&job=${encodeURIComponent(parsed.job)}`;
    }
    return null;
  }
}

function parsePollTargetMetadata(
  pollTargetUrl: string,
  logger: Pick<Console, 'warn'>
): { pollTargetAction: string | null; pollTargetJob: string | null; pollTargetReportId: string | null } {
  // TODO(sync-erp-poll-target): Keep polling-target metadata extraction aligned if ERP query parameter names change.
  try {
    const parsedTargetUrl = new URL(pollTargetUrl);
    return {
      pollTargetAction: parsedTargetUrl.searchParams.get('action'),
      pollTargetJob: parsedTargetUrl.searchParams.get('job'),
      pollTargetReportId: parsedTargetUrl.searchParams.get('id')
    };
  } catch (pollTargetParseError) {
    logger.warn?.('[sync-erp] Failed to parse polling target URL metadata; continuing with regex fallback', {
      pollTargetUrl: trimDiagnosticOutput(pollTargetUrl, 200),
      pollTargetParseError:
        pollTargetParseError instanceof Error ? pollTargetParseError.message : String(pollTargetParseError)
    });

    return {
      pollTargetAction: extractQueryParam(pollTargetUrl, 'action'),
      pollTargetJob: extractQueryParam(pollTargetUrl, 'job'),
      pollTargetReportId: extractQueryParam(pollTargetUrl, 'id')
    };
  }
}

// TODO(agent): Confirm whether ERP import requires curl retries on transient 5xx responses.
// TODO(agent): Add structured log fields for curl timing metrics once we track ERP latency.
// TODO(sync-erp-phases): Keep phase-marker matching aligned with ERP response wording changes.
// TODO(sync-erp-polling-parser): Extend parser if ERP introduces JSON responses for import status endpoints.
// TODO(sync-erp-session-cookies): Replace temporary cookie-jar flow if ERP provides stable token-based polling APIs.
// TODO(sync-erp-unknown-grace): Tune unknown-state grace thresholds with production telemetry once kivitendo redirect chains stabilize.
// TODO(sync-erp-async-readiness): Add async readiness handling back on top of the deterministic script-parity baseline once integration is validated.
// TODO(sync-erp-import-verification): Keep baseline import verification diagnostics-only unless polling mode is explicitly enabled.
// TODO(sync-erp-post-import-loop): Keep continuation-loop markers aligned if ERP changes processing/preview headings.
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
  const importMode: ImportMode = ERP_IMPORT_POLLING_ENABLED ? 'polling-enabled' : 'script-parity';
  const baselineFlow = importMode === 'script-parity';

  let cookieDirPath: string | null = null;
  let cookieJarPath: string | null = null;
  const attemptedPollTargets: string[] = [];

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
      mode: importMode,
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

  // TODO(sync-erp-report-request-parity): Revalidate report fetch headers if browser HAR shows additional required request metadata.
  const buildReportPollArgs = (reportUrl: string): string[] => {
    try {
      const parsedReportUrl = new URL(reportUrl);
      const action = parsedReportUrl.searchParams.get('action');
      const reportId = parsedReportUrl.searchParams.get('id');

      if (action !== 'CsvImport/report' || !reportId) {
        throw new Error('unexpected report polling URL shape');
      }

      const args = buildPollArgs(parsedReportUrl.toString());
      const insertIndex = timeoutSeconds ? 8 : 6;
      const referer = buildControllerReferer(url);
      args.splice(insertIndex, 0, '-H', `Referer: ${referer}`, '-H', 'X-Requested-With: XMLHttpRequest');
      return args;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Malformed ERP report request URL: ${trimDiagnosticOutput(reportUrl, 180)} (${message})`);
    }
  };

  // TODO(sync-erp-context-lost): Keep context re-bootstrap URL aligned with ERP profile navigation changes.
  const buildContextBootstrapUrl = (): string => `${url}?action=CsvImport/import`;

  // TODO(sync-erp-readiness-contract): Keep report readiness criteria aligned with browser import flow behavior.
  const waitForReportReadiness = async (
    reportContext: ReportReadinessContext
  ): Promise<{ ready: boolean; reportResult: ImportResult | null; parsedReport: ParsedErpResponse | null; timeoutSummary: ReportReadinessStateSummary | null }> => {
    const pollIntervalMs = Math.max(250, ERP_IMPORT_POLL_INTERVAL_MS);
    const pollTimeoutMs = Math.max(pollIntervalMs, ERP_IMPORT_POLL_TIMEOUT_MS);
    const startedAt = Date.now();
    let reportResult: ImportResult | null = null;
    let parsedReport: ParsedErpResponse | null = null;

    while (Date.now() - startedAt <= pollTimeoutMs) {
      try {
        const reportArgs = buildReportPollArgs(reportContext.reportUrl);
        reportResult = await runCurl('polling', reportArgs);

        try {
          parsedReport = parseErpImportState(reportResult.stdout, reportResult.effectiveUrl);
        } catch (parseError) {
          const parseMessage = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error(`Malformed ERP report response: ${parseMessage}`);
        }
      } catch (reportPollError) {
        loggerRef.error?.('[sync-erp] Report readiness polling failed', {
          phase: 'polling',
          mode: importMode,
          reportId: reportContext.reportId,
          job: reportContext.job,
          reportUrl: trimDiagnosticOutput(reportContext.reportUrl, 200),
          error: reportPollError instanceof Error ? reportPollError.message : String(reportPollError)
        });
        throw reportPollError;
      }

      const reportHasImportVorschau = hasImportPreviewHeading(reportResult.stdout);
      const reportFetchReady =
        reportResult.exitCode === 0 &&
        parsedReport.evidence.effectiveUrlAction === 'CsvImport/report' &&
        !!parsedReport.reportId;
      const readinessSatisfied = reportHasImportVorschau || reportFetchReady;

      loggerRef.info?.('[sync-erp] ERP report fetch evidence', {
        phase: 'polling',
        mode: importMode,
        configuredReportId: reportContext.reportId,
        parsedReportId: parsedReport.reportId,
        effectiveUrl: reportResult.effectiveUrl || reportContext.reportUrl,
        hasImportVorschau: reportHasImportVorschau,
        reportFetchReady
      });

      loggerRef.info?.('[sync-erp] ERP report readiness transition', {
        phase: 'polling',
        mode: importMode,
        reportId: parsedReport.reportId || reportContext.reportId,
        job: parsedReport.job || reportContext.job,
        elapsedMs: Date.now() - startedAt,
        readinessSatisfied,
        reportHasImportVorschau,
        reportFetchReady,
        state: parsedReport.state,
        lastUrl: reportResult.effectiveUrl || reportContext.reportUrl
      });

      if (readinessSatisfied) {
        return { ready: true, reportResult, parsedReport, timeoutSummary: null };
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return {
      ready: false,
      reportResult,
      parsedReport,
      timeoutSummary: parsedReport
        ? summarizeReadinessState(parsedReport, reportResult?.effectiveUrl || reportContext.reportUrl)
        : {
            processing: false,
            lastUrl: reportContext.reportUrl,
            job: reportContext.job,
            reportId: reportContext.reportId
          }
    };
  };

  const continueAfterImportProcessing = async (
    initialImportResult: ImportResult,
    initialState: ParsedErpResponse
  ): Promise<{ importResult: ImportResult; parsedImport: ParsedErpResponse; continuationOutcome: ImportExecutionResult['importContinuation'] }> => {
    let latestImportResult = initialImportResult;
    let latestState = initialState;
    const pollIntervalMs = Math.max(250, ERP_IMPORT_POLL_INTERVAL_MS);
    const pollTimeoutMs = Math.min(Math.max(pollIntervalMs, ERP_IMPORT_POLL_TIMEOUT_MS), 15000);
    const startedAt = Date.now();
    let attempt = 0;

    while (Date.now() - startedAt <= pollTimeoutMs) {
      if (latestState.state !== 'processing') {
        return {
          importResult: latestImportResult,
          parsedImport: latestState,
          continuationOutcome: {
            completed: latestState.state === 'ready',
            timedOut: false,
            lastState: latestState.state
          }
        };
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      attempt += 1;
      const effectiveUrl = extractContinuationUrl('import', url, latestImportResult.effectiveUrl, latestState, loggerRef);
      const elapsedMs = Date.now() - startedAt;

      loggerRef.info?.('[sync-erp] ERP import continuation iteration', {
        attempt,
        elapsedMs,
        state: latestState.state,
        job: latestState.job,
        reportId: latestState.reportId,
        effectiveUrl: effectiveUrl || null
      });

      if (!effectiveUrl) {
        loggerRef.warn?.('[sync-erp] ERP import continuation skipped due to missing continuation URL', {
          attempt,
          elapsedMs,
          state: latestState.state,
          job: latestState.job,
          reportId: latestState.reportId
        });
        return {
          importResult: latestImportResult,
          parsedImport: latestState,
          continuationOutcome: {
            completed: false,
            timedOut: false,
            lastState: latestState.state
          }
        };
      }

      try {
        const continuationResult = await runCurl('import', buildPollArgs(effectiveUrl));
        latestImportResult = continuationResult;

        try {
          latestState = parseErpImportState(continuationResult.stdout, continuationResult.effectiveUrl);
          logParseEvidence(loggerRef, 'import', latestState);
        } catch (parseError) {
          loggerRef.warn?.('[sync-erp] Failed to parse ERP continuation response; keeping processing state', {
            attempt,
            elapsedMs,
            effectiveUrl: trimDiagnosticOutput(effectiveUrl, 200),
            parseError: parseError instanceof Error ? parseError.message : String(parseError)
          });
          latestState = {
            ...latestState,
            state: 'invalid_response',
            acceptedByMarker: false,
            diagnostics: parseError instanceof Error ? parseError.message : String(parseError)
          };
          return {
            importResult: latestImportResult,
            parsedImport: latestState,
            continuationOutcome: {
              completed: false,
              timedOut: false,
              lastState: latestState.state
            }
          };
        }

        if (latestState.state === 'ready' || latestState.state === 'failed' || latestState.state === 'auth_lost') {
          return {
            importResult: latestImportResult,
            parsedImport: latestState,
            continuationOutcome: {
              completed: latestState.state === 'ready',
              timedOut: false,
              lastState: latestState.state
            }
          };
        }
      } catch (continuationError) {
        loggerRef.error?.('[sync-erp] ERP import continuation request failed', {
          attempt,
          elapsedMs,
          effectiveUrl: trimDiagnosticOutput(effectiveUrl, 200),
          continuationError: continuationError instanceof Error ? continuationError.message : String(continuationError)
        });
        return {
          importResult: latestImportResult,
          parsedImport: latestState,
          continuationOutcome: {
            completed: false,
            timedOut: false,
            lastState: latestState.state
          }
        };
      }
    }

    return {
      importResult: latestImportResult,
      parsedImport: latestState,
      continuationOutcome: {
        completed: false,
        timedOut: true,
        lastState: latestState.state
      }
    };
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
  const parsedTest = parseErpImportState(testResult.stdout, testResult.effectiveUrl);
  const testAcceptedByMarker = parsedTest.acceptedByMarker;
  logParseEvidence(loggerRef, 'test', parsedTest);

  loggerRef.info?.('[sync-erp] ERP phase validation', {
    phase: 'test',
    mode: importMode,
    exitCode: testResult.exitCode,
    matchedMarker: testAcceptedByMarker,
    state: parsedTest.state,
    job: parsedTest.job,
    reportId: parsedTest.reportId
  });

  if (testResult.exitCode !== 0 || !testAcceptedByMarker) {
    return {
      mode: importMode,
      baselineFlow,
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
      importContinuation: null,
      markerValidationPassed: false,
      failurePhase: 'test'
    };
  }

  loggerRef.info?.('[sync-erp] ERP phase transition', {
    fromPhase: 'test',
    toPhase: ERP_IMPORT_POLLING_ENABLED ? 'polling' : 'import',
    pollingEnabled: ERP_IMPORT_POLLING_ENABLED,
    mode: importMode
  });

  if (!ERP_IMPORT_POLLING_ENABLED) {
    loggerRef.info?.('[sync-erp] ERP baseline flow enabled; continuing to import after action_test marker validation', {
      phase: 'import',
      mode: importMode,
      reason: 'ERP_IMPORT_POLLING_ENABLED=false'
    });

    let importResult = await runCurl('import', buildImportArgs('import'));
    let parsedImport: ParsedErpResponse;

    try {
      parsedImport = parseErpImportState(importResult.stdout, importResult.effectiveUrl);
      logParseEvidence(loggerRef, 'import', parsedImport);
    } catch (parseError) {
      loggerRef.warn?.('[sync-erp] ERP import verification parser threw unexpectedly; falling back to raw diagnostics', {
        mode: importMode,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        fallbackSummary: {
          exitCode: importResult.exitCode,
          stdoutSample: trimDiagnosticOutput(importResult.stdout, 200)
        }
      });

      parsedImport = {
        job: null,
        reportId: null,
        state: 'invalid_response',
        acceptedByMarker: false,
        evidence: {
          hasImportStatusH2: false,
          hasImportVorschauH2: false,
          isLoginForm: false,
          effectiveUrlAction: extractEffectiveUrlAction(importResult.effectiveUrl)
        },
        diagnostics: `fallback(exitCode=${importResult.exitCode}, stdout=${trimDiagnosticOutput(importResult.stdout, 200)})`
      };
    }

    let importAcceptedByMarker = parsedImport.acceptedByMarker;
    let importContinuation: ImportExecutionResult['importContinuation'] = {
      completed: parsedImport.state === 'ready',
      timedOut: false,
      lastState: parsedImport.state
    };

    if (parsedImport.state === 'processing') {
      const continuation = await continueAfterImportProcessing(importResult, parsedImport);
      importResult = continuation.importResult;
      parsedImport = continuation.parsedImport;
      importAcceptedByMarker = parsedImport.acceptedByMarker;
      importContinuation = continuation.continuationOutcome;
    }

    const importVerification = {
      state: parsedImport.state,
      matchedMarker: importAcceptedByMarker,
      effectiveUrl: importResult.effectiveUrl || null,
      importContinuation
    };

    if (parsedImport.state === 'invalid_response') {
      loggerRef.warn?.('[sync-erp] ERP import verification could not be parsed; using raw fallback diagnostics', {
        mode: importMode,
        importVerification,
        fallbackSummary: {
          exitCode: importResult.exitCode,
          stdoutSample: trimDiagnosticOutput(importResult.stdout, 200)
        },
        diagnostics: parsedImport.diagnostics || null
      });
    }

    loggerRef.info?.('[sync-erp] ERP phase validation', {
      phase: 'import',
      mode: importMode,
      exitCode: importResult.exitCode,
      importVerification,
      job: parsedImport.job,
      reportId: parsedImport.reportId,
      diagnosticsOnly: true
    });

    return {
      mode: importMode,
      baselineFlow,
      test: {
        ...testResult,
        phase: 'test',
        acceptedByMarker: testAcceptedByMarker,
        state: parsedTest.state,
        job: parsedTest.job,
        reportId: parsedTest.reportId
      },
      polling: null,
      import: {
        ...importResult,
        phase: 'import',
        acceptedByMarker: importAcceptedByMarker,
        state: parsedImport.state,
        job: parsedImport.job,
        reportId: parsedImport.reportId
      },
      importContinuation,
      markerValidationPassed: true,
      failurePhase: importResult.exitCode === 0 ? null : 'import'
    };
  }

  const pollIntervalMs = Math.max(250, ERP_IMPORT_POLL_INTERVAL_MS);
  const pollTimeoutMs = Math.max(pollIntervalMs, ERP_IMPORT_POLL_TIMEOUT_MS);
  const unknownGraceMs = Math.min(pollTimeoutMs, Math.max(pollIntervalMs * 2, 5000));
  const maxUnknownAttempts = Math.max(3, Math.ceil(unknownGraceMs / pollIntervalMs));
  const pollStartedAt = Date.now();
  let attempt = 0;
  let currentState = parsedTest;
  let consecutiveUnknownCount = 0;
  let lastEffectiveUrlAction: string | null = currentState.evidence.effectiveUrlAction;
  const recentEffectiveUrls: string[] = [];
  const recentEffectiveUrlActions: string[] = [];
  let pollingResult: ImportPhaseResult | null = null;

  const recordEffectiveUrlState = (effectiveUrl: string, action: string | null): void => {
    const normalizedEffectiveUrl = (effectiveUrl || '').trim();
    if (normalizedEffectiveUrl) {
      recentEffectiveUrls.push(normalizedEffectiveUrl);
      if (recentEffectiveUrls.length > 5) {
        recentEffectiveUrls.shift();
      }
    }

    if (action) {
      recentEffectiveUrlActions.push(action);
      if (recentEffectiveUrlActions.length > 5) {
        recentEffectiveUrlActions.shift();
      }
    }
  };

  recordEffectiveUrlState(testResult.effectiveUrl, currentState.evidence.effectiveUrlAction);
  let continuationUrl = extractContinuationUrl('test', url, testResult.effectiveUrl, currentState, loggerRef);
  let continuationSource: PollTargetSource = continuationUrl ? 'fromTestResponse' : 'fallbackBaseController';
  let rebootstrapAttempted = false;
  let contextLostCount = 0;

  try {
    while (Date.now() - pollStartedAt <= pollTimeoutMs) {
      attempt += 1;
      const elapsedMs = Date.now() - pollStartedAt;
      loggerRef.info?.('[sync-erp] ERP polling iteration', {
        attempt,
        elapsedMs,
        state: currentState.state,
        effectiveUrlAction: currentState.evidence.effectiveUrlAction,
        consecutiveUnknownCount,
        contextLostCount,
        rebootstrapAttempted,
        lastEffectiveUrlAction,
        job: currentState.job,
        reportId: currentState.reportId
      });

      if (currentState.state === 'ready') {
        pollingResult = {
          exitCode: 0,
          stdout: '',
          stderr: '',
          effectiveUrl: continuationUrl || url,
          phase: 'polling',
          acceptedByMarker: true,
          state: 'ready',
          job: currentState.job,
          reportId: currentState.reportId
        };
        break;
      }

      if (
        currentState.state === 'failed' ||
        currentState.state === 'auth_lost' ||
        currentState.state === 'unexpected_home' ||
        currentState.state === 'invalid_response'
      ) {
        pollingResult = {
          exitCode: 1,
          stdout: '',
          stderr: 'ERP processing state signaled failure or unknown status',
          effectiveUrl: continuationUrl || url,
          phase: 'polling',
          acceptedByMarker: false,
          state: currentState.state,
          job: currentState.job,
          reportId: currentState.reportId
        };
        break;
      }

      if (currentState.state === 'context_lost') {
        contextLostCount += 1;
        if (!rebootstrapAttempted) {
          rebootstrapAttempted = true;
          const bootstrapUrl = buildContextBootstrapUrl();
          loggerRef.warn?.('[sync-erp] ERP context lost; attempting controlled re-bootstrap', {
            state: currentState.state,
            effectiveUrlAction: currentState.evidence.effectiveUrlAction,
            rebootstrapAttempted,
            bootstrapUrl: trimDiagnosticOutput(bootstrapUrl, 200),
            continuationUrl: trimDiagnosticOutput(continuationUrl || url, 200),
            job: currentState.job,
            reportId: currentState.reportId
          });

          try {
            const bootstrapRequest = await runCurl('polling', buildPollArgs(bootstrapUrl));
            const bootstrapState = parseErpImportState(bootstrapRequest.stdout, bootstrapRequest.effectiveUrl);
            logParseEvidence(loggerRef, 'polling', bootstrapState);
            const bootstrapContinuationUrl = extractContinuationUrl(
              'polling',
              url,
              bootstrapRequest.effectiveUrl,
              bootstrapState,
              loggerRef
            );
            if (bootstrapContinuationUrl) {
              continuationUrl = bootstrapContinuationUrl;
              continuationSource = 'fromLastPoll';
            }
            currentState = bootstrapState;
            continue;
          } catch (rebootstrapError) {
            loggerRef.error?.('[sync-erp] ERP context re-bootstrap failed', {
              state: currentState.state,
              effectiveUrlAction: currentState.evidence.effectiveUrlAction,
              rebootstrapAttempted,
              error: rebootstrapError instanceof Error ? rebootstrapError.message : String(rebootstrapError)
            });
            pollingResult = {
              exitCode: 1,
              stdout: '',
              stderr: `ERP context re-bootstrap failed: ${rebootstrapError instanceof Error ? rebootstrapError.message : String(rebootstrapError)}`,
              effectiveUrl: continuationUrl || url,
              phase: 'polling',
              acceptedByMarker: false,
              state: 'context_lost',
              job: currentState.job,
              reportId: currentState.reportId
            };
            break;
          }
        }

        if (contextLostCount > ERP_CONTEXT_LOST_MAX_POLLS) {
          pollingResult = {
            exitCode: 1,
            stdout: '',
            stderr: `ERP context remained lost after controlled re-bootstrap (contextLostCount=${contextLostCount}, maxContextLostPolls=${ERP_CONTEXT_LOST_MAX_POLLS}, lastAction=${currentState.evidence.effectiveUrlAction || 'none'})`,
            effectiveUrl: continuationUrl || url,
            phase: 'polling',
            acceptedByMarker: false,
            state: 'context_lost',
            job: currentState.job,
            reportId: currentState.reportId
          };
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const pollUrl = continuationUrl || url;
      const pollTargetSource: PollTargetSource = continuationUrl ? continuationSource : 'fallbackBaseController';
      const { pollTargetAction, pollTargetJob, pollTargetReportId } = parsePollTargetMetadata(pollUrl, loggerRef);

      attemptedPollTargets.push(
        `${pollTargetSource}:${trimDiagnosticOutput(pollUrl, 180)}@${pollTargetAction || 'unknown'}:${pollTargetJob || 'none'}:${pollTargetReportId || 'none'}`
      );
      if (attemptedPollTargets.length > 10) {
        attemptedPollTargets.shift();
      }

      loggerRef.info?.('[sync-erp] ERP polling target selected', {
        phase: 'polling',
        pollTargetSource,
        pollTargetUrl: trimDiagnosticOutput(pollUrl, 200),
        pollTargetAction,
        pollTargetJob,
        pollTargetReportId
      });

      if (!continuationUrl) {
        loggerRef.warn?.('[sync-erp] Polling fallback to base controller URL due to missing continuation context', {
          phase: 'polling',
          pollTargetSource,
          pollTargetUrl: trimDiagnosticOutput(pollUrl, 200),
          pollTargetAction,
          pollTargetJob,
          pollTargetReportId,
          job: currentState.job,
          reportId: currentState.reportId
        });
      }
      const pollRequest = await runCurl('polling', buildPollArgs(pollUrl));

      try {
        currentState = parseErpImportState(pollRequest.stdout, pollRequest.effectiveUrl);
      } catch (pollParseError) {
        loggerRef.warn?.('[sync-erp] ERP polling parser transition failed, downgrading to unknown state', {
          attempt,
          pollParseError: pollParseError instanceof Error ? pollParseError.message : String(pollParseError)
        });
        currentState = {
          job: null,
          reportId: null,
          state: 'unknown',
          acceptedByMarker: false,
          evidence: {
            hasImportStatusH2: false,
            hasImportVorschauH2: false,
            isLoginForm: false,
            effectiveUrlAction: null
          },
          diagnostics: pollParseError instanceof Error ? pollParseError.message : 'Unknown parser transition failure'
        };
      }

      if (currentState.state === 'unknown') {
        consecutiveUnknownCount += 1;
      } else {
        consecutiveUnknownCount = 0;
      }

      if (currentState.state !== 'context_lost') {
        contextLostCount = 0;
      }

      const nextContinuationUrl = extractContinuationUrl('polling', url, pollRequest.effectiveUrl, currentState, loggerRef);
      if (nextContinuationUrl) {
        continuationUrl = nextContinuationUrl;
        continuationSource = 'fromLastPoll';
      }

      lastEffectiveUrlAction = currentState.evidence.effectiveUrlAction;
      recordEffectiveUrlState(pollRequest.effectiveUrl, lastEffectiveUrlAction);

      logParseEvidence(loggerRef, 'polling', currentState);
      pollingResult = {
        ...pollRequest,
        phase: 'polling',
        acceptedByMarker: currentState.acceptedByMarker,
        state: currentState.state,
        job: currentState.job,
        reportId: currentState.reportId
      };

      const unknownGraceExceeded =
        currentState.state === 'unknown' &&
        (consecutiveUnknownCount >= maxUnknownAttempts || elapsedMs >= unknownGraceMs);

      if (unknownGraceExceeded) {
        pollingResult = {
          ...pollingResult,
          exitCode: 1,
          stderr: `ERP processing remained unknown beyond grace window (consecutiveUnknownCount=${consecutiveUnknownCount}, maxUnknownAttempts=${maxUnknownAttempts}, elapsedMs=${elapsedMs}, unknownGraceMs=${unknownGraceMs})`
        };
        break;
      }
    }
  } catch (pollError) {
    loggerRef.error?.('[sync-erp] ERP polling failed', { pollError });
    return {
      mode: importMode,
      baselineFlow,
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
        effectiveUrl: continuationUrl || url,
        phase: 'polling',
        acceptedByMarker: false,
        state: 'unknown',
        job: currentState.job,
        reportId: currentState.reportId
      },
      import: null,
      importContinuation: null,
      markerValidationPassed: true,
      failurePhase: 'polling'
    };
  }

  if (!pollingResult) {
    const timeoutSummary = summarizeReadinessState(currentState, continuationUrl || url);
    pollingResult = {
      exitCode: 1,
      stdout: '',
      stderr: `ERP polling timed out without readiness (processing=${timeoutSummary.processing}, lastUrl=${timeoutSummary.lastUrl}, job=${timeoutSummary.job || 'none'}, reportId=${timeoutSummary.reportId || 'none'}, attempts=${attempt}, consecutiveUnknownCount=${consecutiveUnknownCount}, recentEffectiveUrls=${recentEffectiveUrls.join(' -> ') || 'none'}, recentEffectiveUrlActions=${recentEffectiveUrlActions.join(' -> ') || 'none'})`,
      effectiveUrl: continuationUrl || url,
      phase: 'polling',
      acceptedByMarker: false,
      state: currentState.state,
      job: currentState.job,
      reportId: currentState.reportId
    };
  }

  if (pollingResult.state !== 'ready') {
    return {
      mode: importMode,
      baselineFlow,
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
      importContinuation: null,
      markerValidationPassed: true,
      failurePhase: 'polling'
    };
  }

  loggerRef.info?.('[sync-erp] ERP phase transition', {
    fromPhase: 'polling',
    toPhase: 'import',
    pollingEnabled: ERP_IMPORT_POLLING_ENABLED,
    mode: importMode
  });

  let importResult = await runCurl('import', buildImportArgs('import'));
  let parsedImport = parseErpImportState(importResult.stdout, importResult.effectiveUrl);
  let importAcceptedByMarker = parsedImport.acceptedByMarker;
  let importContinuation: ImportExecutionResult['importContinuation'] = {
    completed: parsedImport.state === 'ready',
    timedOut: false,
    lastState: parsedImport.state
  };

  if (parsedImport.state === 'processing') {
    const continuation = await continueAfterImportProcessing(importResult, parsedImport);
    importResult = continuation.importResult;
    parsedImport = continuation.parsedImport;
    importAcceptedByMarker = parsedImport.acceptedByMarker;
    importContinuation = continuation.continuationOutcome;
  }

  logParseEvidence(loggerRef, 'import', parsedImport);

  loggerRef.info?.('[sync-erp] ERP phase validation', {
    phase: 'import',
    mode: importMode,
    exitCode: importResult.exitCode,
    matchedMarker: importAcceptedByMarker,
    state: parsedImport.state,
    job: parsedImport.job,
    reportId: parsedImport.reportId
  });

  return {
    mode: importMode,
    baselineFlow,
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
    importContinuation,
    markerValidationPassed: true,
    failurePhase: importAcceptedByMarker ? null : 'import'
  };
  } finally {
    loggerRef.info?.('[sync-erp] ERP polling summary', {
      attemptedTargetsCount: attemptedPollTargets.length,
      attemptedTargetsSequence: trimDiagnosticOutput(attemptedPollTargets.join(' -> '), 600)
    });

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

      console.info('[sync-erp] Starting ERP curl import', { mode: ERP_IMPORT_POLLING_ENABLED ? 'polling-enabled' : 'script-parity' });
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
          mode: curlResult.mode,
          baselineFlow: curlResult.baselineFlow,
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

      const pollingSkipped = !ERP_IMPORT_POLLING_ENABLED && !curlResult.polling;
      const importContinuationOutcome = curlResult.importContinuation ?? {
        completed: curlResult.import?.state === 'ready',
        timedOut: false,
        lastState: curlResult.import?.state ?? 'unknown'
      };

      if (!pollingSkipped && (curlResult.failurePhase === 'polling' || !curlResult.polling || curlResult.polling.state !== 'ready')) {
        const isUnexpectedHome = curlResult.polling?.state === 'unexpected_home';
        const isContextLost = curlResult.polling?.state === 'context_lost';
        console.error('[sync-erp] ERP polling phase did not reach ready state', {
          mode: ERP_IMPORT_POLLING_ENABLED ? 'polling-enabled' : 'script-parity',
          state: curlResult.polling?.state ?? 'unknown',
          exitCode: curlResult.polling?.exitCode ?? -1,
          job: curlResult.polling?.job ?? null,
          reportId: curlResult.polling?.reportId ?? null
        });
        return sendJson(res, 502, {
          error: isContextLost
            ? 'ERP-Import-Kontext ging verloren und konnte nicht zuverlässig wiederhergestellt werden.'
            : isUnexpectedHome
            ? 'ERP-Import konnte nicht fortgesetzt werden, da eine unerwartete Startseite statt der Import-Vorschau geladen wurde.'
            : 'ERP-Import konnte nicht fortgesetzt werden, da keine Import-Vorschau bereit war.',
          mode: curlResult.mode,
          baselineFlow: curlResult.baselineFlow,
          details: isContextLost
            ? 'ERP antwortete wiederholt mit login.pl?action=company_logo. Bitte CSV-Import-Kontext/Profil erneut öffnen und den Sync neu starten.'
            : isUnexpectedHome
            ? 'ERP antwortete mit einer authentifizierten Startseite ohne Import-Kontext. Prüfen Sie Profil-/Mandanten-Bootstrap und Importkontext.'
            : undefined,
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

      if (!curlResult.import || curlResult.import.exitCode !== 0 || curlResult.failurePhase === 'import') {
        console.error('[sync-erp] ERP import failed', {
          exitCode: curlResult.import?.exitCode ?? -1,
          matchedMarker: curlResult.import?.acceptedByMarker ?? false
        });
        return sendJson(res, 502, {
          error: 'ERP-Import ist fehlgeschlagen.',
          mode: curlResult.mode,
          baselineFlow: curlResult.baselineFlow,
          failurePhase: 'import',
          state: curlResult.import?.state ?? 'unknown',
          completed: importContinuationOutcome.completed,
          timedOut: importContinuationOutcome.timedOut,
          lastState: importContinuationOutcome.lastState,
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
            polling: pollingSkipped
              ? {
                  status: 'skipped'
                }
              : {
                  status: 'passed',
                  exitCode: curlResult.polling!.exitCode,
                  state: curlResult.polling!.state,
                  job: curlResult.polling!.job ?? null,
                  reportId: curlResult.polling!.reportId ?? null,
                  effectiveUrl: curlResult.polling!.effectiveUrl || null
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

      if (curlResult.import.state === 'processing') {
        const statusCode = importContinuationOutcome.timedOut ? 504 : 202;
        const responseMessage = importContinuationOutcome.timedOut
          ? 'ERP-Import blieb im Verarbeitungsstatus und erreichte innerhalb des Zeitlimits keinen Abschluss.'
          : 'ERP-Import wird noch verarbeitet; Abschluss noch nicht bestätigt.';

        console.warn('[sync-erp] ERP import continuation did not reach completion', {
          mode: curlResult.mode,
          statusCode,
          completed: importContinuationOutcome.completed,
          timedOut: importContinuationOutcome.timedOut,
          lastState: importContinuationOutcome.lastState,
          effectiveUrl: curlResult.import.effectiveUrl || null
        });

        return sendJson(res, statusCode, {
          ok: false,
          mode: curlResult.mode,
          baselineFlow: curlResult.baselineFlow,
          failurePhase: curlResult.failurePhase,
          state: curlResult.import.state,
          completed: importContinuationOutcome.completed,
          timedOut: importContinuationOutcome.timedOut,
          lastState: importContinuationOutcome.lastState,
          message: responseMessage,
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
            polling: pollingSkipped
              ? {
                  status: 'skipped'
                }
              : {
                  status: 'passed',
                  exitCode: curlResult.polling!.exitCode,
                  state: curlResult.polling!.state,
                  job: curlResult.polling!.job ?? null,
                  reportId: curlResult.polling!.reportId ?? null,
                  effectiveUrl: curlResult.polling!.effectiveUrl || null
                },
            import: {
              status: 'pending',
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
      }

      return sendJson(res, 200, {
        ok: true,
        mode: curlResult.mode,
        baselineFlow: curlResult.baselineFlow,
        failurePhase: curlResult.failurePhase,
        state: curlResult.import.state,
        completed: importContinuationOutcome.completed,
        timedOut: importContinuationOutcome.timedOut,
        lastState: importContinuationOutcome.lastState,
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
          polling: pollingSkipped
            ? {
                status: 'skipped'
              }
            : {
                status: 'passed',
                exitCode: curlResult.polling!.exitCode,
                state: curlResult.polling!.state,
                job: curlResult.polling!.job ?? null,
                reportId: curlResult.polling!.reportId ?? null,
                effectiveUrl: curlResult.polling!.effectiveUrl || null
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
