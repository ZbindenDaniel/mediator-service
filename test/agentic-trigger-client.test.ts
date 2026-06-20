import { triggerAgenticRun } from '../frontend/src/lib/agentic';

describe('triggerAgenticRun failure reasons', () => {
  const payload = { artikelNummer: 'item-123', artikelbeschreibung: 'Artikel' };

  it('includes backend failure reason in the returned message when available', async () => {
    const jsonMock = jest.fn().mockResolvedValue({ reason: 'missing-search-query' });
    const response = {
      ok: false,
      status: 409,
      clone: jest.fn().mockReturnValue({ json: jsonMock, text: jest.fn() }),
      json: jsonMock,
      text: jest.fn()
    };
    const fetchImpl = jest.fn().mockResolvedValue(response);

    const result = await triggerAgenticRun({ payload, context: 'test', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('failed');
    expect((result as { reason: string }).reason).toBe('response-not-ok');
    expect(result.message).toContain('Grund: Suchbegriff fehlt');
    expect(jsonMock).toHaveBeenCalledTimes(1);
  });

  it('annotates network errors with a readable reason', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));

    const result = await triggerAgenticRun({ payload, context: 'network-test', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('failed');
    expect((result as { reason: string }).reason).toBe('network-error');
    expect(result.message).toContain('Grund: Netzwerkfehler');
  });

  it('returns skipped when artikelbeschreibung is missing', async () => {
    const fetchImpl = jest.fn();

    const result = await triggerAgenticRun({
      payload: { artikelNummer: 'item-123' },
      context: 'no-desc',
      fetchImpl
    });

    expect(result.outcome).toBe('skipped');
    expect((result as { reason: string }).reason).toBe('missing-artikelbeschreibung');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns triggered on successful 200 response', async () => {
    const response = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ agentic: null })
    };
    const fetchImpl = jest.fn().mockResolvedValue(response);

    const result = await triggerAgenticRun({ payload, context: 'success', fetchImpl });

    expect(result.outcome).toBe('triggered');
    expect((result as { status: number }).status).toBe(200);
  });
});
