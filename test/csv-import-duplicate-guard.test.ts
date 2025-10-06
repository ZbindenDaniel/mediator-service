import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

const TEST_ROOT = path.join(__dirname, 'csv-import-duplicate-guard');
const TEST_INBOX = path.join(TEST_ROOT, 'inbox');
const TEST_ARCHIVE = path.join(TEST_ROOT, 'archive');

const ORIGINAL_INBOX = process.env.INBOX_DIR;
const ORIGINAL_ARCHIVE = process.env.ARCHIVE_DIR;

process.env.INBOX_DIR = TEST_INBOX;
process.env.ARCHIVE_DIR = TEST_ARCHIVE;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const csvImportAction = require('../backend/actions/csv-import').default as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeChecksum, findArchiveDuplicate, normalizeCsvFilename } = require('../backend/utils/csv-utils');

function createRequest(body: string, filename: string): any {
  const stream = Readable.from([body]) as any;
  stream.headers = { 'x-filename': filename };
  stream.method = 'POST';
  stream.url = '/api/import';
  return stream;
}

function runAction(action: any, req: any, ctx: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const res: any = {
      status: 0,
      headers: {} as Record<string, string>,
      body: '',
      writeHead(status: number, headers: Record<string, string>) {
        this.status = status;
        this.headers = headers;
      },
      end(chunk: any) {
        this.body = chunk ? chunk.toString() : '';
        resolve(this);
      }
    };
    Promise.resolve(action.handle(req, res, ctx)).catch((error: unknown) => {
      reject(error);
    });
  });
}

function resetDirs() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TEST_INBOX, { recursive: true });
  fs.mkdirSync(TEST_ARCHIVE, { recursive: true });
}

describe('CSV import duplicate protections', () => {
  beforeEach(() => {
    resetDirs();
  });

  afterAll(() => {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
    if (ORIGINAL_INBOX === undefined) {
      delete process.env.INBOX_DIR;
    } else {
      process.env.INBOX_DIR = ORIGINAL_INBOX;
    }
    if (ORIGINAL_ARCHIVE === undefined) {
      delete process.env.ARCHIVE_DIR;
    } else {
      process.env.ARCHIVE_DIR = ORIGINAL_ARCHIVE;
    }
  });

  test('rejects re-importing the same CSV once archived', async () => {
    const csvBody = ['ItemUUID,BoxID', 'I-DUP-001,B-DUP-001', ''].join('\n');
    const ctx = { INBOX_DIR: TEST_INBOX };
    const normalizedName = normalizeCsvFilename('duplicate.csv');

    const firstReq = createRequest(csvBody, 'duplicate.csv');
    const firstRes = await runAction(csvImportAction, firstReq, ctx);
    expect(firstRes.status).toBe(200);

    const inboxEntries = fs.readdirSync(TEST_INBOX);
    expect(inboxEntries.length).toBe(1);
    const savedName = inboxEntries[0];
    const savedPath = path.join(TEST_INBOX, savedName);
    const archivedName = savedName.replace(/\.csv$/i, `.${Date.now()}.csv`);
    const archivedPath = path.join(TEST_ARCHIVE, archivedName);
    fs.renameSync(savedPath, archivedPath);

    const archivedBuffer = fs.readFileSync(archivedPath);
    const duplicateProbe = findArchiveDuplicate(
      TEST_ARCHIVE,
      normalizedName,
      computeChecksum(archivedBuffer)
    );
    expect(duplicateProbe).not.toBeNull();

    const secondReq = createRequest(csvBody, 'duplicate.csv');
    const secondRes = await runAction(csvImportAction, secondReq, ctx);
    expect(secondRes.status).toBe(409);
    const payload = JSON.parse(secondRes.body);
    expect(payload.error).toMatch(/already been processed/i);

    const inboxAfter = fs.readdirSync(TEST_INBOX);
    expect(inboxAfter.length).toBe(0);
  });
});
