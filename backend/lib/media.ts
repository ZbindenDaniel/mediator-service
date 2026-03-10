import path from 'path';
import { MEDIA_ERP_ROOT, MEDIA_ROOT_DIR, MEDIA_STAGING_DIR, MEDIA_STORAGE_MODE, MEDIA_SYNC_TARGET_DIR } from '../config';

// TODO(media-storage): Confirm resolved media directories once storage modes are in production use.
// TODO(webdav-feedback): Confirm startup logging format with operators once WebDAV mounts are deployed.
// TODO(media-storage): Ensure startup logs are consistently surfaced in container deployments.
// TODO(media-tests): Cover media directory resolution error handling and overrides.
function resolveMediaRoots(): {
  fetchRoots: string[];
  uploadRoot: string;
  syncSourceRoot: string;
  syncTargetRoot: string | null;
  writableRoot: string;
} {
  const fetchRoots = Array.from(new Set([MEDIA_STAGING_DIR, MEDIA_ERP_ROOT].filter((value) => Boolean(value))));
  const uploadRoot = MEDIA_STAGING_DIR;
  const syncSourceRoot = MEDIA_STAGING_DIR;
  const syncTargetRoot = MEDIA_SYNC_TARGET_DIR || null;
  const writableRoot = MEDIA_STAGING_DIR;

  console.info('[media] Media roots resolved', {
    mode: MEDIA_STORAGE_MODE,
    mediaRootDir: MEDIA_ROOT_DIR || null,
    mediaErpRoot: MEDIA_ERP_ROOT,
    mediaStagingDir: MEDIA_STAGING_DIR,
    mediaSyncTargetDir: syncTargetRoot,
    fetchRoots,
    writableRoot,
    baseDir: process.cwd()
  });

  return {
    fetchRoots,
    uploadRoot,
    syncSourceRoot,
    syncTargetRoot,
    writableRoot
  };
}

const resolvedMediaRoots = resolveMediaRoots();

export const MEDIA_DIR = resolvedMediaRoots.uploadRoot;

export function resolveMediaPath(...segments: string[]): string {
  return path.join(MEDIA_DIR, ...segments);
}

export function resolveFetchMediaPaths(...segments: string[]): string[] {
  return resolvedMediaRoots.fetchRoots.map((root) => path.join(root, ...segments));
}

export function resolveUploadMediaPath(...segments: string[]): string {
  return path.join(resolvedMediaRoots.uploadRoot, ...segments);
}

export function resolveSyncSourceMediaPath(...segments: string[]): string {
  return path.join(resolvedMediaRoots.syncSourceRoot, ...segments);
}

export function resolveSyncTargetMediaPath(...segments: string[]): string | null {
  if (!resolvedMediaRoots.syncTargetRoot) {
    return null;
  }

  return path.join(resolvedMediaRoots.syncTargetRoot, ...segments);
}

export function formatArtikelNummerForMedia(
  value: string | null | undefined,
  logger: Pick<Console, 'warn' | 'error'> = console
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    const trimmed = typeof value === 'string' ? value.trim() : String(value);
    if (!trimmed) {
      return null;
    }
    if (/^\d+$/u.test(trimmed)) {
      const formatted = trimmed.padStart(6, '0');
      if (formatted.length > 6) {
        logger.warn?.('[media] Artikel_Nummer exceeds 6 digits for media folder; using raw value.', {
          provided: trimmed,
          formatted
        });
      }
      return formatted;
    }
    logger.warn?.('[media] Artikel_Nummer is non-numeric for media folder; using raw value.', {
      provided: trimmed
    });
    return trimmed;
  } catch (error) {
    logger.error?.('[media] Failed to format Artikel_Nummer for media folder; using raw value.', {
      error,
      provided: value
    });
    return typeof value === 'string' ? value.trim() : String(value);
  }
}

export function resolveMediaFolder(
  itemId: string,
  artikelNummer?: string | null,
  logger: Pick<Console, 'warn' | 'error' | 'info'> = console
): string {
  const formatted = formatArtikelNummerForMedia(artikelNummer, logger);
  if (formatted) {
    return formatted;
  }

  logger.warn?.('[media] Missing Artikel_Nummer for media folder; using legacy ItemUUID fallback during migration window', {
    itemId
  });
  return itemId;
}
