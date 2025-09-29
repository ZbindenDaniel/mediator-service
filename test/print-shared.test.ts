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

    const qrResult = {
      modules: [[true, false]],
      options: { margin: 4, scale: 8, ecc: 0 },
      text: JSON.stringify(payloadBase)
    };

    const generateCalls: unknown[][] = [];
    const renderCalls: unknown[][] = [];
    const logger = createLogger();
    const logEvent = createLogEventRecorder();

    const result = buildPrintPayload({
      payloadBase,
      entityType: 'Box',
      entityId: payloadBase.id,
      labelName: 'box label',
      logContext: 'box print payload preparation',
      logEvent,
      logger: logger.logger,
      qr: {
        generate: (text, options) => {
          generateCalls.push([text, options]);
          return qrResult;
        },
        renderFromMatrix: (modules, options) => {
          renderCalls.push([modules, options]);
          return 'data:image/png;base64,box';
        }
      }
    });

    expect(result.format).toBe('inline-html');
    expect(result.payload.qrDataUri).toBe('data:image/png;base64,box');
    expect(result.payload.qrModules).toEqual(qrResult.modules);
    expect(result.payload.qrMargin).toBe(4);
    expect(generateCalls.length).toBe(1);
    expect(generateCalls[0][0]).toBe(JSON.stringify(payloadBase));
    expect(generateCalls[0][1]).toEqual({ errorCorrectionLevel: 'M', margin: 4, scale: 8 });
    expect(renderCalls.length).toBe(1);
    expect(logEvent.calls.length).toBe(1);
    expect(logEvent.calls[0]).toEqual({
      Actor: null,
      EntityType: 'Box',
      EntityId: payloadBase.id,
      Event: 'PrintPayloadPrepared',
      Meta: JSON.stringify({ format: 'inline-html' })
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

    const qrResult = {
      modules: [[true]],
      options: { margin: 2, scale: 4, ecc: 0 },
      text: JSON.stringify(payloadBase)
    };

    const logger = createLogger();
    const result = buildPrintPayload({
      payloadBase,
      entityType: 'Item',
      entityId: payloadBase.id,
      labelName: 'item label',
      logContext: 'item print payload preparation',
      logEvent: createLogEventRecorder(),
      logger: logger.logger,
      qr: {
        generate: () => qrResult,
        renderFromMatrix: () => 'data:image/png;base64,item'
      }
    });

    expect(result.payload.id).toBe(payloadBase.id);
    expect(result.payload.articleNumber).toBe('100');
    expect(result.payload.qrDataUri).toBe('data:image/png;base64,item');
    expect(result.payload.qrModules).toEqual(qrResult.modules);
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
      payloadBase,
      entityType: 'Box',
      entityId: payloadBase.id,
      labelName: 'box label',
      logContext: 'box print payload preparation',
      logEvent,
      logger: logger.logger,
      qr: {
        generate: () => {
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
  });
});
