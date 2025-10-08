import { fetchAgenticHealthProxy } from '../frontend/src/components/ItemCreate';

describe('fetchAgenticHealthProxy', () => {
  test('returns parsed health payload when response is ok', async () => {
    const responseBody = { ok: true, version: '1.0.0' };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(responseBody)
    });

    const result = await fetchAgenticHealthProxy({ fetchImpl: fetchMock as any });

    expect(fetchMock).toHaveBeenCalledWith('/api/agentic/health', { method: 'GET' });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual(responseBody);
    expect(result.parseError).toBeUndefined();
  });

  test('captures parse errors while preserving proxy status', async () => {
    const parseError = new Error('invalid json');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(parseError)
    });

    const result = await fetchAgenticHealthProxy({ fetchImpl: fetchMock as any });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toBeNull();
    expect(result.parseError).toBe(parseError);
  });

  test('propagates non-ok status without treating it as an error', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({ ok: false })
    });

    const result = await fetchAgenticHealthProxy({ fetchImpl: fetchMock as any });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ ok: false });
  });
});
