import { useEffect, useMemo, useState } from 'react';
import type { ItemRecord } from '../../../../models';
import { coerceItemRecord } from '../../lib/itemLayers';

type SimilarItem = ItemRecord;

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
        const response = await fetch(`/api/search?term=${encodeURIComponent(trimmedDescription)}`, {
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
        const rawItems: unknown[] = Array.isArray(data?.items) ? data.items : [];
        if (!Array.isArray(data?.items)) {
          console.warn('useSimilarItems: unexpected items payload', data?.items);
        }
        const items = rawItems
          .map((entry, index) => coerceItemRecord(entry, `similar-items-${index}`))
          .filter((entry): entry is ItemRecord => Boolean(entry));
        const filtered = items.filter((item) => item.ItemUUID !== currentItemUUID);
        setSimilarItems(filtered);
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
