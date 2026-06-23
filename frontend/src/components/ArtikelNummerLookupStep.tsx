import React, { useEffect, useRef, useState } from 'react';
import type { SimilarItem } from './forms/useSimilarItems';

interface Props {
  onSelect: (ref: SimilarItem) => void;
  onSkip: (query?: string) => void;
  layout?: 'page' | 'embedded';
}

export default function ArtikelNummerLookupStep({ onSelect, onSkip, layout = 'page' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SimilarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    controllerRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const params = new URLSearchParams({ term: trimmed, scope: 'refs', limit: '10' });
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (!res.ok) {
          setError(`Suche fehlgeschlagen (${res.status})`);
          setResults([]);
        } else {
          const data = await res.json();
          setResults(Array.isArray(data?.items) ? data.items : []);
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          setError('Suche nicht möglich.');
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controllerRef.current?.abort();
    };
  }, [query]);

  const hasQuery = query.trim().length > 0;

  const body = (
    <div className="item-create__step">
      <div className="item-create__step-header">
        <h2>Artikelnummer suchen</h2>
        <p className="muted">
          Artikelnummer eingeben, um einen bestehenden ERP-Artikel zu verwenden und das Formular zu überspringen.
        </p>
      </div>

      <div className="row">
        <label>Artikelnummer</label>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="z. B. 000123"
        />
      </div>

      {loading && <p className="muted">Suche läuft…</p>}
      {error && <p style={{ color: 'var(--color-error, #d73a49)' }}>{error}</p>}

      {!loading && hasQuery && results.length === 0 && !error && (
        <p className="muted">Kein Artikel gefunden – bitte ohne Nummer weiter.</p>
      )}

      {results.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem', marginBottom: '0.75rem' }}>
          <tbody>
            {results.map((ref) => (
              <tr key={ref.Artikel_Nummer} style={{ borderBottom: '1px solid var(--line, #e0e0e0)' }}>
                <td style={{ padding: '0.375rem 0' }}>
                  <div>{ref.Artikelbeschreibung || ref.Kurzbeschreibung || ref.Artikel_Nummer}</div>
                  {ref.Hersteller && (
                    <div className="muted" style={{ fontSize: '0.85em' }}>{ref.Hersteller}</div>
                  )}
                  <div className="muted mono" style={{ fontSize: '0.8em' }}>{ref.Artikel_Nummer}</div>
                </td>
                <td style={{ padding: '0.375rem 0 0.375rem 0.75rem', whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    className="btn btn--primary"
                    style={{ fontSize: '0.85em', padding: '0.2rem 0.6rem' }}
                    onClick={() => onSelect(ref)}
                  >
                    Übernehmen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div
        className="item-create__step-actions"
        style={{ borderTop: '1px solid var(--line, #e0e0e0)', paddingTop: '1rem', marginTop: '1rem' }}
      >
        <button type="button" className="btn btn--secondary" onClick={() => onSkip(query.trim() || undefined)}>
          Ohne Artikelnummer weiter →
        </button>
      </div>
    </div>
  );

  const card = <div className="card">{body}</div>;

  if (layout === 'embedded') {
    return card;
  }

  return <div className="container item">{card}</div>;
}
