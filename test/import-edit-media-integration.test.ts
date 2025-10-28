// import fs from 'fs';
// import path from 'path';
// import { Readable } from 'stream';
// import importItemAction from '../backend/actions/import-item';
// import saveItemAction from '../backend/actions/save-item';
// import { MEDIA_DIR } from '../backend/lib/media';

// type MockResponse = {
//   statusCode: number;
//   headers: Record<string, string>;
//   body: string;
//   writableEnded: boolean;
//   writeHead: (status: number, headers: Record<string, string>) => void;
//   end: (chunk?: unknown) => void;
// };

// type FormRequestOptions = {
//   url?: string;
// };

// type JsonRequestOptions = {
//   method?: string;
// };

// function createFormRequest(
//   params: Record<string, string>,
//   options: FormRequestOptions = {}
// ): Readable & { method: string; headers: Record<string, string>; url?: string } {
//   const body = new URLSearchParams(params).toString();
//   const stream = Readable.from([body]) as Readable & {
//     method: string;
//     headers: Record<string, string>;
//     url?: string;
//   };
//   stream.method = 'POST';
//   stream.headers = { 'content-type': 'application/x-www-form-urlencoded' };
//   if (options.url) {
//     stream.url = options.url;
//   }
//   return stream;
// }

// function createJsonRequest(
//   url: string,
//   body: unknown,
//   options: JsonRequestOptions = {}
// ): Readable & { method: string; headers: Record<string, string>; url?: string } {
//   const payload = JSON.stringify(body ?? {});
//   const stream = Readable.from([payload]) as Readable & {
//     method: string;
//     headers: Record<string, string>;
//     url?: string;
//   };
//   stream.method = options.method ?? 'PUT';
//   stream.headers = { 'content-type': 'application/json' };
//   stream.url = url;
//   return stream;
// }

// function createResponse(): MockResponse {
//   const chunks: Buffer[] = [];
//   return {
//     statusCode: 0,
//     headers: {},
//     body: '',
//     writableEnded: false,
//     writeHead(status, headers) {
//       this.statusCode = status;
//       this.headers = headers;
//     },
//     end(chunk) {
//       if (chunk) {
//         chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
//         this.body = Buffer.concat(chunks).toString('utf8');
//       }
//       this.writableEnded = true;
//     }
//   };
// }

// describe('import + edit media integration', () => {
//   const artikelNummer = 'MAT-9000';

//   beforeEach(() => {
//     fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
//     fs.mkdirSync(MEDIA_DIR, { recursive: true });
//   });

//   afterEach(() => {
//     jest.restoreAllMocks();
//   });

//   test('stores media in shared directory for import and edit flows', async () => {
//     const items = new Map<string, any>();

//     const importCtx = {
//       agenticServiceEnabled: false,
//       getItemReference: { get: jest.fn(() => undefined) },
//       getItem: { get: jest.fn((id: string) => items.get(id)) },
//       getBox: { get: jest.fn(() => undefined) },
//       db: { transaction: (fn: any) => fn },
//       upsertBox: { run: jest.fn() },
//       persistItemWithinTransaction: jest.fn((item: any) => {
//         items.set(item.ItemUUID, { ...item });
//       }),
//       upsertAgenticRun: { run: jest.fn() },
//       getAgenticRun: { get: jest.fn(() => undefined) },
//       logEvent: jest.fn()
//     } as const;

//     const importImage = Buffer.from('import-photo-payload');
//     const importReq = createFormRequest(
//       {
//         actor: 'media-integration',
//         Artikelbeschreibung: 'Integration Item',
//         Artikel_Nummer: artikelNummer,
//         BoxID: 'BOX-9000',
//         Location: 'A-01-01',
//         picture1: `data:image/png;base64,${importImage.toString('base64')}`
//       },
//       { url: '/api/import/item' }
//     );
//     const importRes = createResponse();

//     await importItemAction.handle(importReq as any, importRes as any, importCtx as any);

//     expect(importRes.statusCode).toBe(200);
//     const importPayload = importRes.body ? JSON.parse(importRes.body) : null;
//     expect(importPayload?.ok).toBe(true);
//     const itemId: string = importPayload?.item?.ItemUUID;
//     expect(typeof itemId).toBe('string');

//     const itemDir = path.join(MEDIA_DIR, itemId);
//     const importFile = path.join(itemDir, `${artikelNummer}-1.png`);
//     expect(fs.existsSync(importFile)).toBe(true);
//     const importContents = fs.readFileSync(importFile);
//     expect(importContents.equals(importImage)).toBe(true);

//     const saveCtx = {
//       db: { transaction: (fn: any) => (...args: any[]) => fn(...args) },
//       getItem: { get: jest.fn((id: string) => items.get(id)) },
//       getBox: { get: jest.fn(() => ({ BoxID: 'BOX-9000', Location: 'A-01-01' })) },
//       listEventsForItem: { all: jest.fn(() => []) },
//       logEvent: jest.fn(),
//       persistItemWithinTransaction: jest.fn((item: any) => {
//         items.set(item.ItemUUID, { ...item });
//       }),
//       getAgenticRun: { get: jest.fn(() => null) }
//     } as const;

//     const updateImage = Buffer.from('updated-photo-payload');
//     const updateReq = createJsonRequest(`/api/items/${encodeURIComponent(itemId)}`, {
//       actor: 'media-integration',
//       Artikelbeschreibung: 'Integration Item Updated',
//       Artikel_Nummer: artikelNummer,
//       picture1: `data:image/png;base64,${updateImage.toString('base64')}`
//     });
//     const updateRes = createResponse();
//     const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

//     await saveItemAction.handle(updateReq as any, updateRes as any, saveCtx as any);

//     expect(updateRes.statusCode).toBe(200);
//     const updatePayload = updateRes.body ? JSON.parse(updateRes.body) : null;
//     expect(updatePayload?.ok).toBe(true);
//     const media = Array.isArray(updatePayload?.media) ? updatePayload.media : [];
//     expect(media).toContain(`/media/${itemId}/${artikelNummer}-1.png`);

//     const galleryWarnings = warnSpy.mock.calls.filter(([message]) =>
//       typeof message === 'string' && message.includes('Media asset missing on disk')
//     );
//     expect(galleryWarnings).toHaveLength(0);

//     const updateFile = path.join(itemDir, `${artikelNummer}-1.png`);
//     expect(fs.existsSync(updateFile)).toBe(true);
//     const updateContents = fs.readFileSync(updateFile);
//     expect(updateContents.equals(updateImage)).toBe(true);
//   });
// });
