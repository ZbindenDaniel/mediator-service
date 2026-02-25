// TODO(agent): Confirm shelf field normalization rules once shelf label conventions are finalized.
// TODO(agent): Keep shelf create payload minimal and category-free after shelf policy removal.
// TODO(agent): Revisit shelf label/note payload validation once warehouse naming rules are finalized.
export interface CreateShelfPayload {
  type: 'shelf';
  actor: string;
  location: string;
  floor: string;
  label?: string;
  notes?: string;
}

export type CreateBoxPayload =
  | { actor: string; type?: 'box' }
  | CreateShelfPayload;
