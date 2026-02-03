import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Item } from '../../../models';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import LocationTag from './LocationTag';
import QrScanButton from './QrScanButton';
import { logError, logger } from '../utils/logger';

// TODO(agent): Double-check that the simplified LocationTag output matches the search results layout expectations.
// TODO(navigation): Review header navigation labels before adding new search shortcuts here.
// TODO(deep-search): Add an explicit deep-search toggle to this card when UX copy is ready.
// TODO(agent): Confirm box search rows still prefer label overrides over IDs once API fields expand.
// TODO(qr-search): Validate QR return handling after relocating the scan entry into this card.
// TODO(qr-search): Confirm direct QR search navigation aligns with the intended item/box prefixes.
// TODO(qr-search): Reconfirm "Suchen" button placement once scan-in-input UX feedback is captured.

type SearchResult =
  | { type: 'box'; id: string; locationId?: string | null; label?: string | null }
  | { type: 'item'; item: Item };

export default function SearchCard() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const qrReturnTo = useMemo(() => `${location.pathname}${location.search}#find`, [location.pathname, location.search]);

  const resolveDirectTarget = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      return null;
    }
    const prefix = trimmed.slice(0, 2).toUpperCase();
    if (prefix === 'I-') {
      return { id: trimmed, path: `/items/${encodeURIComponent(trimmed)}` };
    }
    if (prefix === 'B-' || prefix === 'S-') {
      return { id: trimmed, path: `/boxes/${encodeURIComponent(trimmed)}` };
    }
    return null;
  }, []);

  const runFind = useCallback(async (term?: string, source: 'manual' | 'qr-return' = 'manual') => {
    const v = (term ?? query).trim();
    setResults([]);
    if (!v) {
      logger.warn?.('Search query is empty', { source });
      return;
    }
    const directTarget = resolveDirectTarget(v);
    if (directTarget) {
      logger.info?.('SearchCard: navigating directly from QR search', { source, id: directTarget.id, path: directTarget.path });
      try {
        navigate(directTarget.path);
      } catch (error) {
        logError('SearchCard: direct navigation failed', error, { source, id: directTarget.id, path: directTarget.path });
      }
      return;
    }
    try {
      const r = await fetch('/api/search?term=' + encodeURIComponent(v));
      if (!r.ok) {
        logger.error?.('Search HTTP error', { status: r.status, source });
        return;
      }
      const data = await r.json();
      logger.info?.('Search data', { source, data });
      const next: SearchResult[] = [];
      (data.items || []).forEach((it: Item) => next.push({ type: 'item', item: it }));
      (data.boxes || []).forEach((b: any) => next.push({ type: 'box', id: b.BoxID, locationId: b.LocationId, label: b.Label }));
      logger.info?.('Search returned', {
        source,
        items: (data.items || []).length,
        boxes: (data.boxes || []).length
      });
      setResults(next);
    } catch (err) {
      logError('Search failed', err, { source, query: v });
    }
  }, [navigate, query, resolveDirectTarget]);

  useEffect(() => {
    if (!location.state || typeof location.state !== 'object') {
      return;
    }
    const state = location.state as { qrReturn?: { id?: unknown; rawPayload?: unknown } };
    if (!state.qrReturn) {
      return;
    }
    try {
      const id = typeof state.qrReturn.id === 'string' ? state.qrReturn.id.trim() : '';
      if (!id) {
        logger.warn?.('SearchCard: ignoring QR return payload with empty id', { qrReturn: state.qrReturn });
        return;
      }
      setQuery(id);
      logger.info?.('SearchCard: received QR return payload', { id });
      void runFind(id, 'qr-return');
      try {
        navigate(location.pathname, { replace: true, state: {} });
      } catch (error) {
        logError('SearchCard: failed to clear QR return location state', error, { id });
      }
    } catch (error) {
      logError('SearchCard: failed to process QR return payload', error);
    }
  }, [location.pathname, location.state, navigate, runFind]);

  return (
    <div className="card" id="find">
      <div className="card-header">
        <h2>Finden</h2>
      </div>
      <div className="row search-row">
        <div className="search-input-row">
          <div className="search-input-wrapper">
            <input
              className="search-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="z.B. Lenovo x230, B-151025, Brother, 07045"
              onKeyDown={e => { if (e.key === 'Enter') void runFind(); }}
              autoFocus
            />
            <QrScanButton className="search-input-qr" label="QR scannen" returnTo={qrReturnTo} />
          </div>
        </div>
        <button className="btn search-submit" onClick={() => { void runFind(); }}>Suchen</button>
      </div>
      <div className="list search-results" style={{ marginTop: '10px' }}>
        {results.map((res, idx) =>
          res.type === 'box' ? (
            <div className="search-results-row" key={`b-${idx}`}>
              <div className="mono">
                <Link to={`/boxes/${encodeURIComponent(res.id)}`}>Behälter: {res.id}</Link>
              </div>
              <div className="muted">
                <LocationTag locationKey={res.locationId} labelOverride={res.label} />
              </div>
              <div />
            </div>
          ) : (
            <div className="search-results-row" key={res.item.ItemUUID}>
              <div>
                <Link to={`/items/${encodeURIComponent(res.item.ItemUUID)}`}>
                  <span className="pill mono">
                    {(res.item.ItemUUID || '').slice(-6).toUpperCase()}
                  </span>
                </Link>
              </div>
              <div className="muted">{res.item.Artikelbeschreibung || ''}</div>
              <div>
                {res.item.BoxID && (
                  <>
                    Behälter:{' '}
                    <a href={`/boxes/${encodeURIComponent(res.item.BoxID)}`}>
                      {res.item.BoxID}
                    </a>
                  </>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
