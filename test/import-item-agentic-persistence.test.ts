// const fs = require('fs');
// const path = require('path');
// const { Readable } = require('stream');
// const importItemAction = require('../backend/actions/import-item').default || require('../backend/actions/import-item');

// function createRequest(body) {
//   const stream = Readable.from([body]);
//   stream.method = 'POST';
//   stream.headers = {};
//   return stream;
// }

// function createResponse() {
//   const chunks = [];
//   const res = {
//     statusCode: 0,
//     headers: {},
//     writeHead(status, headers) {
//       this.statusCode = status;
//       this.headers = headers;
//     },
//     end(chunk) {
//       if (chunk) {
//         chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
//       }
//     }
//   };

//   Object.defineProperty(res, 'body', {
//     get() {
//       return Buffer.concat(chunks).toString('utf8');
//     }
//   });

//   return res;
// }

// describe('import-item action persistence', () => {
//   const itemUUID = 'I-010101-0001';
//   const boxId = 'B-010101-0001';
//   const mediaDir = path.join(__dirname, '..', 'media', itemUUID);

//   afterEach(() => {
//     fs.rmSync(mediaDir, { force: true, recursive: true });
//   });

//   test('persists reference data when Artikel_Nummer is provided', async () => {
//     const actor = 'agentic-user';
//     const artikelNummer = 'MAT-5000';
//     const description = 'Agentic Flow Item';
//     const encodedImage = Buffer.from('agentic-image').toString('base64');

//     const form = new URLSearchParams({
//       actor,
//       BoxID: boxId,
//       ItemUUID: itemUUID,
//       Artikel_Nummer: artikelNummer,
//       Artikelbeschreibung: description,
//       Kurzbeschreibung: 'Kurz',
//       Langtext: 'Lang',
//       picture1: `data:image/png;base64,${encodedImage}`,
//       agenticStatus: 'running',
//       agenticSearch: 'Agentic Flow Item'
//     });

//     const ctx = {
//       getMaxBoxId: { get: () => ({ BoxID: boxId }) },
//       getMaxItemId: { get: () => ({ ItemUUID: itemUUID }) },
//       getBox: { get: () => undefined },
//       db: {
//         transaction: (fn) => (...args) => fn(...args)
//       },
//       upsertBox: { run: jest.fn() },
//       persistItemWithinTransaction: jest.fn(),
//       upsertAgenticRun: { run: jest.fn() },
//       logEvent: { run: jest.fn() },
//       agenticServiceEnabled: true
//     };

//     const req = createRequest(form.toString());
//     const res = createResponse();

//     await importItemAction.handle(req, res, ctx);

//     expect(res.statusCode).toBe(200);
//     const body = JSON.parse(res.body || '{}');
//     expect(body.ok).toBe(true);

//     expect(ctx.persistItemWithinTransaction).toHaveBeenCalledTimes(1);
//     const persisted = ctx.persistItemWithinTransaction.mock.calls[0][0];

//     expect(persisted.Artikel_Nummer).toBe(artikelNummer);
//     expect(persisted.Artikelbeschreibung).toBe(description);
//     expect(typeof persisted.Grafikname).toBe('string');
//     expect(persisted.Grafikname).toContain(`${itemUUID}/`);
//     expect(persisted.Grafikname).toContain(`${artikelNummer}-1`);

//     expect(fs.existsSync(mediaDir)).toBe(true);
//     const savedFiles = fs.readdirSync(mediaDir);
//     expect(savedFiles.some((file) => file.includes(`${artikelNummer}-1`))).toBe(true);
//   });
// });
