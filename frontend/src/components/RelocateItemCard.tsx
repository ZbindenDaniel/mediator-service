import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ensureUser } from '../lib/user';
import { dialogService } from './dialog';
import { Link } from 'react-router-dom';
import { GoLinkExternal } from 'react-icons/go';

interface Props {
  itemId: string;
  onRelocated?: () => void | Promise<void>;
}

export default function RelocateItemCard({ itemId, onRelocated }: Props) {
  const [boxId, setBoxId] = useState('');
  const [suggestions, setSuggestions] = useState<{ BoxID: string; Location?: string | null }[]>([]);
  const [status, setStatus] = useState('');
  const [boxLink, setBoxLink] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSuggestionVisible, setSuggestionVisible] = useState(false);
  const hideTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const v = boxId.trim();
    if (v.length < 2) { setSuggestions([]); return; }
    const ctrl = new AbortController();
    async function search() {
      try {
        const r = await fetch('/api/search?scope=boxes&term=' + encodeURIComponent(v), { signal: ctrl.signal });
        if (!r.ok) {
          console.error('Box search HTTP error', r.status);
          return;
        }
        const data = await r.json().catch(() => ({}));
        console.debug('Box search returned', (data.boxes || []).length, 'matches for', v);
        setSuggestions(data.boxes || []);
      } catch (err) {
        if ((err as any).name !== 'AbortError') console.error('box search failed', err);
      }
    }
    search();
    return () => ctrl.abort();
  }, [boxId]);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    const actor = await ensureUser();
    if (!actor) {
      console.info('Relocate item aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for item relocation', error);
      }
      return;
    }
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toBoxId: boxId, actor })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('Artikel verschoben');
        setBoxLink(`/boxes/${encodeURIComponent(boxId)}`)
        console.info('Relocate item succeeded', {
          itemId,
          toBoxId: boxId,
          status: res.status,
          response: data
        });
        if (typeof onRelocated === 'function') {
          try {
            await onRelocated();
            console.info('Relocate item onRelocated callback completed', { itemId, toBoxId: boxId });
          } catch (callbackErr) {
            console.error('Relocate item onRelocated callback failed', {
              itemId,
              toBoxId: boxId,
              error: callbackErr
            });
          }
        }
      } else {
        const errorMessage = 'Fehler: ' + (data.error || res.status);
        setStatus(errorMessage);
        console.warn('Relocate item failed', {
          itemId,
          toBoxId: boxId,
          status: res.status,
          error: data.error ?? data
        });
      }
    } catch (err) {
      console.error('Relocate item request failed', { itemId, toBoxId: boxId, error: err });
      setStatus('Verschieben fehlgeschlagen');
    }
  }

  async function handleCreateBox() {
    const actor = await ensureUser();
    if (!actor) {
      console.info('Create box aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for box creation', error);
      }
      return;
    }
    try {
      const res = await fetch(`/api/boxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) {
        setBoxId(data.id);
        setStatus('Behälter erstellt. Bitte platzieren!');
      } else {
        setStatus('Fehler: ' + (data.error || res.status));
      }
      console.log('create box', res.status, data.id);
    } catch (err) {
      console.error('Create box failed', err);
      setStatus('Behälter anlegen fehlgeschlagen');
    }
  }

  const filteredSuggestions = useMemo(() => {
    const term = boxId.trim().toLowerCase();
    if (!term) { return suggestions; }
    return suggestions.filter(suggestion => {
      const id = (suggestion.BoxID || '').toLowerCase();
      const location = (suggestion.Location || '').toLowerCase();
      return id.includes(term) || location.includes(term);
    });
  }, [boxId, suggestions]);

  useEffect(() => {
    setHighlightedIndex(prev => {
      if (filteredSuggestions.length === 0) { return -1; }
      if (prev >= filteredSuggestions.length) { return filteredSuggestions.length - 1; }
      return prev;
    });
  }, [filteredSuggestions]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [boxId]);

  const applySuggestion = (idx: number) => {
    const suggestion = filteredSuggestions[idx];
    if (!suggestion || !suggestion.BoxID) { return; }
    setBoxId(suggestion.BoxID);
    setSuggestionVisible(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!filteredSuggestions.length) { return; }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSuggestionVisible(true);
      setHighlightedIndex(prev => {
        const next = prev + 1;
        if (next >= filteredSuggestions.length) { return 0; }
        return next;
      });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSuggestionVisible(true);
      setHighlightedIndex(prev => {
        const next = prev - 1;
        if (next < 0) { return filteredSuggestions.length - 1; }
        return next;
      });
    } else if (event.key === 'Enter' && highlightedIndex >= 0) {
      event.preventDefault();
      applySuggestion(highlightedIndex);
    } else if (event.key === 'Escape') {
      setSuggestionVisible(false);
      setHighlightedIndex(-1);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setBoxId(event.target.value);
    setSuggestionVisible(true);
  };

  const handleFocus = () => {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = undefined;
    }
    setSuggestionVisible(true);
  };

  const handleBlur = () => {
    hideTimeoutRef.current = window.setTimeout(() => {
      setSuggestionVisible(false);
      setHighlightedIndex(-1);
    }, 120);
  };

  useEffect(() => () => {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
    }
  }, []);

  return (
    <div className="card relocate-card">
      <h3>Artikel umlagern</h3>
      <form onSubmit={handle}>
        <div className=''>
          <div className='row'>
            <label>
              Ziel Behälter-ID
            </label>
          </div>

          <div className='row'>
            <input
              value={boxId}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              required
              aria-autocomplete="list"
              aria-expanded={isSuggestionVisible && filteredSuggestions.length > 0}
              aria-activedescendant={highlightedIndex >= 0 ? `box-suggestion-${highlightedIndex}` : undefined}
            />
          </div>

          {isSuggestionVisible && filteredSuggestions.length > 0 && (
            <div className='row'>
              <div className="card suggestion-list" role="listbox">
                {filteredSuggestions.map((b, index) => (
                  <button
                    type="button"
                    key={b.BoxID}
                    id={`box-suggestion-${index}`}
                    className={`card suggestion-option${index === highlightedIndex ? ' active' : ''}`}
                    onMouseDown={event => { event.preventDefault(); applySuggestion(index); }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    role="option"
                    aria-selected={index === highlightedIndex}
                  >
                    <div className="mono">{b.BoxID}</div>
                    {b.Location ? <div className="muted">{b.Location}</div> : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className='row'>
            <button type="submit">Verschieben</button>
            <button type="button" onClick={handleCreateBox}>Behälter anlegen</button>
          </div>

          <div className='row'>
            {status && <div>
              <span>
                {status}   
              </span>
              <span>
                {boxLink && <Link to={boxLink}><GoLinkExternal/></Link>}
              </span>
            </div>}
          </div>
          <div className='row'>
          </div>
        </div>
      </form>
    </div>
  );
}
