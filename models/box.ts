export interface Box {
  BoxID: string;
  Location?: string | null;
  StandortLabel?: string | null;
  CreatedAt?: string | null;
  Notes?: string | null;
  PlacedBy?: string | null;
  PlacedAt?: string | null;
  // TODO(agent): Evaluate whether multiple box photos should be supported once UX requirements expand beyond a single preview.
  PhotoPath?: string | null;
  UpdatedAt: string;
}
