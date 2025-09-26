export interface ItemLabelPayload {
  id: string;
  articleNumber: string | null;
  boxId: string | null;
  location: string | null;
  qrDataUri: string | null;
  qrModules: boolean[][] | null;
  qrMargin: number;
}
