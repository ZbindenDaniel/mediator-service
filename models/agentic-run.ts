// TODO(agentic-run-schema): Review any remaining ItemUUID-based agentic UI payloads after reference-key migration.
export interface AgenticRun {
  Id: number;
  Artikel_Nummer: string;
  SearchQuery: string | null;
  Status: string;
  LastModified: string;
  ReviewState: string;
  ReviewedBy: string | null;
  LastReviewDecision: string | null;
  LastReviewNotes: string | null;
  RetryCount: number;
  NextRetryAt: string | null;
  LastError: string | null;
  LastAttemptAt: string | null;
  TranscriptUrl?: string | null;
}
