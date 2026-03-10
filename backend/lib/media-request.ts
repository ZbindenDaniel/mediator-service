import fs from 'fs';
import path from 'path';

export function resolveSafeMediaRelativePath(rawPath: string): string | null {
  if (!rawPath) {
    return null;
  }

  try {
    const decodedPath = decodeURIComponent(rawPath);
    const normalizedPath = path.posix.normalize(decodedPath.replace(/^\/+/, ''));
    if (!normalizedPath || normalizedPath === '.' || normalizedPath.startsWith('..') || path.posix.isAbsolute(normalizedPath)) {
      return null;
    }

    const segments = normalizedPath.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      return null;
    }

    return normalizedPath;
  } catch (error) {
    console.warn('[media] Invalid media request path encoding', { rawPath, error });
    return null;
  }
}

export function resolveExistingMediaPaths(
  roots: string[],
  relativePath: string
): Array<{ root: string; filePath: string }> {
  return roots.flatMap((root) => {
    const resolvedRoot = path.resolve(root);
    const candidatePath = path.resolve(path.join(resolvedRoot, relativePath));
    const rootPrefix = `${resolvedRoot}${path.sep}`;
    if (candidatePath !== resolvedRoot && !candidatePath.startsWith(rootPrefix)) {
      console.warn('[media] Rejected media path outside configured roots', {
        relativePath,
        root: resolvedRoot,
        candidatePath
      });
      return [];
    }

    if (!fs.existsSync(candidatePath)) {
      return [];
    }

    return [{ root: resolvedRoot, filePath: candidatePath }];
  });
}
