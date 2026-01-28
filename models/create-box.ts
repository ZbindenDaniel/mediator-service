// TODO(agent): Confirm shelf field normalization rules once shelf label conventions are finalized.
// TODO(agent): Align shelf category payload typing with shared category code helpers.
// TODO(agent): Revisit shelf label/note payload validation once warehouse naming rules are finalized.
export interface CreateShelfPayload {
  type: 'shelf';
  actor: string;
  location: string;
  floor: string;
  category: number;
  label?: string;
  notes?: string;
}

export type CreateBoxPayload =
  | { actor: string; type?: 'box' }
  | CreateShelfPayload;
