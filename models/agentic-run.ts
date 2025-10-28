export interface AgenticRun {
  Id: number;
  ItemUUID: string;
  SearchQuery: string | null;
  Status: string;
  LastModified: string;
  ReviewState: string;
  ReviewedBy: string | null;
}

export type AgenticRunStatus = 'queued' | 'running' | 'completed' | 'failed';

