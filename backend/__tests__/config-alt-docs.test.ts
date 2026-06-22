import fs from 'fs';
import os from 'os';
import path from 'path';

describe('ALT_DOC_DIRS configuration parsing', () => {
  const baselineEnv = { ...process.env };
  let tmpFile: string;

  const loadConfig = () => {
    let exports: typeof import('../config');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      exports = require('../config');
    });
    return exports!;
  };

  const writeConfig = (data: unknown): string => {
    fs.writeFileSync(tmpFile, JSON.stringify(data), 'utf8');
    return tmpFile;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...baselineEnv };
    delete process.env.ALT_DOC_DIRS_FILE;
    tmpFile = path.join(os.tmpdir(), `alt-doc-dirs-test-${process.pid}.json`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  afterAll(() => {
    process.env = baselineEnv;
  });

  it('returns empty array when ALT_DOC_DIRS_FILE is not set', () => {
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toEqual([]);
  });

  it('returns empty array when ALT_DOC_DIRS_FILE points to a missing file', () => {
    process.env.ALT_DOC_DIRS_FILE = '/nonexistent/path/alt-doc-dirs.json';
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toEqual([]);
  });

  it('parses a valid single-entry JSON array', () => {
    process.env.ALT_DOC_DIRS_FILE = writeConfig([
      { name: 'wipe-reports', mountPath: '/mnt/wipe', identifierType: 'serialNumber', docType: 'Löschprotokoll' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(1);
    expect(config.ALT_DOC_DIRS[0]).toMatchObject({
      name: 'wipe-reports',
      mountPath: '/mnt/wipe',
      identifierType: 'serialNumber',
      docType: 'Löschprotokoll'
    });
  });

  it('parses multiple valid entries', () => {
    process.env.ALT_DOC_DIRS_FILE = writeConfig([
      { name: 'wipe-reports', mountPath: '/mnt/wipe', identifierType: 'serialNumber' },
      { name: 'test-results', mountPath: '/mnt/tests', identifierType: 'ean', normalize: 'uppercase' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(2);
    expect(config.ALT_DOC_DIRS[1].normalize).toBe('uppercase');
  });

  it('skips entries with URL-style mountPath', () => {
    process.env.ALT_DOC_DIRS_FILE = writeConfig([
      { name: 'bad', mountPath: 'https://webdav.example.com/root', identifierType: 'ean' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(0);
  });

  it('skips entries with relative mountPath', () => {
    process.env.ALT_DOC_DIRS_FILE = writeConfig([
      { name: 'bad', mountPath: 'relative/path', identifierType: 'ean' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(0);
  });

  it('skips entries with invalid identifierType', () => {
    process.env.ALT_DOC_DIRS_FILE = writeConfig([
      { name: 'bad', mountPath: '/mnt/x', identifierType: 'uuid' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(0);
  });

  it('skips entries with invalid name characters', () => {
    process.env.ALT_DOC_DIRS_FILE = writeConfig([
      { name: 'bad/name', mountPath: '/mnt/x', identifierType: 'ean' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(0);
  });

  it('returns empty array for invalid JSON', () => {
    fs.writeFileSync(tmpFile, 'not-json', 'utf8');
    process.env.ALT_DOC_DIRS_FILE = tmpFile;
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toEqual([]);
  });

  it('returns empty array when JSON is not an array', () => {
    process.env.ALT_DOC_DIRS_FILE = writeConfig({ name: 'x' });
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toEqual([]);
  });

  it('keeps valid entries when some are invalid', () => {
    process.env.ALT_DOC_DIRS_FILE = writeConfig([
      { name: 'ok', mountPath: '/mnt/ok', identifierType: 'macAddress' },
      { name: 'bad', mountPath: 'http://url', identifierType: 'ean' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(1);
    expect(config.ALT_DOC_DIRS[0].name).toBe('ok');
  });

  it('normalizes null docType for entries without docType', () => {
    process.env.ALT_DOC_DIRS_FILE = writeConfig([
      { name: 'nodoc', mountPath: '/mnt/x', identifierType: 'ean' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS[0].docType).toBeNull();
  });

  it('accepts all four valid identifierTypes', () => {
    process.env.ALT_DOC_DIRS_FILE = writeConfig([
      { name: 'a', mountPath: '/mnt/a', identifierType: 'ean' },
      { name: 'b', mountPath: '/mnt/b', identifierType: 'serialNumber' },
      { name: 'c', mountPath: '/mnt/c', identifierType: 'macAddress' },
      { name: 'd', mountPath: '/mnt/d', identifierType: 'artikelNummer' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(4);
  });
});
