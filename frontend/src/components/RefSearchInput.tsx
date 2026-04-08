import React, { useEffect, useRef, useState } from 'react';

export interface RefSuggestion {
  Artikel_Nummer: string;
  Artikelbeschreibung?: string;
  Kurzbeschreibung?: string;
}

interface RefSearchInputProps {
  placeholder?: string;
  disabled?: boolean;
  onSelected: (ref: RefSuggestion) => void;
}

const MIN_QUERY_LENGTH = 2;

export default function RefSearchInput({ placeholder, disabled, onSelected }: RefSearchInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<RefSuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSuggestionVisible, setSuggestionVisible] = useState(false);
  const hideTimeoutRef = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = inputValue.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setSuggestionVisible(false);
      setHighlightedIndex(-1);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch('/api/search?scope=refs&term=' + encodeURIComponent(term), { signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: any) => {
        setSuggestions(Array.isArray(data.items) ? data.items : []);
        setSuggestionVisible(true);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') console.error('Ref search failed', err);
      });

    return () => controller.abort();
  }, [inputValue]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
  }, []);

  function applySuggestion(index: number) {
    const s = suggestions[index];
    if (!s) return;
    setInputValue('');
    setSuggestions([]);
    setSuggestionVisible(false);
    setHighlightedIndex(-1);
    onSelected(s);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestionVisible(true);
      setHighlightedIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestionVisible(true);
      setHighlightedIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      applySuggestion(highlightedIndex);
    } else if (e.key === 'Escape') {
      setSuggestionVisible(false);
      setHighlightedIndex(-1);
    }
  }

  function handleBlur() {
    hideTimeoutRef.current = window.setTimeout(() => {
      setSuggestionVisible(false);
      setHighlightedIndex(-1);
    }, 120);
  }

  function handleFocus() {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = undefined;
    }
    if (suggestions.length > 0) setSuggestionVisible(true);
  }

  return (
    <div className="box-search" style={{ flex: 1, minWidth: '200px' }}>
      <div className="box-search__field">
        <input
          className="box-search__input"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setSuggestionVisible(true); }}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder ?? 'Artikeltyp suchen…'}
          disabled={disabled}
          aria-autocomplete="list"
          aria-expanded={isSuggestionVisible && suggestions.length > 0}
          aria-activedescendant={highlightedIndex >= 0 ? `ref-suggestion-${highlightedIndex}` : undefined}
        />
      </div>
      {isSuggestionVisible && suggestions.length > 0 && (
        <div className="box-search__suggestions card suggestion-list" role="listbox">
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={s.Artikel_Nummer}
              id={`ref-suggestion-${i}`}
              className={`card suggestion-option${i === highlightedIndex ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applySuggestion(i); }}
              onMouseEnter={() => setHighlightedIndex(i)}
              role="option"
              aria-selected={i === highlightedIndex}
            >
              <div>{s.Artikelbeschreibung || s.Kurzbeschreibung || s.Artikel_Nummer}</div>
              <div className="muted mono">{s.Artikel_Nummer}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
