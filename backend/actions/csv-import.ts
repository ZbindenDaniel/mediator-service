import type { IncomingMessage, ServerResponse } from 'http';
import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import type { Action } from './index';
import { CSV_MAX_UPLOAD_BYTES as DEFAULT_CSV_MAX_UPLOAD_BYTES } from '../config';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const LOG_PREFIX = '[csv-import]';
const HEADER_BUFFER_LIMIT = 8 * 1024; // 8KB should comfortably cover typical CSV headers

type ValidationState =
  | { status: 'pending' }
  | { status: 'valid' }
  | { status: 'invalid'; message: string };

function detectBinarySignature(buffer: Buffer): string | null {
  if (buffer.length >= 4) {
    const signature = buffer.subarray(0, 4);
    if (signature[0] === 0x50 && signature[1] === 0x4b) {
      return 'ZIP archive uploads are not supported';
    }
    if (signature[0] === 0x25 && signature[1] === 0x50 && signature[2] === 0x44 && signature[3] === 0x46) {
      return 'PDF uploads are not supported';
    }
    if (signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47) {
      return 'PNG uploads are not supported';
    }
    if (signature[0] === 0xff && signature[1] === 0xd8) {
      return 'JPEG uploads are not supported';
    }
  }
  return null;
}

function validateFirstChunk(buffer: Buffer): ValidationState {
  if (!buffer.length) {
    return { status: 'pending' };
  }

  const binarySignature = detectBinarySignature(buffer);
  if (binarySignature) {
    return { status: 'invalid', message: binarySignature };
  }

  if (buffer.includes(0)) {
    return { status: 'invalid', message: 'Binary data detected in upload' };
  }

  const text = buffer.toString('utf8');
  const newlineIndex = text.search(/\r?\n/);
  if (newlineIndex === -1) {
    if (buffer.length >= HEADER_BUFFER_LIMIT) {
      return { status: 'invalid', message: 'CSV header line is missing a newline' };
    }
    return { status: 'pending' };
  }

  const headerLine = text.slice(0, newlineIndex).replace(/^\uFEFF/, '').trim();
  if (!headerLine) {
    return { status: 'invalid', message: 'CSV header row was empty' };
  }

  const delimiter = [',', ';', '\t'].find((sep) => headerLine.includes(sep));
  if (!delimiter) {
    return { status: 'invalid', message: 'CSV header is missing a recognizable delimiter' };
  }

  const headers = headerLine.split(delimiter).map((h) => h.trim()).filter(Boolean);
  if (headers.length < 2) {
    return { status: 'invalid', message: 'CSV header must contain at least two columns' };
  }

  return { status: 'valid' };
}

async function cleanupTmpFile(filePath: string): Promise<void> {
  try {
    await fsPromises.unlink(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(`${LOG_PREFIX} failed to clean up temporary file ${filePath}`, err);
    }
  }
}

const action: Action = {
  key: 'csv-import',
  label: 'CSV import',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/import' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let name = (req.headers['x-filename'] || 'upload.csv').toString().replace(/[^\w.\-]/g, '_');
      if (!name.toLowerCase().endsWith('.csv')) name += '.csv';
      const tmpPath = path.join(ctx.INBOX_DIR, `${Date.now()}_${name}`);
      const configuredLimit = Number(ctx?.CSV_MAX_UPLOAD_BYTES ?? DEFAULT_CSV_MAX_UPLOAD_BYTES);
      const sizeLimit = Number.isFinite(configuredLimit) && configuredLimit > 0
        ? Math.floor(configuredLimit)
        : DEFAULT_CSV_MAX_UPLOAD_BYTES;
      await fsPromises.mkdir(ctx.INBOX_DIR, { recursive: true });

      let totalBytes = 0;
      let validated = false;
      let pendingBuffer = Buffer.alloc(0);

      const writeChunk = async (chunk: Buffer): Promise<boolean> => {
        if (!chunk.length) return true;
        try {
          await fsPromises.appendFile(tmpPath, chunk);
          return true;
        } catch (err) {
          console.error(`${LOG_PREFIX} failed to write upload chunk for ${name}`, err);
          await cleanupTmpFile(tmpPath);
          sendJson(res, 500, { error: 'Failed to persist uploaded CSV' });
          return false;
        }
      };

      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;

        if (totalBytes > sizeLimit) {
          console.warn(
            `${LOG_PREFIX} rejecting ${name} — payload exceeded ${sizeLimit} byte limit (received ${totalBytes})`
          );
          await cleanupTmpFile(tmpPath);
          sendJson(res, 413, { error: `Upload exceeds the ${sizeLimit} byte limit` });
          return;
        }

        if (!validated) {
          pendingBuffer = Buffer.concat([pendingBuffer, buffer]);
          const validation = validateFirstChunk(pendingBuffer);
          if (validation.status === 'invalid') {
            console.warn(`${LOG_PREFIX} rejecting ${name} — ${validation.message}`);
            await cleanupTmpFile(tmpPath);
            sendJson(res, 400, { error: validation.message });
            return;
          }
          if (validation.status === 'pending') {
            continue;
          }
          validated = true;
          if (!(await writeChunk(pendingBuffer))) {
            return;
          }
          pendingBuffer = Buffer.alloc(0);
          continue;
        }

        if (!(await writeChunk(buffer))) {
          return;
        }
      }

      if (!validated) {
        console.warn(`${LOG_PREFIX} rejecting ${name} — CSV header missing or incomplete`);
        await cleanupTmpFile(tmpPath);
        sendJson(res, 400, { error: 'CSV header missing or incomplete' });
        return;
      }

      if (!fs.existsSync(tmpPath)) {
        console.warn(`${LOG_PREFIX} rejecting ${name} — upload produced no file`);
        sendJson(res, 400, { error: 'No CSV content received' });
        return;
      }

      sendJson(res, 200, { ok: true, message: `Saved to inbox as ${path.basename(tmpPath)}` });
    } catch (err) {
      console.error('CSV import failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">CSV import API</p></div>'
};

export default action;
