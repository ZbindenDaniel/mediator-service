import path from 'path';

export const HOSTNAME = 'http://192.168.10.196';
export const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8080', 10);
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data/mediator.sqlite');
export const INBOX_DIR = process.env.INBOX_DIR || path.join(__dirname, 'data/inbox');
export const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(__dirname, 'data/archive');
export const PRINTER_HOST = process.env.PRINTER_HOST || 'GeBE_USB_Printer_A8';
export const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || '9100', 10);
export const BASE_QR_URL = process.env.BASE_QR_URL || 'http://localhost:8080/qr';
export const BASE_UI_URL = process.env.BASE_UI_URL || 'http://localhost:8080/ui';
export const AGENTIC_SHARED_SECRET = process.env.AGENTIC_SHARED_SECRET || '';
export const AGENTIC_API_BASE = process.env.AGENTIC_API_BASE || 'http://localhost:3000';

