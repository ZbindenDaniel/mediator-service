import fs from 'fs';
import path from 'path';
import { collectMediaAssets } from '../backend/actions/save-item';

const MEDIA_ROOT = path.join(__dirname, '../backend/media');

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

describe('collectMediaAssets', () => {
  const existingItemId = 'collect-media-existing';
  const missingItemId = 'collect-media-missing';
  const existingDir = path.join(MEDIA_ROOT, existingItemId);
  const missingDir = path.join(MEDIA_ROOT, missingItemId);

  beforeAll(() => {
    ensureDir(MEDIA_ROOT);
  });

  afterEach(() => {
    fs.rmSync(existingDir, { recursive: true, force: true });
    fs.rmSync(missingDir, { recursive: true, force: true });
  });

  test('normalises legacy Grafikname values when files exist', () => {
    ensureDir(existingDir);
    const filename = 'legacy-image.jpg';
    fs.writeFileSync(path.join(existingDir, filename), 'test');

    const assets = collectMediaAssets(existingItemId, filename);

    expect(assets).toContain(`/media/${existingItemId}/${filename}`);
  });

  test('logs and returns a fallback path for missing assets', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const missingFile = 'not-present.png';
      const assets = collectMediaAssets(missingItemId, missingFile);

      expect(assets).toContain(`/media/${missingItemId}/${missingFile}`);
      expect(warnSpy).toHaveBeenCalled();
      const warningCall = warnSpy.mock.calls.find((call) => call[0] === 'Media asset missing on disk');
      expect(warningCall).toBeTruthy();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('filters gallery assets to the current artikel number when available', () => {
    ensureDir(existingDir);
    const legacyFiles = ['07074-1.jpg', '07074-2.jpg'];
    const currentFiles = ['07075-1.jpg', '07075-2.jpg'];
    for (const file of [...legacyFiles, ...currentFiles]) {
      fs.writeFileSync(path.join(existingDir, file), 'content');
    }

    const primary = `/media/${existingItemId}/${currentFiles[0]}`;
    const assets = collectMediaAssets(existingItemId, primary, '07075');

    for (const current of currentFiles) {
      expect(assets).toContain(`/media/${existingItemId}/${current}`);
    }
    for (const legacy of legacyFiles) {
      expect(assets).not.toContain(`/media/${existingItemId}/${legacy}`);
    }
  });
});
