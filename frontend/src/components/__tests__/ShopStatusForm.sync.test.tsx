import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShopStatusForm } from '../BulkItemActionBar';
import { requestShopSync } from '../../lib/shopSync';

describe('ShopStatusForm sync button', () => {
  it('offers "sync now" only when a sync handler is passed (item dialog, admins)', () => {
    const withSync = renderToStaticMarkup(
      <ShopStatusForm onChange={jest.fn()} onSyncNow={async () => ({ ok: true, message: 'ok' })} />
    );
    expect(withSync).toContain('Jetzt mit Shop synchronisieren');

    const withoutSync = renderToStaticMarkup(<ShopStatusForm onChange={jest.fn()} />);
    expect(withoutSync).not.toContain('Jetzt mit Shop synchronisieren');
    expect(withoutSync).toContain('Mietware');
  });
});

describe('requestShopSync', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  function mockFetch(status: number, body: unknown) {
    const fn = jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it('enqueues the given items with the admin token', async () => {
    const fetchMock = mockFetch(200, { ok: true, enqueued: 1, total: 1 });
    const result = await requestShopSync(['I-1'], 'secret');
    expect(result).toEqual({ ok: true, message: 'Shop-Sync für 1 Artikel ausgelöst.' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/shopware/sync');
    expect(JSON.parse(String(init.body))).toEqual({ itemIds: ['I-1'] });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('reports a disabled sync and missing rights as failures', async () => {
    mockFetch(200, { ok: false, reason: 'sync_disabled', enqueued: 0 });
    expect((await requestShopSync(['I-1'], '')).ok).toBe(false);
    mockFetch(403, { error: 'forbidden' });
    expect(await requestShopSync(['I-1'], '')).toEqual({ ok: false, message: 'Nicht autorisiert (Admin-Login erforderlich).' });
  });
});
