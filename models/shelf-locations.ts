// TODO(agent): Validate shelf location configuration against warehouse layout once confirmed.
export interface ShelfLocationDefinition {
  id: string;
  label: string;
  floors: string[];
}

export const shelfLocations: ShelfLocationDefinition[] = [
  {
    id: 'A',
    label: 'A',
    floors: ['1', '2']
  },
  {
    id: 'B',
    label: 'B',
    floors: ['1', '2', '3']
  },
  {
    id: 'C',
    label: 'C',
    floors: ['1']
  }
];
