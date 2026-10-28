import { shelfLocations as builtInLocations } from '../../../models/shelf-locations';
import type { ShelfLocationDefinition } from '../../../models/shelf-locations';

export type { ShelfLocationDefinition } from '../../../models/shelf-locations';

// Warehouse sites now come from the org directory (GET /api/app-config, loaded at boot by
// FeaturesProvider) instead of being compiled in. A plain module registry rather than a context
// because formatShelfLabel() is a synchronous helper used outside React components. The built-in
// list only bridges the moment before the config has loaded.
export interface SiteDefinition extends ShelfLocationDefinition {
  tenantId: string | null;
}

let sites: SiteDefinition[] = builtInLocations.map((l) => ({ ...l, tenantId: null }));

export function getShelfLocations(): SiteDefinition[] {
  return sites;
}

export function setShelfLocations(next: SiteDefinition[]): void {
  sites = next;
}
