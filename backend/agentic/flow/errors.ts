export class FlowError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 500, options?: { cause?: unknown }) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    if (options?.cause !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).cause = options.cause;
    }
  }
}
