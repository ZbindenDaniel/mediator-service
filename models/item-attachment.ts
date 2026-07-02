export interface ItemAttachment {
  Id: number;
  ItemUUID: string;
  FileName: string;
  FilePath: string;
  MimeType: string | null;
  Label: string | null;
  FileSize: number | null;
  CreatedAt: string;
  // 'instance' = bound to this ItemUUID; 'product' = shared across all instances of Artikel_Nummer
  Scope: string;
  Artikel_Nummer: string | null;
}
