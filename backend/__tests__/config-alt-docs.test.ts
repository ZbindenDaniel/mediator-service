describe('ALT_DOC_DIRS configuration parsing', () => {
  const baselineEnv = { ...process.env };

  const loadConfig = () => {
    let exports: typeof import('../config');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      exports = require('../config');
    });
    return exports!;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...baselineEnv };
    delete process.env.ALT_DOC_DIRS;
  });

  afterAll(() => {
    process.env = baselineEnv;
  });

  it('returns empty array when ALT_DOC_DIRS is not set', () => {
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toEqual([]);
  });

  it('returns empty array when ALT_DOC_DIRS is empty string', () => {
    process.env.ALT_DOC_DIRS = '  ';
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toEqual([]);
  });

  it('parses a valid single-entry JSON array', () => {
    process.env.ALT_DOC_DIRS = JSON.stringify([
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
    process.env.ALT_DOC_DIRS = JSON.stringify([
      { name: 'wipe-reports', mountPath: '/mnt/wipe', identifierType: 'serialNumber' },
      { name: 'test-results', mountPath: '/mnt/tests', identifierType: 'ean', normalize: 'uppercase' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(2);
    expect(config.ALT_DOC_DIRS[1].normalize).toBe('uppercase');
  });

  it('skips entries with URL-style mountPath', () => {
    process.env.ALT_DOC_DIRS = JSON.stringify([
      { name: 'bad', mountPath: 'https://webdav.example.com/root', identifierType: 'ean' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(0);
  });

  it('skips entries with relative mountPath', () => {
    process.env.ALT_DOC_DIRS = JSON.stringify([
      { name: 'bad', mountPath: 'relative/path', identifierType: 'ean' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(0);
  });

  it('skips entries with invalid identifierType', () => {
    process.env.ALT_DOC_DIRS = JSON.stringify([
      { name: 'bad', mountPath: '/mnt/x', identifierType: 'uuid' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(0);
  });

  it('skips entries with invalid name characters', () => {
    process.env.ALT_DOC_DIRS = JSON.stringify([
      { name: 'bad/name', mountPath: '/mnt/x', identifierType: 'ean' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(0);
  });

  it('returns empty array for invalid JSON', () => {
    process.env.ALT_DOC_DIRS = 'not-json';
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toEqual([]);
  });

  it('returns empty array when JSON is not an array', () => {
    process.env.ALT_DOC_DIRS = '{"name":"x"}';
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toEqual([]);
  });

  it('keeps valid entries when some are invalid', () => {
    process.env.ALT_DOC_DIRS = JSON.stringify([
      { name: 'ok', mountPath: '/mnt/ok', identifierType: 'macAddress' },
      { name: 'bad', mountPath: 'http://url', identifierType: 'ean' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(1);
    expect(config.ALT_DOC_DIRS[0].name).toBe('ok');
  });

  it('normalizes null docType for entries without docType', () => {
    process.env.ALT_DOC_DIRS = JSON.stringify([
      { name: 'nodoc', mountPath: '/mnt/x', identifierType: 'ean' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS[0].docType).toBeNull();
  });

  it('accepts all three valid identifierTypes', () => {
    process.env.ALT_DOC_DIRS = JSON.stringify([
      { name: 'a', mountPath: '/mnt/a', identifierType: 'ean' },
      { name: 'b', mountPath: '/mnt/b', identifierType: 'serialNumber' },
      { name: 'c', mountPath: '/mnt/c', identifierType: 'macAddress' }
    ]);
    const config = loadConfig();
    expect(config.ALT_DOC_DIRS).toHaveLength(3);
  });
});
