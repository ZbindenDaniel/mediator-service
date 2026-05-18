import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUser, setUser as persistUser } from '../lib/user';
import { useDialog } from './dialog';
import { GoArchive, GoListUnordered, GoPlus, GoPulse, GoQuestion, GoSearch, GoTag } from 'react-icons/go';
import { logError } from '../utils/logger';
import { usePanelContext } from '../context/PanelContext';
import type { Item } from '../../../models';
import QrScanButton from './QrScanButton';

type SearchResult =
  | { type: 'item'; item: Item }
  | { type: 'box'; id: string; locationId?: string | null; label?: string | null };

function resolveDirectTarget(term: string): { type: 'item' | 'box'; id: string } | null {
  const t = term.trim();
  if (!t) return null;
  const prefix = t.slice(0, 2).toUpperCase();
  if (prefix === 'I-') return { type: 'item', id: t };
  if (prefix === 'B-' || prefix === 'S-') return { type: 'box', id: t };
  return null;
}

// TODO(filter-indicator): Surface stored filter state changes in the header and allow quick reset.
// TODO(filter-indicator-accessibility): Validate whether deep-link filter color needs a text label for screen-reader parity.
export default function Header() {
  const dialog = useDialog();
  const navigate = useNavigate();
  const { setCreateMode, setEntity, setMobileShowDetail } = usePanelContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchFormRef = useRef<HTMLFormElement | null>(null);
  const [user, setUserState] = useState(() => getUser().trim());

  useEffect(() => {
    setUserState(getUser().trim());
  }, []);


  // Close dropdown on outside click
  useEffect(() => {
    if (!isSearchOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (searchFormRef.current && !searchFormRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isSearchOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    if (!isSearchOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSearchOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSearchOpen]);

  const runSearch = useCallback(async (term: string) => {
    const t = term.trim();
    if (!t) return;

    // Direct ID navigation — no API call needed
    const direct = resolveDirectTarget(t);
    if (direct) {
      setSearchQuery('');
      setIsSearchOpen(false);
      setEntity(direct.type, direct.id);
      navigate(direct.type === 'item' ? '/items' : '/boxes');
      return;
    }

    setIsSearching(true);
    setSearchResults([]);
    setIsSearchOpen(true);
    try {
      const res = await fetch(`/api/search?term=${encodeURIComponent(t)}`);
      if (!res.ok) {
        logError('Header search HTTP error', new Error(`status ${res.status}`), { term: t });
        return;
      }
      const data = await res.json() as { items?: Item[]; boxes?: Array<{ BoxID: string; LocationId?: string | null; Label?: string | null }> };
      const next: SearchResult[] = [];
      (data.items ?? []).forEach((item) => next.push({ type: 'item', item }));
      (data.boxes ?? []).forEach((b) => next.push({ type: 'box', id: b.BoxID, locationId: b.LocationId, label: b.Label }));
      setSearchResults(next);
      setIsSearchOpen(true);
    } catch (err) {
      logError('Header search failed', err, { term: t });
    } finally {
      setIsSearching(false);
    }
  }, [navigate, setEntity]);

  const handleSearchSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(searchQuery);
  }, [runSearch, searchQuery]);

  const handleResultClick = useCallback((result: SearchResult) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    if (result.type === 'item') {
      setEntity('item', result.item.ItemUUID);
      navigate('/items');
    } else {
      setEntity('box', result.id);
      navigate('/boxes');
    }
  }, [navigate, setEntity]);

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
      if (!trimmed || trimmed === user) return;
      persistUser(trimmed);
      setUserState(trimmed);
    } catch (err) {
      console.error('Failed to update username through dialog', err);
    }
  }, [dialog, user]);

  return (
    <header className="header">
      <div className="left">
        <h1><a id="homelink" href="/">rrrevamp_____</a></h1>
        <nav className="header-nav" aria-label="Hauptnavigation">
          {/* TODO(navigation): Re-evaluate header icon spacing if more nav items are added. */}
          <button
            type="button"
            className="header-nav__icon-btn"
            aria-label="Artikel erfassen"
            title="Artikel erfassen"
            onClick={() => { setCreateMode('item'); navigate('/items'); }}
          >
            <GoPlus aria-hidden="true" />
          </button>
          <Link to="/items" aria-label="Artikelliste" title="Artikelliste" onClick={() => setMobileShowDetail(false)}>
            <GoListUnordered aria-hidden="true" />
          </Link>
          <Link to="/boxes" aria-label="Behälterliste" title="Behälterliste" onClick={() => setMobileShowDetail(false)}>
            <GoArchive aria-hidden="true" />
          </Link>
          <Link to="/activities" aria-label="Aktivitäten" title="Aktivitäten" onClick={() => setMobileShowDetail(false)}>
            <GoPulse aria-hidden="true" />
          </Link>
          <Link to="/stubs" aria-label="Stubs" title="Stubs" onClick={() => setMobileShowDetail(false)}>
            <GoTag aria-hidden="true" />
          </Link>
          <Link to="/hilfe" aria-label="Hilfe" title="Hilfe" onClick={() => setMobileShowDetail(false)}>
            <GoQuestion aria-hidden="true" />
          </Link>
          <QrScanButton label="QR-Code scannen" />
          <form
            className="header-search"
            onSubmit={handleSearchSubmit}
            role="search"
            ref={searchFormRef}
          >
            <label htmlFor="header-search-input" className="visually-hidden">Suchen</label>
            <input
              id="header-search-input"
              type="search"
              className="header-search__input"
              placeholder="Suchen…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Suchen"
              aria-expanded={isSearchOpen}
              aria-autocomplete="list"
              autoComplete="off"
            />
            <button type="submit" className="header-search__btn" aria-label="Suche starten" title="Suche starten">
              <GoSearch aria-hidden="true" />
            </button>
            {isSearchOpen && (
              <div className="header-search__dropdown" role="listbox" aria-label="Suchergebnisse">
                {isSearching && (
                  <div className="header-search__dropdown-status">Suche läuft…</div>
                )}
                {!isSearching && searchResults.length === 0 && (
                  <div className="header-search__dropdown-status">Keine Ergebnisse.</div>
                )}
                {searchResults.map((result, idx) => (
                  result.type === 'item' ? (
                    <button
                      key={result.item.ItemUUID}
                      type="button"
                      className="header-search__result"
                      role="option"
                      onClick={() => handleResultClick(result)}
                    >
                      <span className="header-search__result-pill">{result.item.Artikel_Nummer || '—'}</span>
                      <span className="header-search__result-desc">{result.item.Artikelbeschreibung || ''}</span>
                    </button>
                  ) : (
                    <button
                      key={`box-${result.id}-${idx}`}
                      type="button"
                      className="header-search__result"
                      role="option"
                      onClick={() => handleResultClick(result)}
                    >
                      <span className="header-search__result-pill mono">{result.id}</span>
                      <span className="header-search__result-desc muted">{result.label ?? result.locationId ?? ''}</span>
                    </button>
                  )
                ))}
              </div>
            )}
          </form>
        </nav>
      </div>
      <div className="right">
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
