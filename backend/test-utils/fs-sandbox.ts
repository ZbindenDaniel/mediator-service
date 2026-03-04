import fs from 'fs';
import os from 'os';
import path from 'path';

export interface FsSandbox {
  distMediaDir: string;
  tempRoot: string;
  cleanup: () => Promise<void>;
  importFresh: <TModule>(modulePath: string, fromDir?: string) => TModule;
  removeOwnedPath: (targetPath: string) => Promise<void>;
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function createFsSandbox(prefix = 'media-fs-sandbox-'): FsSandbox {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const distMediaDir = path.join(tempRoot, 'dist', 'media');

  const originalCwd = process.cwd();
  const originalMediaStorageMode = process.env.MEDIA_STORAGE_MODE;
  const originalMediaRootDir = process.env.MEDIA_ROOT_DIR;

  process.env.MEDIA_STORAGE_MODE = 'local';
  process.env.MEDIA_ROOT_DIR = '';
  process.chdir(tempRoot);

  const removeOwnedPath = async (targetPath: string): Promise<void> => {
    const resolvedTarget = path.resolve(targetPath);
    if (!isPathInsideRoot(tempRoot, resolvedTarget)) {
      throw new Error(`[fs-sandbox] Refusing cleanup outside sandbox root: ${resolvedTarget}`);
    }

    try {
      await fs.promises.rm(resolvedTarget, { recursive: true, force: true });
    } catch (error) {
      console.error('[fs-sandbox] Failed to remove owned sandbox path', { tempRoot, resolvedTarget, error });
      throw error;
    }
  };

  const importFresh = <TModule>(modulePath: string, fromDir = process.cwd()): TModule => {
    const resolvedModulePath = require.resolve(modulePath, { paths: [fromDir] });
    let loadedModule: TModule | null = null;

    jest.isolateModules(() => {
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
      loadedModule = require(resolvedModulePath) as TModule;
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
      const media = require('../lib/media') as { MEDIA_DIR: string };
      const resolvedMediaDir = path.resolve(media.MEDIA_DIR);
      if (!isPathInsideRoot(tempRoot, resolvedMediaDir)) {
        throw new Error(
          `[fs-sandbox] Media root escaped sandbox. mediaDir=${resolvedMediaDir} tempRoot=${tempRoot}`
        );
      }
    });

    if (!loadedModule) {
      throw new Error(`[fs-sandbox] Failed to import module ${resolvedModulePath}`);
    }

    return loadedModule;
  };

  const cleanup = async (): Promise<void> => {
    try {
      process.chdir(originalCwd);
      if (originalMediaStorageMode === undefined) {
        delete process.env.MEDIA_STORAGE_MODE;
      } else {
        process.env.MEDIA_STORAGE_MODE = originalMediaStorageMode;
      }
      if (originalMediaRootDir === undefined) {
        delete process.env.MEDIA_ROOT_DIR;
      } else {
        process.env.MEDIA_ROOT_DIR = originalMediaRootDir;
      }
      await removeOwnedPath(tempRoot);
    } catch (error) {
      console.error('[fs-sandbox] Failed to cleanup sandbox', { tempRoot, error });
      throw error;
    }
  };

  return {
    tempRoot,
    distMediaDir,
    importFresh,
    removeOwnedPath,
    cleanup,
  };
}
