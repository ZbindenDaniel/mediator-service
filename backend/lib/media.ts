import path from 'path';
import { LOCAL_MEDIA_DIR, MEDIA_STORAGE_MODE, WEB_DAV_DIR } from '../config';

// TODO(media-storage): Confirm resolved media directories once storage modes are in production use.
// TODO(webdav-feedback): Confirm startup logging format with operators once WebDAV mounts are deployed.
// TODO(media-storage): Ensure startup logs are consistently surfaced in container deployments.
// TODO(media-tests): Cover media directory resolution error handling and overrides.
const DEFAULT_MEDIA_DIR = LOCAL_MEDIA_DIR;

function resolveMediaDir(): string {
  let resolved = DEFAULT_MEDIA_DIR;

  try {
    if (MEDIA_STORAGE_MODE === 'webdav') {
      if (WEB_DAV_DIR) {
        resolved = WEB_DAV_DIR;
      } else {
        console.warn(
          '[media] WEB_DAV_DIR missing or invalid; falling back to fixed local media directory (dist/media). ' +
            'Set MEDIA_ROOT_DIR to the mounted root for webdav mode.'
        );
      }
    } else if (MEDIA_STORAGE_MODE === 'local') {
      resolved = DEFAULT_MEDIA_DIR;
    }
  } catch (error) {
    console.error('[media] Failed to resolve media directory; using fixed local media directory.', {
      error
    });
    resolved = DEFAULT_MEDIA_DIR;
  }

  const overrideValue = MEDIA_STORAGE_MODE === 'webdav' ? WEB_DAV_DIR : null;
  console.info('[media] Media storage resolved', {
    mode: MEDIA_STORAGE_MODE,
    override: overrideValue || null,
    resolved,
    defaultDir: DEFAULT_MEDIA_DIR,
    baseDir: process.cwd()
  });

  return resolved;
}

export const MEDIA_DIR = resolveMediaDir();

export function resolveMediaPath(...segments: string[]): string {
  return path.join(MEDIA_DIR, ...segments);
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
