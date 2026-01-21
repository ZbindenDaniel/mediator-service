import fs from 'fs';
import path from 'path';
import type { LangtextExportFormat } from './lib/langtext';

const ENV_FILE_PATH = path.resolve(process.cwd(), '.env');

let envLoaded = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv: typeof import('dotenv') = require('dotenv');
  const result = dotenv.config();
  if (result.error) {
    console.warn('[config] .env file could not be loaded via dotenv:', result.error.message);
  } else if (result.parsed) {
    envLoaded = true;
    console.info('[config] Environment variables loaded from .env via dotenv');
  }
} catch (error) {
  const moduleNotFound = (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND';
  if (!moduleNotFound) {
    console.error('[config] Failed to initialize environment configuration via dotenv', error);
  }
  if (!envLoaded) {
    try {
      if (fs.existsSync(ENV_FILE_PATH)) {
        const fileContents = fs.readFileSync(ENV_FILE_PATH, 'utf8');
        for (const rawLine of fileContents.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) {
            continue;
          }
          const equalsIndex = line.indexOf('=');
          if (equalsIndex === -1) {
            continue;
          }
          const key = line.slice(0, equalsIndex).trim();
          if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
            continue;
          }
          const value = line.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
          process.env[key] = value;
        }
        envLoaded = true;
        console.info('[config] Environment variables loaded from .env via fallback parser');
      }
    } catch (fsError) {
      console.error('[config] Fallback .env parsing failed', fsError);
    }
  }
}

if (!envLoaded) {
  console.info('[config] Proceeding without .env overrides; defaults and existing environment will be used.');
}

// TODO(agentic-config): Replace ad-hoc parsing with a shared zod schema that also validates agentic settings.
// TODO(langtext-export-config): Extend Langtext export format handling once UI level preferences are introduced.
// TODO(agent): Capture ERP sync configuration in a typed schema once integration stabilizes.

export const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8080', 10);
// TODO(database-migration): Remove DB_PATH fallback once all services rely on DATABASE_URL.
const DEFAULT_DB_PATH = path.join(__dirname, 'data/mediator.sqlite');
const rawDatabaseUrl = (process.env.DATABASE_URL || '').trim();
const rawDbPathEnv = (process.env.DB_PATH || '').trim();
export const DATABASE_URL = rawDatabaseUrl;
export const DB_PATH = rawDbPathEnv || DEFAULT_DB_PATH;

if (rawDatabaseUrl && rawDbPathEnv) {
  console.info('[config] DATABASE_URL provided; ignoring legacy DB_PATH override.');
} else if (!rawDatabaseUrl) {
  if (rawDbPathEnv) {
    console.warn(
      '[config] DATABASE_URL is not set; falling back to legacy DB_PATH. Verify the schema before proceeding.',
    );
  } else {
    console.warn(
      `[config] Neither DATABASE_URL nor DB_PATH environment variables are configured; defaulting to ${DB_PATH}. ` +
        'Ensure the legacy SQLite database contains the expected tables before continuing.',
    );
  }
}

export const INBOX_DIR = process.env.INBOX_DIR || path.join(__dirname, 'data/inbox');
export const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(__dirname, 'data/archive');
// TODO(media-storage): Review media storage environment names once WebDAV rollout is finalized.
// TODO(media-storage): Remove MEDIA_DIR/MEDIA_DIR_OVERRIDE after the local override deprecation window closes.
const MEDIA_STORAGE_MODE_VALUES = new Set(['local', 'webdav']);
const rawMediaStorageMode = (process.env.MEDIA_STORAGE_MODE || '').trim().toLowerCase();
let resolvedMediaStorageMode: 'local' | 'webdav' = 'local';

if (rawMediaStorageMode) {
  if (MEDIA_STORAGE_MODE_VALUES.has(rawMediaStorageMode)) {
    resolvedMediaStorageMode = rawMediaStorageMode as 'local' | 'webdav';
  } else {
    console.warn(
      `[config] Unrecognized MEDIA_STORAGE_MODE value "${rawMediaStorageMode}" supplied; defaulting to local.`
    );
  }
}

export const MEDIA_STORAGE_MODE = resolvedMediaStorageMode;
const rawMediaDir = (process.env.MEDIA_DIR || '').trim();
const rawMediaDirOverride = (process.env.MEDIA_DIR_OVERRIDE || '').trim();
export const MEDIA_DIR_OVERRIDE = (rawMediaDirOverride || rawMediaDir).trim();
export const WEB_DAV_DIR = (process.env.WEB_DAV_DIR || rawMediaDir).trim();

if (MEDIA_STORAGE_MODE === 'local') {
  const ignoredOverrides = [];
  if (rawMediaDirOverride) {
    ignoredOverrides.push('MEDIA_DIR_OVERRIDE');
  }
  if (rawMediaDir) {
    ignoredOverrides.push('MEDIA_DIR');
  }
  if (ignoredOverrides.length) {
    console.warn(
      `[config] MEDIA_STORAGE_MODE=local ignores ${ignoredOverrides.join(
        ', '
      )}; using default backend media directory.`
    );
  }
}

if (MEDIA_STORAGE_MODE === 'webdav' && !WEB_DAV_DIR) {
  console.warn('[config] MEDIA_STORAGE_MODE=webdav requires WEB_DAV_DIR; default media directory will be used.');
}

// TODO(print-queues): Confirm per-label printer queue overrides once label routing settles for all templates.
const resolvedQueue = (process.env.PRINTER_QUEUE || process.env.PRINTER_HOST || '').trim();
export const PRINTER_QUEUE = resolvedQueue;
export const PRINTER_QUEUE_BOX = (process.env.PRINTER_QUEUE_BOX || '').trim();
export const PRINTER_QUEUE_ITEM = (process.env.PRINTER_QUEUE_ITEM || '').trim();
export const PRINTER_QUEUE_SHELF = (process.env.PRINTER_QUEUE_SHELF || '').trim();
if (!PRINTER_QUEUE_BOX) {
  console.warn('[config] PRINTER_QUEUE_BOX not set; box labels will fall back to PRINTER_QUEUE.');
}
if (!PRINTER_QUEUE_ITEM) {
  console.warn('[config] PRINTER_QUEUE_ITEM not set; item labels will fall back to PRINTER_QUEUE.');
}
if (!PRINTER_QUEUE_SHELF) {
  console.warn('[config] PRINTER_QUEUE_SHELF not set; shelf labels will fall back to PRINTER_QUEUE.');
}
export const LP_COMMAND = (process.env.LP_COMMAND || 'lp').trim() || 'lp';
export const LPSTAT_COMMAND = (process.env.LPSTAT_COMMAND || 'lpstat').trim() || 'lpstat';
const parsedPrintTimeout = Number.parseInt(process.env.PRINT_TIMEOUT_MS || '', 10);
export const PRINT_TIMEOUT_MS = Number.isFinite(parsedPrintTimeout) && parsedPrintTimeout > 0 ? parsedPrintTimeout : 15000;
const DEFAULT_PUBLIC_HOSTNAME = 'localhost'; //10.196';

function parsePort(raw: string | undefined, fallback: number, label: string): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  if (raw && raw.trim()) {
    console.warn(`[config] Invalid ${label} value "${raw}" supplied; falling back to ${fallback}.`);
  }

  return fallback;
}

function parsePositiveInt(raw: string | undefined, fallback: number, label: string): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  if (raw && raw.trim()) {
    console.warn(`[config] Invalid ${label} value "${raw}" supplied; falling back to ${fallback}.`);
  }

  return fallback;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

function formatOrigin(protocol: 'http' | 'https', host: string, port: number): string {
  const normalizedHost = host.replace(/\/+$|^\/+/, '');
  const needsPort = !((protocol === 'https' && port === 443) || (protocol === 'http' && port === 80));
  return `${protocol}://${normalizedHost}${needsPort ? `:${port}` : ''}`;
}

export const TLS_CERT_PATH = (process.env.TLS_CERT_PATH || '').trim();
export const TLS_KEY_PATH = (process.env.TLS_KEY_PATH || '').trim();
export const HTTPS_PORT = parsePort(process.env.HTTPS_PORT, 8443, 'HTTPS_PORT');
export const PUBLIC_HOSTNAME =
  (process.env.PUBLIC_HOSTNAME && process.env.PUBLIC_HOSTNAME.trim()) || DEFAULT_PUBLIC_HOSTNAME;
const protocolOverride = (process.env.PUBLIC_PROTOCOL || '').trim().toLowerCase();
export const TLS_ENABLED = Boolean(TLS_CERT_PATH && TLS_KEY_PATH);
export const PUBLIC_PROTOCOL =
  protocolOverride === 'https' || protocolOverride === 'http'
    ? (protocolOverride as 'http' | 'https')
    : TLS_ENABLED
    ? 'https'
    : 'http';
export const PUBLIC_PORT = parsePort(
  process.env.PUBLIC_PORT,
  PUBLIC_PROTOCOL === 'https' ? HTTPS_PORT : HTTP_PORT,
  'PUBLIC_PORT'
);

const publicOriginOverride = stripTrailingSlash((process.env.PUBLIC_ORIGIN || '').trim());
export const PUBLIC_ORIGIN = publicOriginOverride
  ? publicOriginOverride
  : stripTrailingSlash(formatOrigin(PUBLIC_PROTOCOL, PUBLIC_HOSTNAME, PUBLIC_PORT));

function resolveBaseUrl(envValue: string | undefined, fallbackPath: string): string {
  const trimmed = stripTrailingSlash((envValue || '').trim());
  if (trimmed) {
    return trimmed;
  }
  return `${PUBLIC_ORIGIN}${fallbackPath}`;
}

export const HOSTNAME = PUBLIC_ORIGIN;
export const BASE_QR_URL = resolveBaseUrl(process.env.BASE_QR_URL, '/qr');
export const BASE_UI_URL = resolveBaseUrl(process.env.BASE_UI_URL, '/ui');

const LANGTEXT_EXPORT_FORMAT_VALUES: ReadonlySet<LangtextExportFormat> = new Set(['json', 'markdown', 'html']);
const rawLangtextExportFormat = (process.env.LANGTEXT_EXPORT_FORMAT || '').trim().toLowerCase();
let resolvedLangtextExportFormat: LangtextExportFormat = 'json';

if (rawLangtextExportFormat) {
  if (LANGTEXT_EXPORT_FORMAT_VALUES.has(rawLangtextExportFormat as LangtextExportFormat)) {
    resolvedLangtextExportFormat = rawLangtextExportFormat as LangtextExportFormat;
  } else {
    console.warn(
      `[config] Unrecognized LANGTEXT_EXPORT_FORMAT value "${rawLangtextExportFormat}" supplied; defaulting to json.`
    );
  }
}

export const LANGTEXT_EXPORT_FORMAT: LangtextExportFormat = resolvedLangtextExportFormat;

const SHOPWARE_ENABLE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const rawShopwareEnabled = (process.env.SHOPWARE_SYNC_ENABLED || process.env.SHOPWARE_QUEUE_ENABLED || '').trim().toLowerCase();
export const SHOPWARE_SYNC_ENABLED = SHOPWARE_ENABLE_VALUES.has(rawShopwareEnabled);
export const SHOPWARE_API_BASE_URL = (process.env.SHOPWARE_API_BASE_URL || '').trim();
const parsedShopwarePoll = Number.parseInt(process.env.SHOPWARE_QUEUE_POLL_INTERVAL_MS || '', 10);
export const SHOPWARE_QUEUE_POLL_INTERVAL_MS =
  Number.isFinite(parsedShopwarePoll) && parsedShopwarePoll > 0 ? parsedShopwarePoll : 5000;

if (SHOPWARE_SYNC_ENABLED && !SHOPWARE_API_BASE_URL) {
  console.warn('[config] Shopware sync enabled but SHOPWARE_API_BASE_URL is not configured.');
}

function parseBooleanFlag(raw: string | undefined, label: string): boolean | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  console.warn(`[config] Unrecognized boolean value "${raw}" for ${label}; defaulting to false.`);
  return false;
}

const importerForceZeroStockFlag =
  parseBooleanFlag(process.env.IMPORTER_FORCE_ZERO_STOCK, 'IMPORTER_FORCE_ZERO_STOCK') ?? false;
export const IMPORTER_FORCE_ZERO_STOCK = importerForceZeroStockFlag;

const erpImportIncludeMedia =
  parseBooleanFlag(process.env.ERP_IMPORT_INCLUDE_MEDIA, 'ERP_IMPORT_INCLUDE_MEDIA') ?? false;
export const ERP_IMPORT_INCLUDE_MEDIA = erpImportIncludeMedia;
export const ERP_IMPORT_URL = stripTrailingSlash((process.env.ERP_IMPORT_URL || '').trim());
export const ERP_IMPORT_USERNAME = (process.env.ERP_IMPORT_USERNAME || '').trim();
export const ERP_IMPORT_PASSWORD = (process.env.ERP_IMPORT_PASSWORD || '').trim();
export const ERP_IMPORT_FORM_FIELD = (process.env.ERP_IMPORT_FORM_FIELD || 'file').trim() || 'file';
export const ERP_IMPORT_TIMEOUT_MS = parsePositiveInt(
  process.env.ERP_IMPORT_TIMEOUT_MS,
  30000,
  'ERP_IMPORT_TIMEOUT_MS'
);
export const ERP_IMPORT_CLIENT_ID = (process.env.ERP_IMPORT_CLIENT_ID || '').trim();

export interface ShopwareCredentialsConfig {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
}

export interface ShopwareConfig {
  enabled: boolean;
  baseUrl: string | null;
  salesChannelId: string | null;
  requestTimeoutMs: number;
  credentials: ShopwareCredentialsConfig;
}

export const SHOPWARE_DEFAULT_REQUEST_TIMEOUT_MS = 10000;

const shopwareEnabled = parseBooleanFlag(process.env.SHOPWARE_ENABLED, 'SHOPWARE_ENABLED') ?? false;
const resolvedShopwareBaseUrl = stripTrailingSlash((process.env.SHOPWARE_BASE_URL || '').trim());
const shopwareBaseUrl = resolvedShopwareBaseUrl ? resolvedShopwareBaseUrl : null;
const resolvedShopwareSalesChannelId = (process.env.SHOPWARE_SALES_CHANNEL_ID || '').trim();
const shopwareSalesChannelId = resolvedShopwareSalesChannelId ? resolvedShopwareSalesChannelId : null;

const shopwareCredentials: ShopwareCredentialsConfig = {};
const resolvedShopwareClientId = (process.env.SHOPWARE_CLIENT_ID || '').trim();
const resolvedShopwareClientSecret = (process.env.SHOPWARE_CLIENT_SECRET || '').trim();
const resolvedShopwareAccessToken = (process.env.SHOPWARE_ACCESS_TOKEN || '').trim();

if (resolvedShopwareClientId) {
  shopwareCredentials.clientId = resolvedShopwareClientId;
}

if (resolvedShopwareClientSecret) {
  shopwareCredentials.clientSecret = resolvedShopwareClientSecret;
}

if (resolvedShopwareAccessToken) {
  shopwareCredentials.accessToken = resolvedShopwareAccessToken;
}

const shopwareRequestTimeoutMs = parsePositiveInt(
  process.env.SHOPWARE_REQUEST_TIMEOUT_MS,
  SHOPWARE_DEFAULT_REQUEST_TIMEOUT_MS,
  'SHOPWARE_REQUEST_TIMEOUT_MS'
);

const computedShopwareConfig: ShopwareConfig = {
  enabled: shopwareEnabled,
  baseUrl: shopwareBaseUrl,
  salesChannelId: shopwareSalesChannelId,
  requestTimeoutMs: shopwareRequestTimeoutMs,
  credentials: shopwareCredentials
};

export const SHOPWARE_CONFIG: ShopwareConfig = Object.freeze(computedShopwareConfig);

function gatherShopwareConfigIssues(config: ShopwareConfig): string[] {
  const issues: string[] = [];
  const hasBaseUrl = Boolean(config.baseUrl);
  const hasSalesChannelId = Boolean(config.salesChannelId);
  const hasClientId = Boolean(config.credentials.clientId);
  const hasClientSecret = Boolean(config.credentials.clientSecret);
  const hasAccessToken = Boolean(config.credentials.accessToken);
  const hasClientCredentials = hasClientId && hasClientSecret;

  if (config.enabled) {
    if (!hasBaseUrl) {
      issues.push('SHOPWARE_BASE_URL is required when SHOPWARE_ENABLED=true.');
    } else if (config.baseUrl && !/^https?:\/\//iu.test(config.baseUrl)) {
      issues.push('SHOPWARE_BASE_URL must start with http:// or https://.');
    }

    if (!hasSalesChannelId) {
      issues.push('SHOPWARE_SALES_CHANNEL_ID is required when SHOPWARE_ENABLED=true.');
    }

    if (hasClientId !== hasClientSecret) {
      issues.push('SHOPWARE_CLIENT_ID and SHOPWARE_CLIENT_SECRET must both be provided to use client credentials.');
    }

    if (!hasClientCredentials && !hasAccessToken) {
      issues.push('Provide either SHOPWARE_ACCESS_TOKEN or both SHOPWARE_CLIENT_ID and SHOPWARE_CLIENT_SECRET.');
    }
  } else {
    const providedValues =
      hasBaseUrl || hasSalesChannelId || hasClientId || hasClientSecret || hasAccessToken;
    if (providedValues) {
      issues.push('Shopware variables are configured but SHOPWARE_ENABLED is not true; integration remains disabled.');
    }
  }

  return issues;
}

export function getShopwareConfig(): ShopwareConfig {
  return SHOPWARE_CONFIG;
}

export function getShopwareConfigIssues(config: ShopwareConfig = SHOPWARE_CONFIG): string[] {
  return gatherShopwareConfigIssues(config);
}

export function isShopwareConfigReady(config: ShopwareConfig = SHOPWARE_CONFIG): boolean {
  return config.enabled && gatherShopwareConfigIssues(config).length === 0;
}

export function logShopwareConfigIssues(
  logger: Pick<Console, 'info' | 'warn'> = console,
  config: ShopwareConfig = SHOPWARE_CONFIG
): string[] {
  const issues = gatherShopwareConfigIssues(config);

  if (config.enabled) {
    if (issues.length === 0) {
      logger.info('[config][shopware] Shopware integration enabled.');
    } else {
      logger.warn('[config][shopware] Shopware integration enabled but incomplete:');
      for (const issue of issues) {
        logger.warn(`  - ${issue}`);
      }
    }
  } else if (issues.length === 0) {
    logger.info('[config][shopware] Shopware integration disabled.');
  } else {
    logger.info('[config][shopware] SHOPWARE_ENABLED is false; ignoring Shopware configuration values:');
    for (const issue of issues) {
      logger.info(`  - ${issue}`);
    }
  }

  return issues;
}
