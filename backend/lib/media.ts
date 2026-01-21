import path from 'path';
import { MEDIA_STORAGE_MODE, WEB_DAV_DIR } from '../config';

// TODO(media-storage): Confirm resolved media directories once storage modes are in production use.
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
    } 
  } catch (error) {
    console.error('[media] Failed to resolve media directory override; using default media directory.', {
      error
    });
    resolved = DEFAULT_MEDIA_DIR;
  }

  console.info('[media] Media storage resolved', {
    mode: MEDIA_STORAGE_MODE,
    resolved,
    defaultDir: DEFAULT_MEDIA_DIR,
    usingDefault: resolved === DEFAULT_MEDIA_DIR
  });

  return resolved;
}

export const MEDIA_DIR = resolveMediaDir();

export function resolveMediaPath(...segments: string[]): string {
  return path.join(MEDIA_DIR, ...segments);
}
