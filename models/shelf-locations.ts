// TODO(agent): Validate shelf location configuration against warehouse layout once confirmed.
export interface ShelfLocationDefinition {
  id: string;
  label: string;
  floors: string[];
}

export const shelfLocations: ShelfLocationDefinition[] = [
  {
    id: 'B379',
    label: 'Birmensdorferstr.',
    floors: ['0']
  },
  {
    id: 'B816',
    label: 'Badenerstr.',
    floors: ['1', '2']
  },
  {
    id: 'LG89',
    label: 'Hubertus',
    floors: ['1']
  }
];
