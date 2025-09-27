import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.HTTP_PORT = '0';
process.env.DB_PATH = path.join(__dirname, 'test-media.sqlite');
process.env.INBOX_DIR = path.join(__dirname, 'test-inbox-media');
process.env.ARCHIVE_DIR = path.join(__dirname, 'test-archive-media');

import { server as mediaServer, MEDIA_DIR } from '../backend/server';
import { upsertItem, db } from '../backend/db';

type AddressInfo = { address: string; family: string; port: number };

let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    mediaServer.listen(0, () => {
      const address = mediaServer.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    mediaServer.close(() => {
      resolve();
    });
  });
  fs.rmSync(process.env.DB_PATH || '', { force: true });
  fs.rmSync(process.env.INBOX_DIR || '', { recursive: true, force: true });
  fs.rmSync(process.env.ARCHIVE_DIR || '', { recursive: true, force: true });
});

beforeEach(() => {
  db.prepare('DELETE FROM items').run();
  db.prepare('DELETE FROM boxes').run();
  db.prepare('DELETE FROM events').run();
});

afterEach(() => {
  const mediaEntries = fs.existsSync(MEDIA_DIR) ? fs.readdirSync(MEDIA_DIR) : [];
  for (const entry of mediaEntries) {
    if (entry.startsWith('ITEM-MEDIA-')) {
      fs.rmSync(path.join(MEDIA_DIR, entry), { recursive: true, force: true });
    }
  }
});

describe('media asset routes', () => {
  test('serves media files and lists them for item detail', async () => {
    const itemId = 'ITEM-MEDIA-001';
    const dir = path.join(MEDIA_DIR, itemId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cover.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
    fs.writeFileSync(path.join(dir, 'detail.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const now = new Date().toISOString();
    upsertItem.run({
      ItemUUID: itemId,
      BoxID: null,
      Location: null,
      UpdatedAt: now,
      Datum_erfasst: now,
      Artikel_Nummer: '1000',
      Grafikname: `/media/${itemId}/cover.jpg`,
      Artikelbeschreibung: 'Test media item',
      Auf_Lager: 1,
      Verkaufspreis: null,
      Kurzbeschreibung: null,
      Langtext: null,
      Hersteller: null,
      Länge_mm: null,
      Breite_mm: null,
      Höhe_mm: null,
      Gewicht_kg: null,
      Hauptkategorien_A: null,
      Unterkategorien_A: null,
      Hauptkategorien_B: null,
      Unterkategorien_B: null,
      Veröffentlicht_Status: null,
      Shopartikel: null,
      Artikeltyp: null,
      Einheit: null,
      WmsLink: null
    });

    const res = await fetch(`${baseUrl}/api/items/${encodeURIComponent(itemId)}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.media)).toBe(true);
    expect(data.media).toContain(`/media/${itemId}/cover.jpg`);
    expect(data.media).toContain(`/media/${itemId}/detail.png`);

    const mediaRes = await fetch(`${baseUrl}/media/${itemId}/cover.jpg`);
    expect(mediaRes.status).toBe(200);
    const buf = Buffer.from(await mediaRes.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(0);

    const missing = await fetch(`${baseUrl}/media/${itemId}/missing.jpg`);
    expect(missing.status).toBe(404);
  });
});
