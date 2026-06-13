import fs from 'fs';
import path from 'path';
import {
  MEDIA_STAGING_DIR,
  MEDIA_ROOT_DIR,
  MEDIA_ERP_ROOT,
  MEDIA_STORAGE_MODE,
} from '../config';

const DIR_PROBE_TIMEOUT_MS = 3000;
const IMAGE_FILE_TIMEOUT_MS = 2000;

export interface DirectoryProbeResult {
  path: string;
  accessible: boolean;
  error?: string;
}

export interface ImageProbeResult {
  sampled: number;
  accessible: number;
  unreachable: string[];
}

export interface MediaHealthResult {
  ok: boolean;
  staging: DirectoryProbeResult;
  webdav: DirectoryProbeResult | null;
  erpRoot: DirectoryProbeResult | null;
  imageProbe: ImageProbeResult | null;
}

export async function probeDirectory(dirPath: string, timeoutMs = DIR_PROBE_TIMEOUT_MS): Promise<DirectoryProbeResult> {
  const check = fs.promises.stat(dirPath).then(() => ({ path: dirPath, accessible: true as const }));
  const timeout = new Promise<DirectoryProbeResult>((resolve) =>
    setTimeout(() => resolve({ path: dirPath, accessible: false, error: 'timeout' }), timeoutMs)
  );
  try {
    return await Promise.race([check, timeout]);
  } catch (err) {
    return {
      path: dirPath,
      accessible: false,
      error: (err as NodeJS.ErrnoException).code ?? String(err),
    };
  }
}

export async function probeImageFile(fetchRoots: string[], relativePath: string): Promise<boolean> {
  const checks = fetchRoots.map((root) => {
    const filePath = path.join(root, relativePath);
    return fs.promises.stat(filePath).then(() => true, () => false);
  });
  const timeout = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), IMAGE_FILE_TIMEOUT_MS)
  );
  const allChecks = Promise.all(checks).then((rs) => rs.some(Boolean));
  return Promise.race([allChecks, timeout]);
}

export async function checkMediaDirectories(): Promise<{
  staging: DirectoryProbeResult;
  webdav: DirectoryProbeResult | null;
  erpRoot: DirectoryProbeResult | null;
}> {
  const staging = await probeDirectory(MEDIA_STAGING_DIR);

  let webdav: DirectoryProbeResult | null = null;
  let erpRoot: DirectoryProbeResult | null = null;

  if (MEDIA_STORAGE_MODE === 'webdav' && MEDIA_ROOT_DIR) {
    [webdav, erpRoot] = await Promise.all([
      probeDirectory(MEDIA_ROOT_DIR),
      probeDirectory(MEDIA_ERP_ROOT),
    ]);
  }

  return { staging, webdav, erpRoot };
}
