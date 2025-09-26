import path from 'path';

export const HOSTNAME = 'http://192.168.1.19';
export const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data/mediator.sqlite');
export const INBOX_DIR = process.env.INBOX_DIR || path.join(__dirname, 'data/inbox');
export const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(__dirname, 'data/archive');
export const AGENTIC_SHARED_SECRET = process.env.AGENTIC_SHARED_SECRET || '';
