export class FlowError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = 500,
    options?: { cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.context = options?.context;
    if (options?.cause !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).cause = options.cause;
    }
  }
}
