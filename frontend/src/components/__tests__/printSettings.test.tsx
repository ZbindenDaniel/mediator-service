describe('AUTO_PRINT_ITEM_LABEL_CONFIG', () => {
  const originalProcessValue = process.env.AUTO_PRINT_ITEM_LABEL;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    if (originalProcessValue === undefined) {
      delete process.env.AUTO_PRINT_ITEM_LABEL;
    } else {
      process.env.AUTO_PRINT_ITEM_LABEL = originalProcessValue;
    }
    delete (globalThis as { __APP_CONFIG__?: Record<string, unknown> }).__APP_CONFIG__;
  });

  function loadConfig(options?: { globalRaw?: string; processRaw?: string }) {
    if (typeof options?.globalRaw === 'string') {
      (globalThis as { __APP_CONFIG__?: Record<string, unknown> }).__APP_CONFIG__ = {
        AUTO_PRINT_ITEM_LABEL: options.globalRaw
      };
    } else {
      delete (globalThis as { __APP_CONFIG__?: Record<string, unknown> }).__APP_CONFIG__;
    }

    if (typeof options?.processRaw === 'string') {
      process.env.AUTO_PRINT_ITEM_LABEL = options.processRaw;
    } else {
      delete process.env.AUTO_PRINT_ITEM_LABEL;
    }

    let loaded: {
      config: { enabled: boolean; hadInput: boolean; invalid: boolean; rawValue: string | null };
      logger: { info: jest.Mock; warn: jest.Mock };
    } | null = null;

    jest.isolateModules(() => {
      jest.doMock('../../utils/logger', () => ({
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        }
      }));

      const { AUTO_PRINT_ITEM_LABEL_CONFIG } = require('../../utils/printSettings');
      const { logger } = require('../../utils/logger');
      loaded = {
        config: AUTO_PRINT_ITEM_LABEL_CONFIG,
        logger
      };
    });

    if (!loaded) {
      throw new Error('Failed to load printSettings module in isolation.');
    }

    return loaded;
  }

  it('defaults to disabled with unset configuration', () => {
    const { config, logger } = loadConfig();

    expect(config).toEqual({
      enabled: false,
      hadInput: false,
      invalid: false,
      rawValue: null
    });

    expect(logger.info).toHaveBeenCalledWith(
      '[ui] AUTO_PRINT_ITEM_LABEL resolved configuration.',
      expect.objectContaining({ source: 'unset', enabled: false })
    );
  });

  it('parses valid truthy and falsy values from process.env', () => {
    const trueResult = loadConfig({ processRaw: ' true ' });
    expect(trueResult.config).toEqual({
      enabled: true,
      hadInput: true,
      invalid: false,
      rawValue: ' true '
    });
    expect(trueResult.logger.info).toHaveBeenCalledWith(
      '[ui] AUTO_PRINT_ITEM_LABEL resolved configuration.',
      expect.objectContaining({ source: 'process', enabled: true })
    );

    const falseResult = loadConfig({ processRaw: 'off' });
    expect(falseResult.config).toEqual({
      enabled: false,
      hadInput: true,
      invalid: false,
      rawValue: 'off'
    });
    expect(falseResult.logger.info).toHaveBeenCalledWith(
      '[ui] AUTO_PRINT_ITEM_LABEL resolved configuration.',
      expect.objectContaining({ source: 'process', enabled: false })
    );
  });

  it('marks invalid values and logs fallback warning', () => {
    const { config, logger } = loadConfig({ processRaw: 'definitely' });

    expect(config).toEqual({
      enabled: false,
      hadInput: true,
      invalid: true,
      rawValue: 'definitely'
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '[ui] AUTO_PRINT_ITEM_LABEL is misconfigured; defaulting to disabled.',
      expect.objectContaining({ value: 'definitely' })
    );
  });

  it('prefers global runtime config over process.env when both are present', () => {
    const { config, logger } = loadConfig({
      globalRaw: 'true',
      processRaw: 'false'
    });

    expect(config).toEqual({
      enabled: true,
      hadInput: true,
      invalid: false,
      rawValue: 'true'
    });
    expect(logger.info).toHaveBeenCalledWith(
      '[ui] AUTO_PRINT_ITEM_LABEL resolved configuration.',
      expect.objectContaining({ source: 'global', enabled: true })
    );
  });
});
