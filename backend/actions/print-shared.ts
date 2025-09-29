import QRCode from 'qrcode';

export interface PrintLogEventRunner {
  run(event: {
    Actor: string | null;
    EntityType: string;
    EntityId: string;
    Event: string;
    Meta: string | null;
  }): unknown;
}

const DEFAULT_MARGIN = 4;

function toBooleanMatrix(modules: unknown): boolean[][] | null {
  if (!modules || typeof modules !== 'object') {
    return null;
  }

  const core = modules as {
    size?: unknown;
    data?: unknown;
    get?: (row: number, column: number) => boolean;
  };

  const size = typeof core.size === 'number' && Number.isFinite(core.size) ? Math.max(0, Math.floor(core.size)) : 0;
  if (size <= 0) {
    return null;
  }

  const matrix: boolean[][] = [];
  const arrayLike: ArrayLike<number> | null = Array.isArray(core.data)
    ? (core.data as ArrayLike<number>)
    : ArrayBuffer.isView(core.data)
    ? (core.data as ArrayLike<number>)
    : null;

  for (let row = 0; row < size; row += 1) {
    const rowData: boolean[] = [];
    for (let col = 0; col < size; col += 1) {
      let value = false;
      if (typeof core.get === 'function') {
        try {
          value = Boolean(core.get(row, col));
        } catch (err) {
          value = false;
        }
      } else if (arrayLike) {
        const index = row * size + col;
        value = Boolean(arrayLike[index]);
      }
      rowData.push(value);
    }
    matrix.push(rowData);
  }

  return matrix;
}

function getMargin(options: unknown): number {
  if (!options || typeof options !== 'object') {
    return DEFAULT_MARGIN;
  }
  const marginValue = (options as { margin?: unknown }).margin;
  if (typeof marginValue === 'number' && Number.isFinite(marginValue)) {
    return Math.max(0, Math.floor(marginValue));
  }
  return DEFAULT_MARGIN;
}

function renderMatrixAsSvgDataUri(modules: boolean[][], margin: number): string | null {
  if (!Array.isArray(modules) || modules.length === 0) {
    return null;
  }

  const safeMargin = Number.isFinite(margin) ? Math.max(0, Math.floor(margin)) : DEFAULT_MARGIN;
  const moduleCount = modules.length;
  const total = moduleCount + safeMargin * 2;

  let pathData = '';
  for (let row = 0; row < moduleCount; row += 1) {
    const rowData = modules[row];
    if (!Array.isArray(rowData)) continue;
    for (let col = 0; col < rowData.length; col += 1) {
      if (rowData[col]) {
        const x = col + safeMargin;
        const y = row + safeMargin;
        pathData += `M${x} ${y}h1v1h-1z`;
      }
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path d="${pathData}" fill="#000000"/></svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export interface BuildPrintPayloadOptions<PayloadBase extends Record<string, unknown>> {
  templatePath: string;
  payloadBase: PayloadBase;
  entityType: string;
  entityId: string;
  labelName: string;
  logContext?: string;
  logEvent: PrintLogEventRunner;
  logger?: Pick<typeof console, 'error' | 'warn'>;
  actor?: string | null;
  qr?: {
    create?: (text: string, options?: Record<string, unknown>) => {
      modules?: {
        size?: number;
        data?: unknown;
        get?: (row: number, column: number) => boolean;
      };
      options?: {
        margin?: number;
      };
    };
  };
}

export interface PrintPayloadExtras {
  qrDataUri: string | null;
  qrModules: boolean[][] | null;
  qrMargin: number;
}

export interface BuildPrintPayloadResult<PayloadBase extends Record<string, unknown>> {
  template: string;
  payload: PayloadBase & PrintPayloadExtras;
}

export function buildPrintPayload<PayloadBase extends Record<string, unknown>>(
  options: BuildPrintPayloadOptions<PayloadBase>
): BuildPrintPayloadResult<PayloadBase> {
  const { templatePath, payloadBase, entityType, entityId, labelName, logContext, logEvent } = options;
  const actorInput = typeof options.actor === 'string' ? options.actor : null;
  const actor = actorInput ? actorInput.trim() || null : null;
  const logger = options.logger ?? console;

  let qrDataUri: string | null = null;
  let qrModules: boolean[][] | null = null;
  let qrMargin = 4;

  const serialized = JSON.stringify(payloadBase);
  const qrCreate = options.qr?.create ?? ((text: string, createOptions?: Record<string, unknown>) => {
    return QRCode.create(text, {
      errorCorrectionLevel: 'M',
      margin: DEFAULT_MARGIN,
      ...createOptions
    } as any);
  });

  try {
    const qr = qrCreate(serialized, { margin: 4 });
    if (qr && typeof qr === 'object') {
      const matrix = toBooleanMatrix(qr.modules);
      if (matrix) {
        qrModules = matrix;
        const margin = getMargin(qr.options);
        qrMargin = margin;
        try {
          qrDataUri = renderMatrixAsSvgDataUri(matrix, margin);
          if (!qrDataUri) {
            logger.warn?.(`QR data URI not generated for ${labelName}`, {
              id: entityId
            });
          }
        } catch (qrImageErr) {
          logger.error(`Failed to render QR data URI for ${labelName}`, {
            id: entityId,
            error: qrImageErr
          });
        }
      } else {
        logger.warn?.(`QR matrix unavailable for ${labelName}`, {
          id: entityId
        });
      }
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
      Actor: actor,
      EntityType: entityType,
      EntityId: entityId,
      Event: 'PrintPayloadPrepared',
      Meta: JSON.stringify({ template: templatePath })
    });
  } catch (logErr) {
    const context = logContext ?? `${labelName} preparation`;
    logger.error(`Failed to log ${context}`, {
      id: entityId,
      error: logErr
    });
  }

  return {
    template: templatePath,
    payload
  };
}
