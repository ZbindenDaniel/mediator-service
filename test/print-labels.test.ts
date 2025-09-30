// const fs = require('fs');
// const os = require('os');
// const path = require('path');

// const printBoxAction = require('../backend/actions/print-box.ts').default;
// const printItemAction = require('../backend/actions/print-item.ts').default;

// function createResponse() {
//   return {
//     statusCode: 0,
//     headers: {},
//     body: '',
//     writeHead(status, headers) {
//       this.statusCode = status;
//       this.headers = headers;
//     },
//     end(chunk) {
//       if (!chunk) return;
//       this.body += chunk.toString();
//     }
//   };
// }

// test('print-box handler provides structured QR payload', async () => {
//   const previewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-box-'));
//   const pdfCalls = [];
//   const originalNow = Date.now;
//   Date.now = () => 1700000000000;
//   try {
//     const req = { url: '/api/print/box/BOX-1', method: 'POST' };
//     const res = createResponse();
//     const ctx = {
//       PREVIEW_DIR: previewDir,
//       getBox: { get: () => ({ BoxID: 'BOX-1', Location: 'A-01', Notes: 'Spare parts' }) },
//       itemsByBox: { all: () => [{ Auf_Lager: 2 }, { Auf_Lager: '3' }] },
//       zplForBox: () => '^XA^XZ',
//       pdfForBox: async ({ boxData, outPath }) => {
//         pdfCalls.push({ boxData, outPath });
//         fs.mkdirSync(path.dirname(outPath), { recursive: true });
//         fs.writeFileSync(outPath, 'pdf');
//         return outPath;
//       },
//       logEvent: { run: () => {} },
//       sendZpl: async () => ({ sent: true })
//     };

//     await printBoxAction.handle(req, res, ctx);

//     expect(res.statusCode).toBe(200);
//     const responseBody = JSON.parse(res.body);
//     expect(responseBody.sent).toBe(true);
//     expect(responseBody.qrPayload).toMatchObject({
//       type: 'box',
//       id: 'BOX-1',
//       location: 'A-01',
//       description: 'Spare parts',
//       quantity: 5,
//       itemCount: 2
//     });
//     expect(responseBody.previewUrl).toMatch(/\/prints\/box-BOX-1-1700000000000\.pdf/);
//     expect(pdfCalls.length).toBe(1);
//     expect(pdfCalls[0].boxData).toEqual(responseBody.qrPayload);
//     expect(fs.existsSync(path.join(previewDir, path.basename(pdfCalls[0].outPath)))).toBe(true);
//   } finally {
//     Date.now = originalNow;
//     fs.rmSync(previewDir, { recursive: true, force: true });
//   }
// });

// test('print-item handler provides structured QR payload', async () => {
//   const previewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-item-'));
//   const pdfCalls = [];
//   const originalNow = Date.now;
//   Date.now = () => 1700000001000;
//   try {
//     const req = { url: '/api/print/item/ITEM-1', method: 'POST' };
//     const res = createResponse();
//     const ctx = {
//       PREVIEW_DIR: previewDir,
//       getItem: { get: () => ({
//         ItemUUID: 'ITEM-1',
//         Artikel_Nummer: 'M-100',
//         BoxID: 'BOX-9',
//         Location: 'B-02',
//         Kurzbeschreibung: 'Widget',
//         Auf_Lager: '7'
//       }) },
//       zplForItem: () => '^XA^XZ',
//       pdfForItem: async ({ itemData, outPath }) => {
//         pdfCalls.push({ itemData, outPath });
//         fs.mkdirSync(path.dirname(outPath), { recursive: true });
//         fs.writeFileSync(outPath, 'pdf');
//         return outPath;
//       },
//       logEvent: { run: () => {} },
//       sendZpl: async () => ({ sent: true })
//     };

//     await printItemAction.handle(req, res, ctx);

//     expect(res.statusCode).toBe(200);
//     const responseBody = JSON.parse(res.body);
//     expect(responseBody.sent).toBe(true);
//     expect(responseBody.qrPayload).toMatchObject({
//       type: 'item',
//       id: 'ITEM-1',
//       materialNumber: 'M-100',
//       boxId: 'BOX-9',
//       location: 'B-02',
//       description: 'Widget',
//       quantity: 7
//     });
//     expect(responseBody.previewUrl).toMatch(/\/prints\/item-ITEM-1-1700000001000\.pdf/);
//     expect(pdfCalls.length).toBe(1);
//     expect(pdfCalls[0].itemData).toEqual(responseBody.qrPayload);
//     expect(fs.existsSync(path.join(previewDir, path.basename(pdfCalls[0].outPath)))).toBe(true);
//   } finally {
//     Date.now = originalNow;
//     fs.rmSync(previewDir, { recursive: true, force: true });
//   }
// });
