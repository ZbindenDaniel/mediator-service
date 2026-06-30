// requestPrintLabel — forwarding the operator's site (docs/PLANNING_multi_instance.md)
// alongside actor/labelType so resolvePrinterQueue can route to the right printer.
import { requestPrintLabel } from '../frontend/src/utils/printLabelRequest';

function mockFetch(body: unknown = {}) {
  return jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('requestPrintLabel — site forwarding', () => {
  test('includes a trimmed site in the request body when provided', async () => {
    const fetchImpl = mockFetch();
    await requestPrintLabel({ itemId: 'I-1', actor: 'tester', site: '  Shop  ', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/print/item/I-1',
      expect.objectContaining({
        body: JSON.stringify({ actor: 'tester', labelType: 'item', site: 'Shop' }),
      })
    );
  });

  test('omits site from the request body when not provided', async () => {
    const fetchImpl = mockFetch();
    await requestPrintLabel({ itemId: 'I-1', actor: 'tester', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/print/item/I-1',
      expect.objectContaining({
        body: JSON.stringify({ actor: 'tester', labelType: 'item' }),
      })
    );
  });

  test('omits site from the request body when blank', async () => {
    const fetchImpl = mockFetch();
    await requestPrintLabel({ itemId: 'I-1', actor: 'tester', site: '   ', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/print/item/I-1',
      expect.objectContaining({
        body: JSON.stringify({ actor: 'tester', labelType: 'item' }),
      })
    );
  });
});
