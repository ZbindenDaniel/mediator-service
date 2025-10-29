export class ShopwareError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ShopwareError';
  }
}

export interface ShopwareRequestErrorOptions extends ErrorOptions {
  status?: number;
  responseBody?: string | null;
}

export class ShopwareRequestError extends ShopwareError {
  public readonly status?: number;

  public readonly responseBody?: string | null;

  constructor(message: string, { status, responseBody, cause }: ShopwareRequestErrorOptions = {}) {
    super(message, { cause });
    this.name = 'ShopwareRequestError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class ShopwareAuthError extends ShopwareError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ShopwareAuthError';
  }
}

export class ShopwareNetworkError extends ShopwareError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ShopwareNetworkError';
  }
}
