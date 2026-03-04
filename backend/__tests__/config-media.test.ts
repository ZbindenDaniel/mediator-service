import path from 'path';

describe('media configuration resolution', () => {
  const baselineEnv = { ...process.env };
  const managedKeys = [
    'MEDIA_STORAGE_MODE',
    'MEDIA_ROOT_DIR',
    'MEDIA_DIR',
    'MEDIA_DIR_OVERRIDE',
    'ERP_IMPORT_INCLUDE_MEDIA',
    'CONFIG_STRICT'
  ];

  const loadConfig = () => {
    let exports: typeof import('../config');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      exports = require('../config');
    });
    return exports!;
  };

  const loadMedia = () => {
    let exports: typeof import('../lib/media');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      exports = require('../lib/media');
    });
    return exports!;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...baselineEnv };
    for (const key of managedKeys) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    process.env = baselineEnv;
  });

  it('keeps local storage fixed to dist/media regardless of MEDIA_ROOT_DIR', () => {
    process.env.MEDIA_STORAGE_MODE = 'local';
    process.env.MEDIA_ROOT_DIR = '/mnt/media-root';

    const config = loadConfig();
    const media = loadMedia();

    expect(config.MEDIA_STORAGE_MODE).toBe('local');
    expect(config.LOCAL_MEDIA_DIR).toBe(path.resolve(process.cwd(), 'dist/media'));
    expect(media.MEDIA_DIR).toBe(config.LOCAL_MEDIA_DIR);
  });

  it('derives webdav dir from an absolute MEDIA_ROOT_DIR', () => {
    process.env.MEDIA_STORAGE_MODE = 'webdav';
    process.env.MEDIA_ROOT_DIR = '/mnt/webdav';

    const config = loadConfig();

    expect(config.WEB_DAV_DIR).toBe('/mnt/webdav/shopbilder');
  });

  it('disables webdav dir for invalid MEDIA_ROOT_DIR values', () => {
    process.env.MEDIA_STORAGE_MODE = 'webdav';
    process.env.MEDIA_ROOT_DIR = 'https://webdav.example.com/root';

    const config = loadConfig();

    expect(config.WEB_DAV_DIR).toBe('');
  });

  it('enables ERP media mirror only when include flag and valid root are both set', () => {
    process.env.ERP_IMPORT_INCLUDE_MEDIA = 'true';
    process.env.MEDIA_ROOT_DIR = '/mnt/sync';

    const enabledConfig = loadConfig();

    expect(enabledConfig.ERP_MEDIA_MIRROR_ENABLED).toBe(true);
    expect(enabledConfig.ERP_MEDIA_MIRROR_DIR).toBe('/mnt/sync/shopbilder-import');

    jest.resetModules();
    process.env.MEDIA_ROOT_DIR = '';

    const disabledConfig = loadConfig();

    expect(disabledConfig.ERP_MEDIA_MIRROR_ENABLED).toBe(false);
    expect(disabledConfig.ERP_MEDIA_MIRROR_DIR).toBe('');
  });

  it('fails startup in strict mode when unsupported MEDIA_DIR aliases are present', () => {
    process.env.CONFIG_STRICT = 'true';
    process.env.MEDIA_DIR = '/tmp/legacy-media';

    expect(() => loadConfig()).toThrow(/ignored and unsupported/);
  });
});
