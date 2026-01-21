import path from 'path';
import { MEDIA_DIR_OVERRIDE, MEDIA_STORAGE_MODE, WEB_DAV_DIR } from '../config';

// TODO(media-storage): Confirm resolved media directories once storage modes are in production use.
// TODO(media-storage): Validate MEDIA_DIR_OVERRIDE relative path resolution conventions with deployments.
// TODO(webdav-feedback): Confirm startup logging format with operators once WebDAV mounts are deployed.
// TODO(media-tests): Cover media directory resolution error handling and overrides.
const DEFAULT_MEDIA_DIR = path.join(__dirname, '..', 'media');

function resolveMediaDir(): string {
  let resolved = DEFAULT_MEDIA_DIR;

  try {
    if (MEDIA_STORAGE_MODE === 'webdav') {
      if (WEB_DAV_DIR) {
        resolved = WEB_DAV_DIR;
      } else {
        console.warn('[media] WEB_DAV_DIR missing; falling back to default media directory.');
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

  if (resolved !== DEFAULT_MEDIA_DIR) {
    const overrideValue = MEDIA_STORAGE_MODE === 'webdav' ? WEB_DAV_DIR : MEDIA_DIR_OVERRIDE;
    console.info('[media] Media directory override resolved', {
      mode: MEDIA_STORAGE_MODE,
      override: overrideValue,
      resolved,
      defaultDir: DEFAULT_MEDIA_DIR,
      baseDir: process.cwd()
    });
  }

  return resolved;
}

export const MEDIA_DIR = resolveMediaDir();

export function resolveMediaPath(...segments: string[]): string {
  return path.join(MEDIA_DIR, ...segments);
}
