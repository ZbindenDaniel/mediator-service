export type ShopwareSyncQueueStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface ShopwareSyncQueueEntry {
  Id: number;
  CorrelationId: string;
  JobType: string;
  Payload: string;
  Status: ShopwareSyncQueueStatus;
  RetryCount: number;
  LastError: string | null;
  LastAttemptAt: string | null;
  NextAttemptAt: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface ShopwareSyncQueueInsert {
  CorrelationId: string;
  JobType: string;
  Payload: string;
  Status?: ShopwareSyncQueueStatus;
  RetryCount?: number;
  LastError?: string | null;
  LastAttemptAt?: string | null;
  NextAttemptAt?: string | null;
}
