export type ShopwareSyncJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ShopwareSyncOperation =
  | 'stock-increment'
  | 'stock-decrement'
  | 'item-upsert'
  | 'item-move'
  | 'item-delete';

export interface ShopwareSyncJob {
  Id: number;
  ItemUUID: string;
  Operation: ShopwareSyncOperation;
  TriggerSource: string | null;
  Payload: unknown;
  Status: ShopwareSyncJobStatus;
  AttemptCount: number;
  LastError: string | null;
  LastAttemptAt: string | null;
  ShopwareId: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface ShopwareSyncJobInsert {
  itemUUID: string;
  operation: ShopwareSyncOperation;
  triggerSource?: string | null;
  payload?: unknown;
  shopwareId?: string | null;
}
