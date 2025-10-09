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

export const HOSTNAME = 'http://192.168.10.196';
export const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8080', 10);
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data/mediator.sqlite');
export const INBOX_DIR = process.env.INBOX_DIR || path.join(__dirname, 'data/inbox');
export const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(__dirname, 'data/archive');
export const PRINTER_HOST = process.env.PRINTER_HOST || 'GeBE_USB_Printer_A8';
export const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || '9100', 10);
export const BASE_QR_URL = process.env.BASE_QR_URL || 'http://localhost:8080/qr';
export const BASE_UI_URL = process.env.BASE_UI_URL || 'http://localhost:8080/ui';
export const AGENTIC_SHARED_SECRET = process.env.AGENTIC_SHARED_SECRET || 'revampItIsSoCool!';
export const AGENTIC_API_BASE = process.env.AGENTIC_API_BASE || 'http://localhost:3000';

