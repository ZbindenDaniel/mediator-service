import React, { useEffect, useMemo, useState } from 'react';
import type { Box } from '../../../models';
import BoxList, { BoxSortKey } from './BoxList';
import { prepareBoxesForDisplay } from './boxListUtils';

export default function BoxListPage() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<BoxSortKey>('BoxID');
  // TODO: Evaluate server-side pagination when the number of boxes grows.

  useEffect(() => {
    let isMounted = true;

    async function load(): Promise<void> {
      try {
        const response = await fetch('/api/boxes');
        if (!response.ok) {
          console.error('load boxes failed', response.status);
          if (isMounted) {
            setError('Behälter konnten nicht geladen werden.');
          }
          return;
        }

        const data = await response.json();
        const nextBoxes: Box[] = Array.isArray(data.boxes) ? data.boxes : [];
        if (!Array.isArray(data.boxes)) {
          console.error('Unexpected boxes payload shape', data);
        }
        if (isMounted) {
          setBoxes(nextBoxes);
          setError(null);
        }
        console.log('loaded boxes', nextBoxes.length);
      } catch (err) {
        console.error('fetch boxes failed', err);
        if (isMounted) {
          setError('Behälter konnten nicht geladen werden.');
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const preparedBoxes = useMemo(() => {
    try {
      const result = prepareBoxesForDisplay(boxes, { searchText, sortKey });
      console.log('[BoxListPage] prepared boxes', {
        originalCount: boxes.length,
        filteredCount: result.length,
        sortKey,
      });
      return result;
    } catch (err) {
      console.error('Failed to prepare box list', err);
      return boxes;
    }
  }, [boxes, searchText, sortKey]);

  const handleSearchChange = (value: string) => {
    try {
      setSearchText(value);
    } catch (err) {
      console.error('Failed to update box search text', err);
    }
  };

  const handleSortChange = (key: BoxSortKey) => {
    try {
      setSortKey(key);
    } catch (err) {
      console.error('Failed to update box sort key', err);
    }
  };

  return (
    <div className="list-container box">
      <h2>Alle Behälter</h2>
      {error ? (
        <div className="muted">{error}</div>
      ) : boxes.length ? (
        <BoxList
          boxes={preparedBoxes}
          searchValue={searchText}
          sortKey={sortKey}
          onSearchChange={handleSearchChange}
          onSortChange={handleSortChange}
        />
      ) : (
        <div className="muted">Noch keine Behälter vorhanden.</div>
      )}
    </div>
  );
}
