export interface ItemAttachment {
  Id: number;
  ItemUUID: string;
  FileName: string;
  FilePath: string;
  MimeType: string | null;
  Label: string | null;
  FileSize: number | null;
  CreatedAt: string;
}
