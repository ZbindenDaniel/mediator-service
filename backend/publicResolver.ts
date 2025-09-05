import fs from 'fs';
import path from 'path';

/**
 * Resolve the public directory to use at runtime.
 * Prefers distPublic if it contains index.html, otherwise uses repoPublic if present,
 * else returns distPublic as fallback.
 */
export function resolvePublicDir(distPublic: string, repoPublic: string): string {
  try {
    if (fs.existsSync(path.join(distPublic, 'index.html'))) return distPublic;
    if (fs.existsSync(path.join(repoPublic, 'index.html'))) return repoPublic;
  } catch (e) {
    // ignore
  }
  return distPublic;
}

export default { resolvePublicDir };
