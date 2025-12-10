export interface Box {
  BoxID: string;
  // TODO(agent): Validate LocationId/Label naming alignment once downstream clients migrate off legacy Standort mappings.
  LocationId?: string | null;
  Label?: string | null;
  CreatedAt?: string | null;
  Notes?: string | null;
  PlacedBy?: string | null;
  PlacedAt?: string | null;
  // TODO(agent): Evaluate whether multiple box photos should be supported once UX requirements expand beyond a single preview.
  PhotoPath?: string | null;
  UpdatedAt: string;
}
