const fs = require('fs');
const path = require('path');

const ENV_FILE_PATH = path.resolve(process.cwd(), '.env');

let envLoaded = false;
let dotenv;
try {
  dotenv = require('dotenv');
} catch (error) {
  if (error && error.code !== 'MODULE_NOT_FOUND') {
    console.error('[config] Failed to require dotenv', error);
  }
}

if (dotenv) {
  try {
    const result = dotenv.config();
    if (result.error) {
      console.warn('[config] .env file could not be loaded via dotenv:', result.error.message);
    } else if (result.parsed) {
      envLoaded = true;
      console.info('[config] Environment variables loaded from .env via dotenv');
    }
  } catch (error) {
    console.error('[config] Failed to initialize environment configuration via dotenv', error);
  }
}

if (!envLoaded) {
  try {
    if (fs.existsSync(ENV_FILE_PATH)) {
      const fileContents = fs.readFileSync(ENV_FILE_PATH, 'utf8');
      fileContents.split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
          return;
        }
        const equalsIndex = line.indexOf('=');
        if (equalsIndex === -1) {
          return;
        }
        const key = line.slice(0, equalsIndex).trim();
        if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
          return;
        }
        const value = line.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      });
      envLoaded = true;
      console.info('[config] Environment variables loaded from .env via fallback parser');
    }
  } catch (error) {
    console.error('[config] Fallback .env parsing failed', error);
  }
}

if (!envLoaded) {
  console.info('[config] Proceeding without .env overrides; defaults and existing environment will be used.');
}

module.exports = {
  HOSTNAME: '0.0.0.0',
  HTTP_PORT: parseInt(process.env.HTTP_PORT || "8080", 10),
  DB_PATH: process.env.DB_PATH || "./data/mediator.sqlite",
  INBOX_DIR: process.env.INBOX_DIR || "./data/inbox",
  ARCHIVE_DIR: process.env.ARCHIVE_DIR || "./data/archive",
  PRINTER_QUEUE: (process.env.PRINTER_QUEUE || process.env.PRINTER_HOST || "").trim(),
  LP_COMMAND: (process.env.LP_COMMAND || 'lp').trim() || 'lp',
  LPSTAT_COMMAND: (process.env.LPSTAT_COMMAND || 'lpstat').trim() || 'lpstat',
  PRINT_TIMEOUT_MS: (() => {
    const parsed = parseInt(process.env.PRINT_TIMEOUT_MS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
  })(),
  BASE_QR_URL: process.env.BASE_QR_URL || "http://localhost:8080/qr",
  BASE_UI_URL: process.env.BASE_UI_URL || "http://localhost:8080/ui"  // ← NEW, used for box QR
};
