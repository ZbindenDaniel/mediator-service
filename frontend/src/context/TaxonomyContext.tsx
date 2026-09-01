import React, {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import type { ItemCategoryDefinition } from '../../../models/item-categories';
import { buildItemCategoryLookups } from '../lib/categoryLookup';
import type { ItemCategoryLookups } from '../lib/categoryLookup';

// The category taxonomy is fetched once at boot from GET /api/taxonomy (the backend
// runtime source) instead of being imported statically, so a deployment's taxonomy
// can differ without rebuilding the frontend. See docs/PLANNING_TAXONOMY_EXTERNALIZATION.md.

interface TaxonomyContextValue {
  categories: ItemCategoryDefinition[];
  lookups: ItemCategoryLookups;
  loading: boolean;
  error: boolean;
}

const TaxonomyContext = createContext<TaxonomyContextValue | null>(null);

export function TaxonomyProvider({ children }: PropsWithChildren) {
  const [categories, setCategories] = useState<ItemCategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/taxonomy')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { categories?: ItemCategoryDefinition[] }) => {
        if (cancelled) return;
        setCategories(Array.isArray(data.categories) ? data.categories : []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Taxonomy] Failed to load /api/taxonomy', err);
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lookups = useMemo(() => buildItemCategoryLookups(categories), [categories]);
  const value = useMemo<TaxonomyContextValue>(
    () => ({ categories, lookups, loading, error }),
    [categories, lookups, loading, error]
  );

  return <TaxonomyContext.Provider value={value}>{children}</TaxonomyContext.Provider>;
}

export function useTaxonomy(): TaxonomyContextValue {
  const ctx = useContext(TaxonomyContext);
  if (!ctx) throw new Error('useTaxonomy must be used within a TaxonomyProvider');
  return ctx;
}
