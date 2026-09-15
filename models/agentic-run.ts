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
  // Serialized `Finding[]` snapshot from the run's output at completion (history). JSON string or null.
  FindingsJson?: string | null;
  // Transient (never persisted): deterministic findings computed from the item's CURRENT stored
  // content on read, so review surfaces reflect live content + manual edits, not the last run's output.
  CurrentFindings?: import('./agentic-findings').Finding[];
}
