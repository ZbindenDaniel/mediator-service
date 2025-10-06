import { useEffect, useMemo, useState } from 'react';
import type { Item, ItemRef } from '../../../../models';

type SimilarItem = (Partial<Item> & Partial<ItemRef>) & {
  Artikel_Nummer: string;
  ItemUUID?: string | null;
};

interface UseSimilarItemsOptions {
  description: string | undefined;
  currentItemUUID?: string | null;
  debounceMs?: number;
}

interface UseSimilarItemsResult {
  similarItems: SimilarItem[];
  loading: boolean;
  error: string | null;
  hasQuery: boolean;
}

export function useSimilarItems({
  description,
  currentItemUUID,
  debounceMs = 400
}: UseSimilarItemsOptions): UseSimilarItemsResult {
  const [similarItems, setSimilarItems] = useState<SimilarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedDescription = useMemo(() => description?.trim() ?? '', [description]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    if (!trimmedDescription) {
      setSimilarItems([]);
      setLoading(false);
      setError(null);
      return () => {
        controller.abort();
      };
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('Searching for similar items', trimmedDescription);
        const searchParams = new URLSearchParams({
          term: trimmedDescription,
          scope: 'refs'
        });
        const response = await fetch(`/api/search?${searchParams.toString()}`, {
          signal: controller.signal
        });
        if (!isMounted) {
          return;
        }
        if (!response.ok) {
          console.error('Similar items search failed with status', response.status);
          setSimilarItems([]);
          setError(`Fehler beim Suchen (Status ${response.status})`);
          setLoading(false);
          return;
        }
        const data = await response.json();
        const refs = Array.isArray(data?.refs) ? (data.refs as SimilarItem[]) : [];
        const deduped: SimilarItem[] = [];
        const seenArtikel = new Set<string>();
        for (const entry of refs) {
          if (!entry || typeof entry.Artikel_Nummer !== 'string') {
            continue;
          }
          const artikelKey = entry.Artikel_Nummer.trim().toLowerCase();
          if (!artikelKey) {
            continue;
          }
          if (seenArtikel.has(artikelKey)) {
            continue;
          }
          seenArtikel.add(artikelKey);
          if (entry.ItemUUID && entry.ItemUUID === currentItemUUID) {
            continue;
          }
          deduped.push(entry);
        }
        setSimilarItems(deduped);
        setLoading(false);
      } catch (err) {
        if (!isMounted || controller.signal.aborted) {
          console.log('Similar items search aborted');
          return;
        }
        console.error('Similar items search threw', err);
        setError('Ähnliche Artikel konnten nicht geladen werden.');
        setSimilarItems([]);
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      isMounted = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [trimmedDescription, currentItemUUID, debounceMs]);

  return {
    similarItems,
    loading,
    error,
    hasQuery: Boolean(trimmedDescription)
  };
}

export type { SimilarItem };
