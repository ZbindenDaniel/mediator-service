export interface BoxLabelPayload {
  id: string;
  location: string | null;
  notes: string | null;
  placedBy: string | null;
  placedAt: string | null;
  qrDataUri: string | null;
  qrModules: boolean[][] | null;
  qrMargin: number;
}
