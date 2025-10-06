import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

export function computeChecksum(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
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
