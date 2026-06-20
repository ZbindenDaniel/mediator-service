export interface ExternalDocEntry {
  fileName: string;
  url: string;
}

export interface ExternalDocSummary {
  name: string;
  docType: string | null;
  identifierType: string;
  identifierValue: string | null;
  available: boolean;
  reason?: string | null;
  fileCount: number;
  files: ExternalDocEntry[];
  writable: boolean;
  deletable: boolean;
}
