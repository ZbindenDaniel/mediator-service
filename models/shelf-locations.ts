// Seed only: copied into the tenant_sites table on first start (assigned to the default org). After
// that, sites are edited on the Organisationen admin page and served via GET /api/app-config.
export interface ShelfLocationDefinition {
  id: string;
  label: string;
  floors: string[];
}

export const shelfLocations: ShelfLocationDefinition[] = [
  {
    id: 'B379',
    label: 'revamp',
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
