import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Box } from '../../../models';
import BoxList, { BoxSortKey } from './BoxList';
import { prepareBoxesForDisplay, type BoxTypeFilter } from './boxListUtils';
import { logError, logger } from '../utils/logger';
import { usePanelContext } from '../context/PanelContext';

export default function BoxListPage() {
  const { setEntity } = usePanelContext();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<BoxSortKey>('updatedAt');
  const [typeFilter, setTypeFilter] = useState<BoxTypeFilter>('all');
  const [locationFilter, setLocationFilter] = useState('all');
  // TODO: Evaluate server-side pagination when the number of boxes grows.

  useEffect(() => {
    let isMounted = true;

    async function load(): Promise<void> {
      try {
        const response = await fetch('/api/boxes');
        if (!response.ok) {
          logger.error?.('load boxes failed', { status: response.status });
          if (isMounted) {
            setError('Behälter konnten nicht geladen werden.');
          }
          return;
        }

        const data = await response.json();
        const nextBoxes: Box[] = Array.isArray(data.boxes) ? data.boxes : [];
        if (!Array.isArray(data.boxes)) {
          logger.error?.('Unexpected boxes payload shape', data);
        }
        if (isMounted) {
          setBoxes(nextBoxes);
          setError(null);
        }
        logger.info?.('loaded boxes', { count: nextBoxes.length });
      } catch (err) {
        logError('fetch boxes failed', err);
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
      const result = prepareBoxesForDisplay(boxes, { searchText, sortKey, typeFilter, locationFilter });
      logger.info?.('[BoxListPage] prepared boxes', {
        originalCount: boxes.length,
        filteredCount: result.length,
        sortKey,
        typeFilter,
        locationFilter,
      });
      return result;
    } catch (err) {
      logError('Failed to prepare box list', err);
      return boxes;
    }
  }, [boxes, searchText, sortKey, typeFilter, locationFilter]);

  const handleSearchChange = (value: string) => {
    try {
      setSearchText(value);
    } catch (err) {
      logError('Failed to update box search text', err);
    }
  };

  const handleSortChange = (key: BoxSortKey) => {
    try {
      setSortKey(key);
    } catch (err) {
      logError('Failed to update box sort key', err);
    }
  };

  const handleTypeFilterChange = (filter: BoxTypeFilter) => {
    try {
      setTypeFilter(filter);
    } catch (err) {
      logError('Failed to update box type filter', err);
    }
  };

  const handleLocationFilterChange = (value: string) => {
    try {
      setLocationFilter(value);
    } catch (err) {
      logError('Failed to update box location filter', err);
    }
  };

  const handleBoxSelect = useCallback((id: string) => {
    try {
      setEntity('box', id);
    } catch (err) {
      logError('Failed to set box entity in panel context', err, { id });
    }
  }, [setEntity]);

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
          typeFilter={typeFilter}
          locationFilter={locationFilter}
          onSearchChange={handleSearchChange}
          onSortChange={handleSortChange}
          onTypeFilterChange={handleTypeFilterChange}
          onLocationFilterChange={handleLocationFilterChange}
          onSelect={handleBoxSelect}
        />
      ) : (
        <div className="muted">Noch keine Behälter vorhanden.</div>
      )}
    </div>
  );
}
