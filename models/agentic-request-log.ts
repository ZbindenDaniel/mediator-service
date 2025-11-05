export interface AgenticRequestLog {
  UUID: string;
  Search: string | null;
  Status: string | null;
  Error: string | null;
  CreatedAt: string;
  UpdatedAt: string;
  NotifiedAt: string | null;
  LastNotificationError: string | null;
  PayloadJson: string | null;
}

export interface AgenticRequestNotification {
  UUID: string;
  Payload: unknown;
}

export interface AgenticRequestLogUpsert {
  UUID: string;
  Search?: string | null;
  Status?: string | null;
  Error?: string | null;
  CreatedAt?: string | null;
  UpdatedAt?: string | null;
  NotifiedAt?: string | null;
  LastNotificationError?: string | null;
  PayloadJson?: string | null;
}
