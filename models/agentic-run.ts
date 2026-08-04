// TODO(agentic-run-schema): Review any remaining ItemUUID-based agentic UI payloads after reference-key migration.
export interface AgenticRun {
  Id: number;
  Artikel_Nummer: string;
  SearchQuery: string | null;
  LastSearchLinksJson?: string | null;
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
  Confidence?: number | null;
  // Spec contract version this run completed against; lets an idle sweep detect items enriched
  // against an outdated contract (stored < current) and re-apply it.
  SpecContractVersion?: number | null;
}
