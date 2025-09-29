import { generate, renderFromMatrix } from 'qrcode';

export interface PrintLogEventRunner {
  run(event: {
    Actor: string | null;
    EntityType: string;
    EntityId: string;
    Event: string;
    Meta: string | null;
  }): unknown;
}

export interface BuildPrintPayloadOptions<PayloadBase extends Record<string, unknown>> {
  payloadBase: PayloadBase;
  entityType: string;
  entityId: string;
  labelName: string;
  logContext?: string;
  logEvent: PrintLogEventRunner;
  logger?: Pick<typeof console, 'error' | 'warn'>;
  qr?: {
    generate?: typeof generate;
    renderFromMatrix?: typeof renderFromMatrix;
  };
}

export interface PrintPayloadExtras {
  qrDataUri: string | null;
  qrModules: boolean[][] | null;
  qrMargin: number;
}

export function buildPrintPayload<PayloadBase extends Record<string, unknown>>(
  options: BuildPrintPayloadOptions<PayloadBase>
): { format: 'inline-html'; payload: PayloadBase & PrintPayloadExtras } {
  const { payloadBase, entityType, entityId, labelName, logContext, logEvent } = options;
  const logger = options.logger ?? console;

  let qrDataUri: string | null = null;
  let qrModules: boolean[][] | null = null;
  let qrMargin = 4;

  const serialized = JSON.stringify(payloadBase);
  const qrGenerate = options.qr?.generate ?? generate;
  const qrRender = options.qr?.renderFromMatrix ?? renderFromMatrix;

  try {
    const qr = qrGenerate(serialized, { errorCorrectionLevel: 'M', margin: 4, scale: 8 });
    qrModules = qr.modules;
    qrMargin = qr.options.margin;
    try {
      qrDataUri = qrRender(qr.modules, qr.options);
    } catch (qrImageErr) {
      logger.error(`Failed to render QR data URI for ${labelName}`, {
        id: entityId,
        error: qrImageErr
      });
    }
  } catch (qrErr) {
    logger.error(`Failed to generate QR matrix for ${labelName}`, {
      id: entityId,
      error: qrErr
    });
  }

  const payload: PayloadBase & PrintPayloadExtras = {
    ...payloadBase,
    qrDataUri,
    qrModules,
    qrMargin
  };

  try {
    logEvent.run({
      Actor: null,
      EntityType: entityType,
      EntityId: entityId,
      Event: 'PrintPayloadPrepared',
      Meta: JSON.stringify({ format: 'inline-html' })
    });
  } catch (logErr) {
    const context = logContext ?? `${labelName} preparation`;
    logger.error(`Failed to log ${context}`, {
      id: entityId,
      error: logErr
    });
  }

  return { format: 'inline-html', payload };
}
