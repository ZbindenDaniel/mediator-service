import type { ShopwareProductSnapshot, ShopwareUpsertResult } from './adminClient';
import type { ShopwareQueueClient, ShopwareSyncJobDescriptor, ShopwareQueueDispatchResult } from './queueClient';

// Composes the Admin-API client with a DB snapshot loader into the queue's dispatch client. Kept
// DB-free (loadSnapshot/persistProductId are injected in server.ts) so it stays unit-testable.
export interface ShopwareSyncClientDeps {
  adminClient: Pick<import('./adminClient').ShopwareAdminClient, 'upsertProduct'>;
  loadSnapshot: (payload: unknown) => Promise<ShopwareProductSnapshot | null>;
  persistProductId?: (productNumber: string, productId: string) => Promise<void>;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

// A 4xx (except 408/429) is a client/validation/permission error the same payload will keep hitting,
// so it is terminal. Network errors and 408/429/5xx are transient and worth retrying.
function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true; // network / no response
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

export function createShopwareSyncClient(deps: ShopwareSyncClientDeps): ShopwareQueueClient {
  const logger = deps.logger ?? console;

  return {
    async dispatchJob(job: ShopwareSyncJobDescriptor): Promise<ShopwareQueueDispatchResult> {
      const snapshot = await deps.loadSnapshot(job.payload);
      if (!snapshot) {
        // The reference was deleted (or the item has no Artikel_Nummer) between enqueue and dispatch —
        // nothing to sync. Treat as success so the job drains instead of retrying forever.
        logger.info?.('[shopware-sync] No matching item for job; skipping', { correlationId: job.correlationId, jobType: job.jobType });
        return { ok: true, correlationId: job.correlationId, message: 'no matching item — skipped' };
      }

      try {
        const result: ShopwareUpsertResult = await deps.adminClient.upsertProduct(snapshot);
        if (result.action === 'created' && result.productId && deps.persistProductId) {
          // Best-effort: persisting the new id only saves a lookup next time; a failure isn't fatal.
          const newId = result.productId;
          await deps.persistProductId(snapshot.productNumber, newId).catch((err) =>
            logger.warn?.('[shopware-sync] Failed to persist ShopwareProductId', { productNumber: snapshot.productNumber, err })
          );
        }
        logger.info?.('[shopware-sync] Synced product', {
          correlationId: job.correlationId,
          productNumber: snapshot.productNumber,
          action: result.action,
          stock: snapshot.stock
        });
        return { ok: true, correlationId: job.correlationId };
      } catch (err) {
        const status = (err as { status?: number }).status;
        const retryable = isRetryableStatus(status);
        const message = err instanceof Error ? err.message : String(err);
        logger.warn?.('[shopware-sync] Product sync failed', { correlationId: job.correlationId, status, retryable, message });
        return { ok: false, retryable, message, correlationId: job.correlationId };
      }
    }
  };
}
