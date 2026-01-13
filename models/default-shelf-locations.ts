// TODO(agent): Populate per-subcategory shelf defaults once the warehouse layout mapping is confirmed.
export interface DefaultShelfLocationConfig {
  location: string;
  floor: string;
}

export const defaultShelfLocationBySubcategory: Record<number, DefaultShelfLocationConfig> = {};
