export class FlowError extends Error {
  constructor(code, message, statusCode = 500, options = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
