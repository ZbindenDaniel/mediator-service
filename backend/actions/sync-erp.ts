import path from 'path';
import { spawn } from 'child_process';
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
}

interface ImportPhaseResult extends ImportResult {
  phase: 'test' | 'import';
  acceptedByMarker: boolean;
}

interface ImportExecutionResult {
  test: ImportPhaseResult;
  import: ImportPhaseResult | null;
  markerValidationPassed: boolean;
}

const ERP_TEST_ACCEPTANCE_MARKERS = ['Ihr Import wird verarbeitet'];

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

// TODO(agent): Confirm whether ERP import requires curl retries on transient 5xx responses.
// TODO(agent): Add structured log fields for curl timing metrics once we track ERP latency.
// TODO(sync-erp-phases): Keep phase-marker matching aligned with ERP response wording changes.
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
  const buildCurlArgs = (phase: 'test' | 'import'): string[] => {
    const actionTestValue = phase === 'test' ? '1' : erpFields.actionTest;
    const actionImportValue = phase === 'import' ? erpFields.actionImport : '0';
    return [
    '-X',
    'POST',
    '--silent',
    '--insecure',
    '--show-error',
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
    url
    ];
  };

  const runPhase = async (phase: 'test' | 'import'): Promise<ImportResult> => {
    const args = buildCurlArgs(phase);

    if (username) {
      args.splice(args.length - 1, 0, '-F', toFormArg(authLoginFieldName, username));
    }

    if (password) {
      args.splice(args.length - 1, 0, '-F', toFormArg(authPasswordFieldName, password));
    }

    if (timeoutSeconds) {
      args.splice(4, 0, '--max-time', `${timeoutSeconds}`);
    }

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
            stderr = `${stderr}${stderr ? '\n' : ''}curl terminated with signal ${signal}`;
          }
          const exitCode = typeof code === 'number' ? code : -1;

          if (stdout.trim()) {
            loggerRef.info?.('[sync-erp] curl stdout', { phase, stdout: stdout.trim() });
          }

          if (stderr.trim()) {
            loggerRef.warn?.('[sync-erp] curl stderr', { phase, stderr: stderr.trim() });
          }

          resolve({ exitCode, stdout, stderr });
        });
      });
    } catch (error) {
      loggerRef.error?.('[sync-erp] curl execution failed', { phase, error });
      throw error;
    }
  };

  const testResult = await runPhase('test');
  let testAcceptedByMarker = false;
  try {
    testAcceptedByMarker = matchesAcceptanceMarker(testResult.stdout);
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
    matchedMarker: testAcceptedByMarker
  });

  if (testResult.exitCode !== 0 || !testAcceptedByMarker) {
    return {
      test: {
        ...testResult,
        phase: 'test',
        acceptedByMarker: testAcceptedByMarker
      },
      import: null,
      markerValidationPassed: false
    };
  }

  const importResult = await runPhase('import');
  const importAcceptedByMarker = importResult.exitCode === 0;
  loggerRef.info?.('[sync-erp] ERP phase validation', {
    phase: 'import',
    exitCode: importResult.exitCode,
    matchedMarker: importAcceptedByMarker
  });

  return {
    test: {
      ...testResult,
      phase: 'test',
      acceptedByMarker: testAcceptedByMarker
    },
    import: {
      ...importResult,
      phase: 'import',
      acceptedByMarker: importAcceptedByMarker
    },
    markerValidationPassed: true
  };
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
          phases: {
            test: {
              status: curlResult.test.exitCode === 0 ? 'failed-validation' : 'failed-execution',
              exitCode: curlResult.test.exitCode,
              matchedMarker: curlResult.test.acceptedByMarker,
              stdout: testStdout,
              stderr: testStderr
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
          phases: {
            test: {
              status: 'passed',
              exitCode: curlResult.test.exitCode,
              matchedMarker: curlResult.test.acceptedByMarker
            },
            import: {
              status: 'failed',
              exitCode: curlResult.import?.exitCode ?? -1,
              matchedMarker: curlResult.import?.acceptedByMarker ?? false,
              stderr: curlResult.import?.stderr ?? '',
              stdout: curlResult.import?.stdout ?? ''
            }
          }
        });
      }

      return sendJson(res, 200, {
        ok: true,
        phases: {
          test: {
            status: 'passed',
            exitCode: curlResult.test.exitCode,
            matchedMarker: curlResult.test.acceptedByMarker
          },
          import: {
            status: 'passed',
            exitCode: curlResult.import.exitCode,
            matchedMarker: curlResult.import.acceptedByMarker
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
