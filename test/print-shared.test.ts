import { buildPrintPayload } from '../backend/actions/print-shared';
import type { PrintLogEventRunner } from '../backend/actions/print-shared';
import type { BoxLabelPayload, ItemLabelPayload } from '../models';

describe('buildPrintPayload', () => {
  function createLogger() {
    const errors: unknown[][] = [];
    const warns: unknown[][] = [];
    return {
      errors,
      warns,
      logger: {
        error: (...args: unknown[]) => {
          errors.push(args);
        },
        warn: (...args: unknown[]) => {
          warns.push(args);
        }
      } as Pick<typeof console, 'error' | 'warn'>
    };
  }

  function createLogEventRecorder(): PrintLogEventRunner & { calls: unknown[] } {
    const calls: unknown[] = [];
    return {
      calls,
      run(event) {
        calls.push(event);
      }
    };
  }

  test('builds print payload for box with QR data', () => {
    const payloadBase: Omit<BoxLabelPayload, 'qrDataUri' | 'qrModules' | 'qrMargin'> = {
      id: 'B-1',
      location: null,
      notes: null,
      placedBy: null,
      placedAt: null
    };

    const matrix = [
      [true, false],
      [false, true]
    ];

    const createCalls: unknown[][] = [];
    const logger = createLogger();
    const logEvent = createLogEventRecorder();

    const result = buildPrintPayload({
      templatePath: '/print/box-label.html',
      payloadBase,
      entityType: 'Box',
      entityId: payloadBase.id,
      labelName: 'box label',
      logContext: 'box print payload preparation',
      logEvent,
      logger: logger.logger,
      qr: {
        create: (text, options) => {
          createCalls.push([text, options]);
          return {
            modules: {
              size: matrix.length,
              get: (row: number, column: number) => matrix[row][column]
            },
            options: { margin: 4 }
          };
        }
      }
    });

    expect(result.template).toBe('/print/box-label.html');
    expect(result.payload.qrDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(result.payload.qrModules).toEqual(matrix);
    expect(result.payload.qrMargin).toBe(4);
    expect(createCalls.length).toBe(1);
    expect(createCalls[0][0]).toBe(JSON.stringify(payloadBase));
    expect(createCalls[0][1]).toEqual({ margin: 4 });
    expect(logEvent.calls.length).toBe(1);
    expect(logEvent.calls[0]).toEqual({
      Actor: null,
      EntityType: 'Box',
      EntityId: payloadBase.id,
      Event: 'PrintPayloadPrepared',
      Meta: JSON.stringify({ template: '/print/box-label.html' })
    });
    expect(logger.errors.length).toBe(0);
  });

  test('builds print payload for item with QR data', () => {
    const payloadBase: Omit<ItemLabelPayload, 'qrDataUri' | 'qrModules' | 'qrMargin'> = {
      id: 'I-1',
      articleNumber: '100',
      boxId: 'B-1',
      location: 'L-1'
    };

    const matrix = [[true]];
    const logger = createLogger();
    const result = buildPrintPayload({
      templatePath: '/print/item-label.html',
      payloadBase,
      entityType: 'Item',
      entityId: payloadBase.id,
      labelName: 'item label',
      logContext: 'item print payload preparation',
      logEvent: createLogEventRecorder(),
      logger: logger.logger,
      qr: {
        create: () => ({
          modules: {
            size: matrix.length,
            get: (row: number, column: number) => matrix[row][column]
          },
          options: { margin: 2 }
        })
      }
    });

    expect(result.payload.id).toBe(payloadBase.id);
    expect(result.payload.articleNumber).toBe('100');
    expect(result.payload.qrDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(result.payload.qrModules).toEqual(matrix);
    expect(result.payload.qrMargin).toBe(2);
  });

  test('logs and recovers when QR generation fails', () => {
    const payloadBase: Omit<BoxLabelPayload, 'qrDataUri' | 'qrModules' | 'qrMargin'> = {
      id: 'B-err',
      location: null,
      notes: null,
      placedBy: null,
      placedAt: null
    };

    const logger = createLogger();
    const logEvent = createLogEventRecorder();

    const result = buildPrintPayload({
      templatePath: '/print/box-label.html',
      payloadBase,
      entityType: 'Box',
      entityId: payloadBase.id,
      labelName: 'box label',
      logContext: 'box print payload preparation',
      logEvent,
      logger: logger.logger,
      qr: {
        create: () => {
          throw new Error('QR fail');
        }
      }
    });

    expect(result.payload.qrDataUri).toBeNull();
    expect(result.payload.qrModules).toBeNull();
    expect(result.payload.qrMargin).toBe(4);
    expect(logger.errors.length).toBe(1);
    expect(logger.errors[0][0]).toBe('Failed to generate QR matrix for box label');
    expect((logger.errors[0][1] as { id: string }).id).toBe(payloadBase.id);
    expect(logEvent.calls.length).toBe(1);
    expect((logEvent.calls[0] as { Actor: string | null }).Actor).toBeNull();
  });

  test('logs actor when provided', () => {
    const payloadBase: Omit<BoxLabelPayload, 'qrDataUri' | 'qrModules' | 'qrMargin'> = {
      id: 'B-actor',
      location: 'Regal 1',
      notes: null,
      placedBy: null,
      placedAt: null
    };
    const logEvent = createLogEventRecorder();

    buildPrintPayload({
      templatePath: '/print/box-label.html',
      payloadBase,
      entityType: 'Box',
      entityId: payloadBase.id,
      labelName: 'box label',
      logEvent,
      actor: '  Tester  '
    });

    expect(logEvent.calls.length).toBe(1);
    expect(logEvent.calls[0]).toMatchObject({
      Actor: 'Tester',
      EntityId: payloadBase.id
    });
  });
});
