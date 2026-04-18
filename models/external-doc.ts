export interface ExternalDocEntry {
  fileName: string;
  url: string;
}

export interface ExternalDocSummary {
  name: string;
  docType: string | null;
  identifierType: string;
  available: boolean;
  reason?: string | null;
  fileCount: number;
  files: ExternalDocEntry[];
}
