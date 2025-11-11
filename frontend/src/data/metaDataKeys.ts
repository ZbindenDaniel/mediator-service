// TODO(langtext-keys): Extend this list when new Langtext keys receive approval from content design.
export interface MetaDataKeyDefinition {
  id: string;
  label: string;
}

export const metaDataKeys: readonly MetaDataKeyDefinition[] = [
  { id: 'Intro', label: 'Intro' },
  { id: 'Highlights', label: 'Highlights' },
  { id: 'Details', label: 'Details' }
] as const;

export type MetaDataKeyId = (typeof metaDataKeys)[number]['id'];
