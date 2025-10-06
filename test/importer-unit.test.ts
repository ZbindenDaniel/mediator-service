import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_ITEM_UNIT } from '../models';

describe('backend importer unit handling', () => {
  test('defaults Einheit to Stück when CSV omits value', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'importer-unit-'));
    const csvPath = path.join(tmpDir, 'items.csv');
    fs.writeFileSync(
      csvPath,
      'ItemUUID,BoxID,Artikel-Nummer,Artikelbeschreibung,Auf_Lager,Einheit\n' +
        'I-000001,B-000001,SKU-1,Sample Item,3,\n'
    );

    const recordedItems: any[] = [];
    const recordedBoxes: any[] = [];
    const dbPath = require.resolve('../backend/db');
    const importerPath = require.resolve('../backend/importer');
    const originalDbModule = require.cache[dbPath];
    const originalImporterModule = require.cache[importerPath];

    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: {
        upsertBox: { run: (box: any) => recordedBoxes.push(box) },
        upsertItem: { run: (item: any) => recordedItems.push(item) },
        queueLabel: { run: () => {} }
      }
    } as NodeModule;

    delete require.cache[importerPath];
    const importer = require('../backend/importer');

    try {
      const result = await importer.ingestCsvFile(csvPath);
      expect(result.count).toBe(1);
      expect(recordedBoxes.length).toBe(1);
      expect(recordedItems.length).toBe(1);
      expect(recordedItems[0].Einheit).toBe(DEFAULT_ITEM_UNIT);
    } finally {
      if (originalImporterModule) {
        require.cache[importerPath] = originalImporterModule;
      } else {
        delete require.cache[importerPath];
      }
      if (originalDbModule) {
        require.cache[dbPath] = originalDbModule;
      } else {
        delete require.cache[dbPath];
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
