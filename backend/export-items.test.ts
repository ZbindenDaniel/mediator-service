process.env.DB_PATH = ':memory:';
const { db, listItemsForExport, logEvent } = require('../backend/db');
const exportItems = require('../backend/actions/export-items').default;
const { Readable } = require('stream');

function mockReq(path) {
  const r = new Readable({ read() {} });
  r.push(null);
  (r as any).url = path;
  (r as any).method = 'GET';
  return r as any;
}

function runAction(action, req, ctx) {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(chunk) { this.body = chunk; resolve(this); }
    } as any;
    action.handle(req, res, ctx);
  });
}

describe('export-items action', () => {
  const insertBox = db.prepare("INSERT INTO boxes (BoxID, Location, CreatedAt, UpdatedAt) VALUES (?,?,datetime('now'),datetime('now'))");
  const insertItem = db.prepare("INSERT INTO items (ItemUUID, BoxID, Location, UpdatedAt, Datum_erfasst, Auf_Lager) VALUES (?,?,?,?,?,?)");
  const clearAll = () => db.exec('DELETE FROM items; DELETE FROM boxes; DELETE FROM events;');

  beforeEach(() => clearAll());

  test('exports filtered items and logs events', async () => {
    insertBox.run('B1','L');
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const now = new Date().toISOString();
    insertItem.run('I1','B1','L',yesterday,yesterday,1);
    insertItem.run('I2','B1','L',now,now,1);
    const ctx = { db, listItemsForExport, logEvent };
    const res = await runAction(exportItems, mockReq(`/api/export/items?actor=tester&updatedAfter=${now}`), ctx);
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/csv');
    const lines = res.body.toString().trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('I2');
    const events = db.prepare("SELECT * FROM events WHERE Event='Exported'").all();
    expect(events.length).toBe(1);
    expect(events[0].EntityId).toBe('I2');
  });
});

