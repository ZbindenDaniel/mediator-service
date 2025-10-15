export interface AgenticRun {
  Id: number;
  ItemUUID: string;
  SearchQuery: string | null;
  Status: string;
  LastModified: string;
  ReviewState: string;
  ReviewedBy: string | null;
  RetryCount: number;
  NextRetryAt: string | null;
  LastError: string | null;
  LastAttemptAt: string | null;
}

