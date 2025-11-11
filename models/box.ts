export interface Box {
  BoxID: string;
  Location?: string | null;
  StandortLabel?: string | null;
  CreatedAt?: string;
  Notes?: string;
  PlacedBy?: string;
  PlacedAt?: string;
  // TODO(agent): Evaluate whether multiple box photos should be supported once UX requirements expand beyond a single preview.
  PhotoPath?: string | null;
  UpdatedAt: string;
}
