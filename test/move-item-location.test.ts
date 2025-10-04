import { Readable } from 'stream';
import moveItem from '../backend/actions/move-item';
import { db, getBox, getItem, listItemsForExport, logEvent } from '../backend/db';

function mockReq(path: string, body: any): any {
  const payload = JSON.stringify(body);
  const stream = new Readable({ read() {} });
  stream.push(payload);
  stream.push(null);
  (stream as any).url = path;
  (stream as any).method = 'POST';
  return stream as any;
}

function runAction(action: any, req: any, ctx: any): Promise<any> {
  return new Promise((resolve) => {
    const res: any = {
      status: 0,
      headers: {} as Record<string, string>,
      writeHead(status: number, headers: Record<string, string>) {
        this.status = status;
        this.headers = headers;
      },
      end(chunk: unknown) {
        this.body = chunk;
        resolve(this);
      }
    };
    action.handle(req, res, ctx);
  });
}

describe('move-item Standort propagation', () => {
  const insertBox = db.prepare(
    "INSERT INTO boxes (BoxID, Location, CreatedAt, UpdatedAt) VALUES (?, ?, datetime('now'), datetime('now'))"
  );
  const insertItem = db.prepare(
    "INSERT INTO items (ItemUUID, BoxID, Location, UpdatedAt, Datum_erfasst) VALUES (?, ?, ?, datetime('now'), ?)"
  );
  const clearAll = () => {
    db.exec('DELETE FROM items; DELETE FROM boxes; DELETE FROM events;');
  };

  beforeEach(() => {
    clearAll();
  });

  afterAll(() => {
    clearAll();
  });

  test('moving an item into a located box copies the Standort for exports', async () => {
    insertBox.run('BOX-SOURCE', 'OLD-LOC');
    insertBox.run('BOX-DEST', 'NEW-LOC');
    insertItem.run('ITEM-1', 'BOX-SOURCE', 'OLD-LOC', '2024-05-01T00:00:00.000Z');

    const ctx = { db, getItem, getBox, logEvent };
    const req = mockReq('/api/items/ITEM-1/move', { toBoxId: 'BOX-DEST', actor: 'tester' });
    const res = await runAction(moveItem, req, ctx);

    expect(res.status).toBe(200);

    const moved = getItem.get('ITEM-1');
    expect(moved.BoxID).toBe('BOX-DEST');
    expect(moved.Location).toBe('NEW-LOC');

    const exportRows = listItemsForExport.all({ createdAfter: null, updatedAfter: null });
    expect(exportRows.length).toBe(1);
    expect(exportRows[0].Location).toBe('NEW-LOC');
  });
});

