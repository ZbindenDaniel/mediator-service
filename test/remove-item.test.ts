// process.env.DB_PATH = ':memory:';
// const { db, getItem, decrementItemStock, logEvent } = require('../backend/persistence');
// const removeItem = require('../backend/actions/remove-item').default;
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

// describe('remove-item action', () => {
//   const insertBox = db.prepare("INSERT INTO boxes (BoxID, Location, CreatedAt, UpdatedAt) VALUES (?,?,datetime('now'),datetime('now'))");
//   const insertItem = db.prepare("INSERT INTO items (ItemUUID, BoxID, Location, UpdatedAt, Auf_Lager) VALUES (?,?,?,?,?)");
//   const clearAll = () => db.exec('DELETE FROM items; DELETE FROM boxes; DELETE FROM events;');

//   beforeEach(() => clearAll());

//   test('decrements stock and clears box when last unit removed', async () => {
//     insertBox.run('B1','L');
//     insertItem.run('I1','B1','L',new Date().toISOString(),2);
//     const ctx = { db, getItem, decrementItemStock, logEvent };
//     // first removal
//     let res = await runAction(removeItem, mockReq('/api/items/I1/remove', {actor:'tester'}), ctx);
//     expect(res.status).toBe(200);
//     let item = getItem.get('I1');
//     expect(item.Auf_Lager).toBe(1);
//     expect(item.BoxID).toBe('B1');
//     // second removal clears box
//     res = await runAction(removeItem, mockReq('/api/items/I1/remove', {actor:'tester'}), ctx);
//     expect(res.status).toBe(200);
//     item = getItem.get('I1');
//     expect(item.Auf_Lager).toBe(0);
//     expect(item.BoxID).toBe('');
//     const events = db.prepare('SELECT * FROM events WHERE EntityId=? ORDER BY Id').all('I1');
//     expect(events.length).toBe(2);
//     const meta = JSON.parse(events[1].Meta);
//     expect(meta.clearedBox).toBe(true);
//   });
// });

