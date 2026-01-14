// TODO(agent): Confirm shelf field normalization rules once shelf label conventions are finalized.
// TODO(agent): Align shelf category payload typing with shared category code helpers.
export interface CreateShelfPayload {
  type: 'shelf';
  actor: string;
  location: string;
  floor: string;
  category: number;
}

export type CreateBoxPayload =
  | { actor: string; type?: 'box' }
  | CreateShelfPayload;
