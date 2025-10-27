import { generateItemUUID, parseSequentialItemUUID } from '../backend/lib/itemIds';

type Logger = Pick<Console, 'info' | 'warn' | 'error'> & {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

function createLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  } as Logger;
}

describe('sequential ItemUUID generation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('mints the first identifier of the day when no prior ItemUUID exists', async () => {
    const logger = createLogger();

    const id = await generateItemUUID(
      {
        now: () => new Date('2024-06-02T10:15:00.000Z'),
        getMaxItemId: () => undefined
      },
      logger
    );

    expect(id).toBe('I-020624-0001');
    const parsed = parseSequentialItemUUID(id);
    expect(parsed).toEqual({ dateSegment: '020624', sequence: 1 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('increments the daily sequence when a prior ItemUUID exists for the same day', async () => {
    const logger = createLogger();

    const id = await generateItemUUID(
      {
        now: () => new Date('2024-06-02T23:45:00.000Z'),
        getMaxItemId: () => ({ ItemUUID: 'I-020624-0042' })
      },
      logger
    );

    expect(id).toBe('I-020624-0043');
    const parsed = parseSequentialItemUUID(id);
    expect(parsed).toEqual({ dateSegment: '020624', sequence: 43 });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('resets the sequence when the latest stored ItemUUID belongs to a previous day', async () => {
    const logger = createLogger();

    const id = await generateItemUUID(
      {
        now: () => new Date('2024-06-03T00:05:00.000Z'),
        getMaxItemId: () => ({ ItemUUID: 'I-020624-0100' })
      },
      logger
    );

    expect(id).toBe('I-030624-0001');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('logs a warning and starts a new sequence when the latest ItemUUID is not sequential', async () => {
    const logger = createLogger();

    const id = await generateItemUUID(
      {
        now: () => new Date('2024-06-02T12:00:00.000Z'),
        getMaxItemId: () => ({ ItemUUID: 'I-not-a-sequential-id' })
      },
      logger
    );

    expect(id).toBe('I-020624-0001');
    const warned = logger.warn.mock.calls.some(([message]) =>
      typeof message === 'string' && message.includes('Ignoring non-sequential ItemUUID')
    );
    expect(warned).toBe(true);
  });
});
