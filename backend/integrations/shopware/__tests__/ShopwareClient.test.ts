import { ShopwareClient } from '../client';
import { ShopwareNetworkError } from '../errors';
import type { ShopwareClientOptions } from '../types';

describe('ShopwareClient', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createJsonResponse(status: number, body: unknown): Response {
    const text = JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: jest.fn().mockResolvedValue(text)
    } as unknown as Response;
  }

  function createTextResponse(status: number, body: string): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: jest.fn().mockResolvedValue(body)
    } as unknown as Response;
  }

  function buildClient(overrides: Partial<ShopwareClientOptions> = {}): ShopwareClient {
    return new ShopwareClient({
      baseUrl: 'https://shopware.test',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      logger,
      sleep: async () => undefined,
      ...overrides
    });
  }

  it('fetches a token and performs an authorized request', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, { access_token: 'token', expires_in: 300 }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: 'ok' }));

    const client = buildClient({ fetchImpl: fetchMock });
    const result = await client.get('/api/test');

    expect(result).toEqual({ data: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://shopware.test/api/test',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token'
        })
      })
    );
  });

  it('refreshes the token after a 401 response', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, { access_token: 'token-a', expires_in: 5 }))
      .mockResolvedValueOnce(createTextResponse(401, 'unauthorized'))
      .mockResolvedValueOnce(createJsonResponse(200, { access_token: 'token-b', expires_in: 5 }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: 'retried' }));

    const client = buildClient({ fetchImpl: fetchMock });
    const result = await client.get('/api/items');

    expect(result).toEqual({ data: 'retried' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(logger.warn).toHaveBeenCalledWith('[shopware] Request unauthorized - refreshing token and retrying');
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://shopware.test/api/items',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-b'
        })
      })
    );
  });

  it('retries on network errors using the configured backoff', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const networkError = new Error('boom');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, { access_token: 'token', expires_in: 10 }))
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(createJsonResponse(200, { data: 'after retry' }));

    const client = buildClient({
      fetchImpl: fetchMock,
      retry: { retries: 2, minDelayMs: 10, backoffFactor: 3 },
      sleep
    });

    const result = await client.get('/api/retry-me');

    expect(result).toEqual({ data: 'after retry' });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it('captures response bodies for failed requests', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, { access_token: 'token', expires_in: 300 }))
      .mockResolvedValueOnce(createTextResponse(400, 'bad request'));

    const client = buildClient({ fetchImpl: fetchMock });

    await expect(client.get('/api/fail')).rejects.toMatchObject({
      responseBody: 'bad request'
    });
  });

  it('propagates network errors when retries are exhausted', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, { access_token: 'token', expires_in: 300 }))
      .mockRejectedValue(new Error('offline'))
      .mockRejectedValue(new Error('still offline'))
      .mockRejectedValue(new Error('definitely offline'));

    const client = buildClient({ fetchImpl: fetchMock, retry: { retries: 1, minDelayMs: 5 }, sleep });

    await expect(client.get('/api/offline')).rejects.toBeInstanceOf(ShopwareNetworkError);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
