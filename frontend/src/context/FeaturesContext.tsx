import React, { createContext, PropsWithChildren, ReactNode, useContext, useEffect, useState } from 'react';
import { FEATURE_KEYS } from '../../../models/features';
import type { FeatureKey } from '../../../models/features';
import { setShelfLocations } from '../data/shelfLocations';
import type { SiteDefinition } from '../data/shelfLocations';

// Deployment feature flags, fetched once at boot from GET /api/app-config. The backend is the
// security boundary (disabled APIs answer 404); this only hides the UI so users never reach them.
// Components are gated where they mount, not hidden with CSS, so a disabled feature's UI never
// fires requests against its (now 404) API.

export type FeatureSet = Record<FeatureKey, boolean>;

const ALL_ON = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as FeatureSet;

// Default = everything on, matching an unconfigured deployment, so components rendered without a
// provider (isolated tests) behave as before.
export const FeaturesContext = createContext<FeatureSet>(ALL_ON);

export function FeaturesProvider({ children }: PropsWithChildren) {
  const [features, setFeatures] = useState<FeatureSet | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/app-config')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { features?: Partial<FeatureSet>; sites?: SiteDefinition[] }) => {
        if (cancelled) return;
        // The same boot config carries the warehouse sites (shelf labels + shelf creation).
        if (Array.isArray(data.sites)) setShelfLocations(data.sites);
        setFeatures({ ...ALL_ON, ...(data.features ?? {}) });
      })
      .catch((err) => {
        if (cancelled) return;
        // UI-only fallback; the backend still blocks whatever is disabled.
        console.error('[Features] Failed to load /api/app-config', err);
        setFeatures(ALL_ON);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hold rendering until known, so disabled nav/tabs never flash or fire requests on first paint.
  if (!features) return null;
  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>;
}

export function useFeature(key: FeatureKey): boolean {
  return useContext(FeaturesContext)[key];
}

export function useFeatures(): FeatureSet {
  return useContext(FeaturesContext);
}

/** Renders children only while the feature is on. */
export function Feature({ name, children }: { name: FeatureKey; children: ReactNode }) {
  return useFeature(name) ? <>{children}</> : null;
}
