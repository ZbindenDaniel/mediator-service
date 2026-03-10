import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveExistingMediaPaths, resolveSafeMediaRelativePath } from '../lib/media-request';

describe('media request resolver', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-request-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns matches in root order so staging takes precedence over ERP root', () => {
    const stagingRoot = path.join(tempDir, 'staging');
    const erpRoot = path.join(tempDir, 'shopbilder');
    fs.mkdirSync(path.join(stagingRoot, '000123'), { recursive: true });
    fs.mkdirSync(path.join(erpRoot, '000123'), { recursive: true });

    const relativePath = '000123/A.jpg';
    fs.writeFileSync(path.join(stagingRoot, relativePath), 'staging-version');
    fs.writeFileSync(path.join(erpRoot, relativePath), 'erp-version');

    const matches = resolveExistingMediaPaths([stagingRoot, erpRoot], relativePath);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({
      root: path.resolve(stagingRoot),
      filePath: path.resolve(path.join(stagingRoot, relativePath))
    });
    expect(matches[1]).toEqual({
      root: path.resolve(erpRoot),
      filePath: path.resolve(path.join(erpRoot, relativePath))
    });
  });

  it('returns an empty list only after checking all allowed roots', () => {
    const stagingRoot = path.join(tempDir, 'staging');
    const erpRoot = path.join(tempDir, 'shopbilder');
    fs.mkdirSync(stagingRoot, { recursive: true });
    fs.mkdirSync(erpRoot, { recursive: true });

    const matches = resolveExistingMediaPaths([stagingRoot, erpRoot], '000123/missing.jpg');

    expect(matches).toEqual([]);
  });

  it('rejects traversal attempts before path probing', () => {
    expect(resolveSafeMediaRelativePath('../etc/passwd')).toBeNull();
    expect(resolveSafeMediaRelativePath('000123/../../escape.jpg')).toBeNull();
    expect(resolveSafeMediaRelativePath('%2e%2e/%2e%2e/escape.jpg')).toBeNull();
    expect(resolveSafeMediaRelativePath('000123/ok.jpg')).toBe('000123/ok.jpg');
  });
});
