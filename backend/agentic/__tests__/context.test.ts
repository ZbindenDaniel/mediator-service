// TODO(agent): Extend context normalization coverage for future locked field scenarios.

describe('prepareItemContext locked field normalization', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('removes Artikelbeschreibung from locked metadata before invoking downstream flows', async () => {
    const logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };

    const { prepareItemContext } = await import('../flow/context');

    const context = prepareItemContext(
      {
        target: {
          Artikelbeschreibung: 'Locked Artikel',
          __locked: ['Artikelbeschreibung', 'Artikel_Nummer'],
          Artikel_Nummer: 'LOCK-1001'
        }
      },
      logger
    );

    expect((context.target as Record<string, unknown>)['Artikel_Nummer']).toBe('LOCK-1001');
    expect((context.target as Record<string, unknown>)['Artikelbeschreibung']).toBe('Locked Artikel');
    expect((context.target as unknown as { __locked?: unknown[] }).__locked).toEqual(['Artikel_Nummer']);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
