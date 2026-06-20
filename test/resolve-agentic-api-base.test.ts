import { triggerAgenticRun, extractAgenticFailureReason, describeAgenticFailureReason } from '../frontend/src/lib/agentic';

// resolveAgenticApiBase was removed; this file now tests the helpers it backed.
describe('agentic failure reason helpers', () => {
  it('extractAgenticFailureReason returns reason from a flat record', () => {
    expect(extractAgenticFailureReason({ reason: 'missing-search-query' })).toBe('missing-search-query');
  });

  it('extractAgenticFailureReason digs into nested error objects', () => {
    expect(extractAgenticFailureReason({ error: { reason: 'network-error' } })).toBe('network-error');
  });

  it('extractAgenticFailureReason returns null for empty input', () => {
    expect(extractAgenticFailureReason(null)).toBeNull();
    expect(extractAgenticFailureReason({})).toBeNull();
    expect(extractAgenticFailureReason('')).toBeNull();
  });

  it('describeAgenticFailureReason maps known codes to German text', () => {
    expect(describeAgenticFailureReason('missing-search-query')).toBe('Suchbegriff fehlt');
    expect(describeAgenticFailureReason('network-error')).toBe('Netzwerkfehler');
    expect(describeAgenticFailureReason('response-not-ok')).toBe('Unerwartete Antwort vom KI-Dienst');
  });

  it('describeAgenticFailureReason passes through unknown codes verbatim', () => {
    expect(describeAgenticFailureReason('custom-backend-error')).toBe('custom-backend-error');
  });

  it('describeAgenticFailureReason returns null for empty input', () => {
    expect(describeAgenticFailureReason(null)).toBeNull();
    expect(describeAgenticFailureReason('')).toBeNull();
  });

  it('triggerAgenticRun uses custom endpoint when provided', async () => {
    const response = { ok: true, status: 200, json: jest.fn().mockResolvedValue({}) };
    const fetchImpl = jest.fn().mockResolvedValue(response);

    await triggerAgenticRun({
      payload: { artikelNummer: 'R-100', artikelbeschreibung: 'Widget' },
      context: 'test',
      endpoint: '/api/custom/run',
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/custom/run',
      expect.any(Object)
    );
  });
});
