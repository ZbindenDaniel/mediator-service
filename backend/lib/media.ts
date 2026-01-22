import path from 'path';
import { MEDIA_DIR_OVERRIDE, MEDIA_STORAGE_MODE, WEB_DAV_DIR } from '../config';
import { parseSequentialItemUUID } from './itemIds';

// TODO(media-storage): Confirm resolved media directories once storage modes are in production use.
// TODO(media-storage): Validate MEDIA_DIR_OVERRIDE relative path resolution conventions with deployments.
// TODO(webdav-feedback): Confirm startup logging format with operators once WebDAV mounts are deployed.
// TODO(media-storage): Ensure startup logs are consistently surfaced in container deployments.
// TODO(media-tests): Cover media directory resolution error handling and overrides.
const DEFAULT_MEDIA_DIR = path.join(__dirname, '..', 'media');

function resolveMediaDir(): string {
  let resolved = DEFAULT_MEDIA_DIR;

  try {
    if (MEDIA_STORAGE_MODE === 'webdav') {
      if (WEB_DAV_DIR) {
        resolved = WEB_DAV_DIR;
      } else {
        console.warn(
          '[media] WEB_DAV_DIR missing or invalid; falling back to default media directory. ' +
            'Mount the WebDAV share and set WEB_DAV_DIR to that absolute path.'
        );
      }
    } else if (MEDIA_STORAGE_MODE === 'local' && MEDIA_DIR_OVERRIDE) {
      resolved = path.isAbsolute(MEDIA_DIR_OVERRIDE)
        ? MEDIA_DIR_OVERRIDE
        : path.resolve(process.cwd(), MEDIA_DIR_OVERRIDE);
    }
  } catch (error) {
    console.error('[media] Failed to resolve media directory override; using default media directory.', {
      error
    });
    resolved = DEFAULT_MEDIA_DIR;
  }

  const overrideValue = MEDIA_STORAGE_MODE === 'webdav' ? WEB_DAV_DIR : MEDIA_DIR_OVERRIDE;
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
  // TODO(media-folder-migration): Remove ItemUUID fallback once media assets are migrated to Artikelnummer folders.
  const formatted = formatArtikelNummerForMedia(artikelNummer, logger);
  if (formatted) {
    return formatted;
  }

  const parsed = parseSequentialItemUUID(itemId);
  if (parsed?.kind === 'artikelnummer') {
    const derived = formatArtikelNummerForMedia(parsed.artikelNummer, logger);
    if (derived) {
      logger.info?.('[media] Derived media folder from ItemUUID Artikel_Nummer segment', {
        itemId,
        artikelNummer: derived
      });
      return derived;
    }
  }

  logger.warn?.('[media] Falling back to ItemUUID for media folder', { itemId });
  return itemId;
}
