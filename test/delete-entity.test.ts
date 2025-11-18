// process.env.DB_PATH = ':memory:';
// const { db, getItem, getBox, itemsByBox, deleteItem, deleteBox, logEvent } = require('../backend/persistence');
// const deleteEntity = require('../backend/actions/delete-entity').default;
// const { Readable } = require('stream');

// function mockReq(path: string, body: any) {
//   const r = new Readable({ read() {} });
//   r.push(JSON.stringify(body));
//   r.push(null);
//   (r as any).url = path;
//   (r as any).method = 'POST';
//   return r as any;
// }

// function runAction(action: any, req: any, ctx: any): Promise<any> {
//   return new Promise((resolve) => {
//     const res: any = {
//       writeHead(status: number, headers: any) { this.status = status; this.headers = headers; },
//       end(chunk: any) { this.body = chunk; resolve(this); }
//     };
//     action.handle(req, res, ctx);
//   });
// }

// describe('delete-entity action', () => {
//   const insertBox = db.prepare("INSERT INTO boxes (BoxID, Location, CreatedAt, UpdatedAt) VALUES (?,?,datetime('now'),datetime('now'))");
//   const insertItem = db.prepare("INSERT INTO items (ItemUUID, BoxID, Location, UpdatedAt, Auf_Lager) VALUES (?,?,?,?,?)");
//   const clearAll = () => db.exec('DELETE FROM items; DELETE FROM boxes; DELETE FROM events;');
//   const ctx = { db, getItem, getBox, itemsByBox, deleteItem, deleteBox, logEvent };

//   beforeEach(() => clearAll());

//   test('deletes an item and logs event', async () => {
//     insertBox.run('B2','L');
//     insertItem.run('I2','B2','L',new Date().toISOString(),0);
//     const res = await runAction(deleteEntity, mockReq('/api/items/I2/delete', {actor:'tester', confirm:true}), ctx);
//     expect(res.status).toBe(200);
//     const item = getItem.get('I2');
//     expect(item).toBeUndefined();
//     const events = db.prepare('SELECT * FROM events WHERE EntityId=?').all('I2');
//     expect(events.length).toBe(1);
//   });

//   test('prevents deleting non-empty box', async () => {
//     insertBox.run('B3','L');
//     insertItem.run('I3','B3','L',new Date().toISOString(),1);
//     const res = await runAction(deleteEntity, mockReq('/api/boxes/B3/delete', {actor:'tester', confirm:true}), ctx);
//     expect(res.status).toBe(400);
//     const box = getBox.get('B3');
//     expect(box).toBeDefined();
//   });
// });

