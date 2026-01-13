// TODO(agent): Confirm shelf field normalization rules once shelf label conventions are finalized.
export interface CreateShelfPayload {
  type: 'shelf';
  actor: string;
  location: string;
  floor: string;
  category: string;
}

export type CreateBoxPayload =
  | { actor: string; type?: 'box' }
  | CreateShelfPayload;
