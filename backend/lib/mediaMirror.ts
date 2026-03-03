import fs from 'fs/promises';
import path from 'path';

// TODO(media-mirror): Add integration coverage for very large trees and permission-denied edge cases.
export interface MirrorDirectoryResult {
  copiedFileCount: number;
  ensuredDirectoryCount: number;
}

async function ensureDirectory(targetDir: string): Promise<boolean> {
  try {
    await fs.mkdir(targetDir, { recursive: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

export async function mirrorDirectoryTree(sourceDir: string, destinationDir: string): Promise<MirrorDirectoryResult> {
  const stack: Array<{ source: string; destination: string }> = [{ source: sourceDir, destination: destinationDir }];

  let copiedFileCount = 0;
  let ensuredDirectoryCount = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    await ensureDirectory(current.destination);
    ensuredDirectoryCount += 1;

    const entries = await fs.readdir(current.source, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(current.source, entry.name);
      const destinationPath = path.join(current.destination, entry.name);

      if (entry.isDirectory()) {
        stack.push({ source: sourcePath, destination: destinationPath });
        continue;
      }

      if (entry.isFile()) {
        await fs.copyFile(sourcePath, destinationPath);
        copiedFileCount += 1;
      }
    }
  }

  return {
    copiedFileCount,
    ensuredDirectoryCount
  };
}
