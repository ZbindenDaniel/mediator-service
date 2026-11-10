// save-item pulls in '../db' and '../db-client'; mock both so no database driver loads.
jest.mock('../../db', () => ({
  generateShopwareCorrelationId: jest.fn(() => 'mock-correlation-id'),
  listRecentAgenticRunReviewHistoryBySubcategory: jest.fn(async () => []),
}));

jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => {
    const client = { query: jest.fn(async () => ({ rows: [] })) };
    return fn(client);
  }),
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
}));

import fs from 'fs';
import path from 'path';
import { createFsSandbox, type FsSandbox } from '../../test-utils/fs-sandbox';

// Kivitendo stores a logical image name (`wETG.jpg`) while the WebDAV shopbilder folder holds
// timestamped files (`wETG_004644_<date>.jpg`). The item detail must list the real files.
describe('collectMediaAssets with the WebDAV shopbilder root', () => {
  let sandbox: FsSandbox;
  let collectMediaAssets: typeof import('../save-item').collectMediaAssets;
  let shopbilderDir: string;

  beforeAll(() => {
    sandbox = createFsSandbox('save-item-media-roots-');
    const webDavRoot = path.join(sandbox.tempRoot, 'webDav');
    shopbilderDir = path.join(webDavRoot, 'shopbilder');
    // createFsSandbox forces local mode; switch to webdav before the fresh import reads config.
    process.env.MEDIA_STORAGE_MODE = 'webdav';
    process.env.MEDIA_ROOT_DIR = webDavRoot;
    const mod = sandbox.importFresh<typeof import('../save-item')>('../save-item', __dirname);
    collectMediaAssets = mod.collectMediaAssets;
  });

  afterAll(async () => {
    await sandbox.cleanup();
  });

  it('lists shopbilder files by Artikel_Nummer and drops the unresolvable ERP Grafikname', () => {
    const folder = path.join(shopbilderDir, '004644');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'wETG_004644_20240620_115203.jpg'), 'a');
    fs.writeFileSync(path.join(folder, 'wETG_004644_20240620_142046.jpg'), 'b');

    const assets = collectMediaAssets('ITEM-4644', 'wETG.jpg', '4644', { includeReadOnlyRoots: true });

    expect(assets).toEqual([
      '/media/004644/wETG_004644_20240620_115203.jpg',
      '/media/004644/wETG_004644_20240620_142046.jpg'
    ]);
  });

  it('merges staging uploads and shopbilder files without duplicates, primary first', () => {
    const shop = path.join(shopbilderDir, '004700');
    const staging = path.join(sandbox.distMediaDir, '004700');
    fs.mkdirSync(shop, { recursive: true });
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(shop, 'shop_004700_1.jpg'), 'a');
    fs.writeFileSync(path.join(staging, '004700-1.jpg'), 'b');
    fs.writeFileSync(path.join(shop, '004700-1.jpg'), 'mirror');

    const assets = collectMediaAssets('ITEM-4700', '004700-1.jpg', '4700', { includeReadOnlyRoots: true });

    expect(assets).toEqual(['/media/004700/004700-1.jpg', '/media/004700/shop_004700_1.jpg']);
  });

  it('keeps the staging-only listing when read-only roots are not requested', () => {
    const shop = path.join(shopbilderDir, '004800');
    fs.mkdirSync(shop, { recursive: true });
    fs.writeFileSync(path.join(shop, 'shop_004800_1.jpg'), 'a');

    expect(collectMediaAssets('ITEM-4800', null, '4800')).toEqual([]);
  });
});
