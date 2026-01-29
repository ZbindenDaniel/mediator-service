export interface Box {
  // BoxID format: boxes use B-DDMMYY-####, shelves use S-<location>-<floor>-<category>-<index>.
  BoxID: string;
  // TODO(agent): Validate LocationId/Label naming alignment once downstream clients migrate off legacy Standort mappings.
  // TODO(agent): Confirm ShelfLabel stays aligned with shelf label joins for list endpoints.
  // LocationId is always present (null when unset) for placement-aware clients.
  LocationId: string | null;
  Label?: string | null;
  ShelfLabel?: string | null;
  CreatedAt?: string | null;
  Notes?: string | null;
  PlacedBy?: string | null;
  PlacedAt?: string | null;
  // TODO(agent): Evaluate whether multiple box photos should be supported once UX requirements expand beyond a single preview.
  PhotoPath?: string | null;
  UpdatedAt: string;
}
