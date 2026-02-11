export interface AgenticRunReviewHistoryEntry {
  Id: number;
  Artikel_Nummer: string;
  Status: string;
  ReviewState: string;
  ReviewDecision: string | null;
  ReviewNotes: string | null;
  ReviewedBy: string | null;
  RecordedAt: string;
}

