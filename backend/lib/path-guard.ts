import path from 'path';

type GuardLogger = Pick<Console, 'error' | 'warn'>;

interface GuardContext {
  logger?: GuardLogger;
  operation?: string;
}

function isPathWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolvePathWithinRoot(
  root: string,
  candidate: string,
  context: GuardContext = {}
): string | null {
  const logger = context.logger ?? console;
  const operation = context.operation ?? 'path-resolution';

  try {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, candidate);
    if (!isPathWithinRoot(resolvedRoot, resolved)) {
      logger.warn('[path-guard] Rejected path outside allowed root', {
        root: resolvedRoot,
        candidate,
        resolved,
        operation,
      });
      return null;
    }
    return resolved;
  } catch (error) {
    logger.error('[path-guard] Failed to resolve candidate path', {
      root,
      candidate,
      resolved: null,
      operation,
      error,
    });
    return null;
  }
}

export function assertPathWithinRoot(
  root: string,
  absolutePath: string,
  context: GuardContext = {}
): string {
  const resolved = resolvePathWithinRoot(root, absolutePath, context);
  if (!resolved) {
    throw new Error(`Path is outside allowed root (${context.operation ?? 'path-assertion'}): ${absolutePath}`);
  }
  return resolved;
}

