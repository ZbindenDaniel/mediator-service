import path from 'path';
import { MEDIA_STORAGE_MODE, WEB_DAV_DIR } from '../config';

// TODO(media-storage): Drop local-mode override support fully once deprecation window is complete.
const DEFAULT_MEDIA_DIR = path.join(__dirname, '..', 'media');

function resolveMediaDir(): string {
  let resolved = DEFAULT_MEDIA_DIR;

  if (MEDIA_STORAGE_MODE === 'webdav') {
    if (WEB_DAV_DIR) {
      resolved = WEB_DAV_DIR;
    } else {
      console.warn('[media] WEB_DAV_DIR missing; falling back to default media directory.');
    }
  }

  if (resolved !== DEFAULT_MEDIA_DIR) {
    console.info('[media] Media directory override resolved', {
      mode: MEDIA_STORAGE_MODE,
      resolved,
      defaultDir: DEFAULT_MEDIA_DIR
    });
  }

  return resolved;
}

export const MEDIA_DIR = resolveMediaDir();

export function resolveMediaPath(...segments: string[]): string {
  return path.join(MEDIA_DIR, ...segments);
}
