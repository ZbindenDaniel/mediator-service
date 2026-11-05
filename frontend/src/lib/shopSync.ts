// Manual Shopware sync for selected items (POST /api/admin/shopware/sync, super-admin only). Shared by the
// list bulk action and the item's shop dialog. The server only enqueues; the worker pushes within ~10 s.

export interface ShopSyncResult {
  ok: boolean;
  message: string;
}

export function readAdminToken(): string {
  try { return sessionStorage.getItem('adminSecret') ?? ''; } catch { return ''; }
}

export async function requestShopSync(itemIds: string[], adminToken: string = readAdminToken()): Promise<ShopSyncResult> {
  try {
    const response = await fetch('/api/admin/shopware/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
      },
      body: JSON.stringify({ itemIds })
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: 'Nicht autorisiert (Admin-Login erforderlich).' };
      }
      const body = await response.json().catch(() => ({} as { error?: string }));
      return { ok: false, message: body.error || `Shop-Sync fehlgeschlagen (HTTP ${response.status}).` };
    }
    const payload = await response.json() as { ok: boolean; reason?: string; enqueued?: number };
    if (!payload.ok && payload.reason === 'sync_disabled') {
      return { ok: false, message: 'Shop-Sync ist deaktiviert (SHOPWARE_SYNC_ENABLED=false).' };
    }
    return { ok: true, message: `Shop-Sync für ${payload.enqueued ?? 0} Artikel ausgelöst.` };
  } catch (error) {
    console.error('[shopSync] Request failed', error);
    return { ok: false, message: (error as Error).message || 'Unbekannter Fehler beim Shop-Sync.' };
  }
}
