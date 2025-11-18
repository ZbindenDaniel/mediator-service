// const fs = require('fs');
// const path = require('path');
// const { Readable } = require('stream');

// const DB_FILE = path.join(__dirname, 'move-item-location.test.sqlite');
// for (const suffix of ['', '-wal', '-shm']) {
//   fs.rmSync(DB_FILE + suffix, { force: true });
// }
// process.env.DB_PATH = DB_FILE;

// const moveItem = require('../backend/actions/move-item').default;
// const { db, getItem, getBox, listItemsForExport, logEvent } = require('../backend/persistence');

// const insertBox = db.prepare(
//   `INSERT INTO boxes (BoxID, Location, CreatedAt, Notes, PlacedBy, PlacedAt, UpdatedAt)
//    VALUES (?, ?, datetime('now'), NULL, NULL, NULL, datetime('now'))`
// );

// const insertItem = db.prepare(
//   `INSERT INTO items (ItemUUID, BoxID, Location, UpdatedAt, Datum_erfasst, Auf_Lager)
//    VALUES (?, ?, ?, ?, ?, ?)`
// );

// function clearAll() {
//   db.exec('DELETE FROM events; DELETE FROM items; DELETE FROM boxes;');
// }

// function mockMoveRequest(itemId, body) {
//   const req = new Readable({ read() {} });
//   req.push(JSON.stringify(body));
//   req.push(null);
//   req.url = `/api/items/${encodeURIComponent(itemId)}/move`;
//   req.method = 'POST';
//   return req;
// }

// function runAction(action, req, ctx) {
//   return new Promise((resolve) => {
//     const res = {
//       headers: {},
//       writeHead(status, headers) {
//         this.status = status;
//         this.headers = headers;
//       },
//       end(chunk) {
//         this.body = chunk;
//         resolve(this);
//       }
//     };
//     Promise.resolve(action.handle(req, res, ctx)).catch((err) => {
//       res.error = err;
//       resolve(res);
//     });
//   });
// }

// describe('move-item Standort handling', () => {
//   beforeEach(() => {
//     clearAll();
//   });

//   test('moving an item into a located box updates export Standort', async () => {
//     const fromBoxId = 'B-TEST-OLD';
//     const toBoxId = 'B-TEST-NEW';
//     const itemId = 'I-TEST-0001';
//     const actor = 'integration-test';
//     const recordedAt = new Date().toISOString();

//     insertBox.run(fromBoxId, 'OLD-LOC');
//     insertBox.run(toBoxId, 'NEW-LOC');
//     insertItem.run(itemId, fromBoxId, 'OLD-LOC', recordedAt, recordedAt, 1);

//     const ctx = { db, getItem, getBox, logEvent };
//     const req = mockMoveRequest(itemId, { toBoxId, actor });
//     const res = await runAction(moveItem, req, ctx);

//     expect(res.status).toBe(200);

//     const updated = getItem.get(itemId);
//     expect(updated.BoxID).toBe(toBoxId);
//     expect(updated.Location).toBe('NEW-LOC');

//     const exported = listItemsForExport.all({ createdAfter: null, updatedAfter: null });
//     expect(exported.length).toBe(1);
//     expect(exported[0].Location).toBe('NEW-LOC');
//   });
// });
