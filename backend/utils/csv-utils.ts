import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import { pipeline } from 'stream/promises';

// TODO(agent): Evaluate migrating archive helpers into a dedicated module if ZIP handling expands beyond CSV ingestion.

export type DuplicateCheck = {
  reason: 'name' | 'checksum';
  entry: string;
};

// TODO(agent): Pull shared unzip timeout configuration into a central utility once more call sites need it.

export type ZipProcessErrorKind = 'timeout' | 'password' | 'spawn' | 'exit';

export class ZipProcessError extends Error {
  kind: ZipProcessErrorKind;

  constructor(kind: ZipProcessErrorKind, message: string) {
    super(message);
    this.name = 'ZipProcessError';
    this.kind = kind;
  }
}

export type ZipProcessOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function normalizeCsvFilename(raw: unknown): string {
  const fallback = 'upload.csv';
  const rawValue = typeof raw === 'string'
    ? raw
    : Array.isArray(raw)
    ? raw[0] ?? fallback
    : fallback;
  const trimmed = rawValue.trim() || fallback;
  const sanitized = trimmed.replace(/[^\w.\-]/g, '_');
  const ensured = sanitized.toLowerCase().endsWith('.csv') ? sanitized : `${sanitized}.csv`;
  return ensured;
}

export function normalizeArchiveFilename(raw: unknown): string {
  const fallback = 'upload.zip';
  const rawValue = typeof raw === 'string'
    ? raw
    : Array.isArray(raw)
      ? raw[0] ?? fallback
      : fallback;
  const trimmed = rawValue.trim() || fallback;
  const sanitized = trimmed.replace(/[^\w.\-]/g, '_');
  const ensured = sanitized.toLowerCase().endsWith('.zip') ? sanitized : `${sanitized}.zip`;
  return ensured;
}

export function normalizeCsvFilenameFromArchive(raw: unknown): string {
  const archiveName = normalizeArchiveFilename(raw);
  const stem = archiveName.replace(/\.zip$/i, '') || 'upload';
  return normalizeCsvFilename(`${stem}.csv`);
}

export function computeChecksum(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function resolveSafePath(baseDir: string, candidate: string): string | null {
  const normalised = path.normalize(candidate).replace(/^\.+/, '').replace(/^\/+/, '');
  const absolute = path.resolve(baseDir, normalised);
  const base = path.resolve(baseDir);
  if (!absolute.startsWith(base)) {
    return null;
  }
  return absolute;
}

export function listZipEntries(zipPath: string): string[] {
  try {
    const output = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.error('[csv-utils] Failed to list ZIP entries', { zipPath, error });
    return [];
  }
}

export function isSafeArchiveEntry(entry: string): boolean {
  if (!entry) return false;
  if (entry.startsWith('/') || entry.startsWith('\\')) return false;
  if (entry.includes('..')) return false;
  return true;
}

export async function readZipEntry(zipPath: string, entry: string, options: ZipProcessOptions = {}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn('unzip', ['-p', zipPath, entry]);
    let timeoutHandle: NodeJS.Timeout | null = null;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL');
      }
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    };

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        console.warn('[csv-utils] unzip timed out while reading entry', { zipPath, entry, timeoutMs: options.timeoutMs });
        fail(new ZipProcessError('timeout', 'Reading archive entry exceeded the allowed time.'));
      }, options.timeoutMs);
    }

    if (options.signal) {
      const abortHandler = () => {
        console.warn('[csv-utils] unzip aborted while reading entry', { zipPath, entry });
        fail(new ZipProcessError('timeout', 'Reading archive entry was aborted.'));
      };
      if (options.signal.aborted) {
        abortHandler();
      } else {
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => {
      console.error('[csv-utils] Failed to spawn unzip for entry', { zipPath, entry, error });
      fail(new ZipProcessError('spawn', error.message));
    });
    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (settled) return;
      if (code === 0) {
        settled = true;
        resolve(Buffer.concat(chunks));
      } else {
        const err = new ZipProcessError('exit', `unzip exited with code ${code}`);
        console.error('[csv-utils] unzip exit while reading entry', { zipPath, entry, code });
        settled = true;
        reject(err);
      }
    });
    child.stderr.on('data', (stderr) => {
      const stderrText = stderr.toString();
      console.warn('[csv-utils] unzip stderr while reading entry', { zipPath, entry, stderr: stderrText });
      if (/password/i.test(stderrText)) {
        console.warn('[csv-utils] Password prompt detected while reading entry', { zipPath, entry });
        fail(new ZipProcessError('password', 'Password-protected ZIP archives are not supported.'));
      }
    });
  });
}

export async function extractZipEntryToPath(
  zipPath: string,
  entry: string,
  destination: string,
  options: ZipProcessOptions = {}
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const unzip = spawn('unzip', ['-p', zipPath, entry]);
    let timeoutHandle: NodeJS.Timeout | null = null;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (unzip.exitCode === null && !unzip.killed) {
        unzip.kill('SIGKILL');
      }
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    };

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        console.warn('[csv-utils] unzip timed out while extracting entry', { zipPath, entry, timeoutMs: options.timeoutMs });
        fail(new ZipProcessError('timeout', 'Extracting archive entry exceeded the allowed time.'));
      }, options.timeoutMs);
    }

    if (options.signal) {
      const abortHandler = () => {
        console.warn('[csv-utils] unzip aborted while extracting entry', { zipPath, entry });
        fail(new ZipProcessError('timeout', 'Extracting archive entry was aborted.'));
      };
      if (options.signal.aborted) {
        abortHandler();
      } else {
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    unzip.on('error', (error) => {
      console.error('[csv-utils] Failed to spawn unzip for extraction', { zipPath, entry, error });
      fail(new ZipProcessError('spawn', error.message));
    });

    pipeline(unzip.stdout, fs.createWriteStream(destination)).catch((error) => {
      console.error('[csv-utils] Failed to extract ZIP entry', { zipPath, entry, destination, error });
      fail(error instanceof ZipProcessError ? error : new ZipProcessError('spawn', error.message));
    });

    unzip.stderr.on('data', (stderr) => {
      const stderrText = stderr.toString();
      console.warn('[csv-utils] unzip stderr while extracting entry', { zipPath, entry, stderr: stderrText });
      if (/password/i.test(stderrText)) {
        console.warn('[csv-utils] Password prompt detected while extracting entry', { zipPath, entry });
        fail(new ZipProcessError('password', 'Password-protected ZIP archives are not supported.'));
      }
    });

    unzip.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (settled) return;
      if (code === 0) {
        settled = true;
        resolve();
      } else {
        const err = new ZipProcessError('exit', `unzip exited with code ${code}`);
        console.error('[csv-utils] unzip exit while extracting entry', { zipPath, entry, code });
        settled = true;
        reject(err);
      }
    });
  });
}

export function findArchiveDuplicate(
  archiveDir: string,
  normalizedName: string,
  checksum?: string
): DuplicateCheck | null {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(archiveDir);
  } catch (error) {
    console.error('[csv-utils] Failed to read archive directory', archiveDir, error);
    return null;
  }

  const normalizedLower = normalizedName.toLowerCase();
  const normalizedStem = normalizedLower.replace(/\.csv$/i, '');

  for (const entry of entries) {
    const entryLower = entry.toLowerCase();
    if (!entryLower.endsWith('.csv')) continue;
    const logicalLower = entryLower.includes('_') ? entryLower.slice(entryLower.indexOf('_') + 1) : entryLower;
    const entryStem = logicalLower.replace(/\.csv$/i, '');
    if (
      logicalLower === normalizedLower ||
      entryStem === normalizedStem ||
      entryStem.startsWith(`${normalizedStem}.`)
    ) {
      return { reason: 'name', entry };
    }
  }

  if (!checksum) {
    return null;
  }

  for (const entry of entries) {
    const entryLower = entry.toLowerCase();
    if (!entryLower.endsWith('.csv')) continue;
    const entryPath = path.join(archiveDir, entry);
    try {
      const stat = fs.statSync(entryPath);
      if (!stat.isFile()) continue;
      const hash = computeChecksum(fs.readFileSync(entryPath));
      if (hash === checksum) {
        return { reason: 'checksum', entry };
      }
    } catch (error) {
      console.error('[csv-utils] Failed to hash archive entry', entryPath, error);
    }
  }

  return null;
}
