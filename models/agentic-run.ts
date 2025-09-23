export interface AgenticRun {
  Id: number;
  ItemUUID: string;
  SearchQuery: string | null;
  Status: string;
  TriggeredAt: string | null;
  StartedAt: string | null;
  CompletedAt: string | null;
  FailedAt: string | null;
  Summary: string | null;
  NeedsReview: number;
  ReviewedBy: string | null;
  ReviewedAt: string | null;
  ReviewDecision: string | null;
  ReviewNotes: string | null;
}

