import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ensureUser, getUser, setUser as persistUser } from '../lib/user';
import { useDialog } from './dialog';
import {
  clearItemListFilters,
  getActiveFilterDescriptions,
  getDefaultItemListFilters,
  hasNonDefaultFilters,
  ITEM_LIST_FILTERS_CHANGED_EVENT,
  ITEM_LIST_FILTERS_RESET_REQUESTED_EVENT,
  ItemListFilterChangeDetail,
  loadItemListFilters
} from '../lib/itemListFiltersStorage';
import { GoArchive, GoFilter, GoHome, GoListUnordered, GoPlus, GoPulse } from 'react-icons/go';
import { logError } from '../utils/logger';

// TODO(filter-indicator): Surface stored filter state changes in the header and allow quick reset.
export default function Header() {
  const dialog = useDialog();
  const navigate = useNavigate();
  const [user, setUserState] = useState(() => getUser().trim());
  const [filterSummaries, setFilterSummaries] = useState<string[]>([]);
  const [hasStoredFilters, setHasStoredFilters] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadUser = async () => {
      try {
        const ensured = await ensureUser();
        if (!cancelled) {
          setUserState(ensured);
          if (!ensured) {
            console.info('No username persisted after ensureUser resolution.');
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to ensure user during header mount', err);
        }
      }
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const defaults = getDefaultItemListFilters();
    const syncFromStorage = () => {
      const stored = loadItemListFilters(defaults);
      if (stored) {
        setFilterSummaries(getActiveFilterDescriptions(stored, defaults));
        setHasStoredFilters(hasNonDefaultFilters(stored, defaults));
      } else {
        setFilterSummaries([]);
        setHasStoredFilters(false);
      }
    };

    syncFromStorage();

    const handleFilterChange = (event: Event) => {
      const customEvent = event as CustomEvent<ItemListFilterChangeDetail>;
      const activeFilters = customEvent.detail?.activeFilters ?? [];
      const hasOverrides = customEvent.detail?.hasOverrides ?? false;
      setFilterSummaries(activeFilters);
      setHasStoredFilters(hasOverrides);
    };

    window.addEventListener(ITEM_LIST_FILTERS_CHANGED_EVENT, handleFilterChange as EventListener);
    return () => window.removeEventListener(ITEM_LIST_FILTERS_CHANGED_EVENT, handleFilterChange as EventListener);
  }, []);

  const handleUserDoubleClick = useCallback(async () => {
    try {
      const result = await dialog.prompt({
        title: 'Benutzername bearbeiten',
        message: 'Bitte geben Sie einen neuen Benutzernamen ein:',
        defaultValue: user,
        confirmLabel: 'Speichern',
        cancelLabel: 'Abbrechen'
      });
      const trimmed = (result ?? '').trim();
      if (!trimmed) {
        console.info('Username update cancelled or empty input.');
        return;
      }
      if (trimmed === user) {
        console.info('Username remains unchanged.');
        return;
      }
      persistUser(trimmed);
      setUserState(trimmed);
      console.log('Username updated via header dialog.');
    } catch (err) {
      console.error('Failed to update username through dialog', err);
    }
  }, [dialog, user]);

  // TODO(header-home-link): Validate home navigation tracking once error telemetry is wired.
  const handleHomeClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      navigate('/');
    } catch (err) {
      logError('Failed to navigate to the home route from the header.', err);
    }
  }, [navigate]);

  const handleClearFiltersClick = useCallback(() => {
    try {
      clearItemListFilters();
      window.dispatchEvent(new Event(ITEM_LIST_FILTERS_RESET_REQUESTED_EVENT));
      setFilterSummaries([]);
      setHasStoredFilters(false);
      console.info('Stored item list filters cleared from header control.');
    } catch (err) {
      console.error('Failed to clear stored filters from header control', err);
    }
  }, []);

  const filterTooltip = filterSummaries.length
    ? `Aktive Filter:\n- ${filterSummaries.join('\n- ')}`
    : 'Gespeicherte Filter zurücksetzen';

  return (
    <header className="header">
      <div className="left">
        <Link
          id="header-home-button"
          to="/"
          onClick={handleHomeClick}
          aria-label="Startseite"
          title="Startseite"
        >
          <GoHome aria-hidden="true" />
        </Link>
        <h1><a id="homelink" href="/">rrrevamp_____</a></h1>
        <nav className="header-nav" aria-label="Hauptnavigation">
          {/* TODO(navigation): Re-evaluate header icon spacing if more nav items are added. */}
          <Link
            to="/items/new"
            aria-label="Artikel erfassen"
            title="Artikel erfassen"
          >
            <GoPlus aria-hidden="true" />
          </Link>
          <Link
            to="/items"
            aria-label="Artikelliste"
            title="Artikelliste"
          >
            <GoListUnordered aria-hidden="true" />
          </Link>
          <Link
            to="/boxes"
            aria-label="Behälterliste"
            title="Behälterliste"
          >
            <GoArchive aria-hidden="true" />
          </Link>
          <Link
            to="/activities"
            aria-label="Aktivitäten"
            title="Aktivitäten"
          >
            <GoPulse aria-hidden="true" />
          </Link>
        </nav>
      </div>
      <div className="right">
        {hasStoredFilters ? (
          <button
            aria-label="Gespeicherte Filter löschen"
            className="header-filter-indicator"
            onClick={handleClearFiltersClick}
            title={filterTooltip}
            type="button"
          >
            <GoFilter aria-hidden="true" />
          </button>
        ) : null}
        <div
          className="user"
          onDoubleClick={handleUserDoubleClick}
          title="Doppelklicken zum Bearbeiten des Benutzernamens"
          aria-label="Benutzername, doppelklicken zum Bearbeiten"
        >
          {user}
        </div>
      </div>
    </header>
  );
}
