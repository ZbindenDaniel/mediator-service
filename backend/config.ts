import fs from 'fs';
import path from 'path';

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

// TODO: Consider enforcing schema validation for required environment variables.

export const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8080', 10);
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data/mediator.sqlite');
export const INBOX_DIR = process.env.INBOX_DIR || path.join(__dirname, 'data/inbox');
export const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(__dirname, 'data/archive');
const resolvedQueue = (process.env.PRINTER_QUEUE || process.env.PRINTER_HOST || '').trim();
export const PRINTER_QUEUE = resolvedQueue;
export const LP_COMMAND = (process.env.LP_COMMAND || 'lp').trim() || 'lp';
export const LPSTAT_COMMAND = (process.env.LPSTAT_COMMAND || 'lpstat').trim() || 'lpstat';
const parsedPrintTimeout = Number.parseInt(process.env.PRINT_TIMEOUT_MS || '', 10);
export const PRINT_TIMEOUT_MS = Number.isFinite(parsedPrintTimeout) && parsedPrintTimeout > 0 ? parsedPrintTimeout : 15000;
export const AGENTIC_SHARED_SECRET = process.env.AGENTIC_SHARED_SECRET || 'revampItIsSoCool!';
export const AGENTIC_API_BASE = process.env.AGENTIC_API_BASE || 'http://localhost:3000';

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

