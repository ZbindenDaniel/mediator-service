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

export async function readZipEntry(zipPath: string, entry: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn('unzip', ['-p', zipPath, entry]);
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => {
      console.error('[csv-utils] Failed to spawn unzip for entry', { zipPath, entry, error });
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const err = new Error(`unzip exited with code ${code}`);
        console.error('[csv-utils] unzip exit while reading entry', { zipPath, entry, code });
        reject(err);
      }
    });
    child.stderr.on('data', (stderr) => {
      console.warn('[csv-utils] unzip stderr while reading entry', stderr.toString());
    });
  });
}

export async function extractZipEntryToPath(zipPath: string, entry: string, destination: string): Promise<void> {
  const unzip = spawn('unzip', ['-p', zipPath, entry]);
  unzip.on('error', (error) => {
    console.error('[csv-utils] Failed to spawn unzip for extraction', { zipPath, entry, error });
  });
  try {
    await pipeline(unzip.stdout, fs.createWriteStream(destination));
  } catch (error) {
    console.error('[csv-utils] Failed to extract ZIP entry', { zipPath, entry, destination, error });
    throw error;
  }
  return new Promise<void>((resolve, reject) => {
    unzip.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const err = new Error(`unzip exited with code ${code}`);
        console.error('[csv-utils] unzip exit while extracting entry', { zipPath, entry, code });
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
