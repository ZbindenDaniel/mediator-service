import path from 'path';

export const MEDIA_DIR = path.join(__dirname, '..', 'media');

export function resolveMediaPath(...segments: string[]): string {
  return path.join(MEDIA_DIR, ...segments);
}
