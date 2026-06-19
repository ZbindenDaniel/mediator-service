import React, { useEffect, useRef, useState } from 'react';
import RefSearchInput, { type RefSuggestion } from './RefSearchInput';
import { getUser } from '../lib/user';

interface Props {
  deviceItemUUID: string;
  deviceLabel: string;
  deviceHersteller?: string | null;
  slotKey: string;
  slotLabel: string;
  onComplete: (newItemUUID: string) => void;
  onClose: () => void;
}

export default function SparepartSlotPopup({
  deviceItemUUID,
  deviceLabel,
  deviceHersteller,
  slotKey,
  slotLabel,
  onComplete,
  onClose,
}: Props) {
  const [suggestions, setSuggestions] = useState<RefSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const term = [deviceHersteller, slotLabel].filter(Boolean).join(' ');
    fetch(`/api/search?scope=refs&term=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: any) => {
        setSuggestions(Array.isArray(data.items) ? data.items.slice(0, 5) : []);
        setLoading(false);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') {
          setSuggestions([]);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [deviceHersteller, slotLabel]);

  async function handleConfirm(ref: RefSuggestion) {
    const actor = getUser();
    if (!actor) {
      setError('Bitte zuerst Benutzernamen setzen.');
      return;
    }
    const idx = suggestions.indexOf(ref);
    setConfirmingIndex(idx);
    setError(null);
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(deviceItemUUID)}/spare-parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artikelNummer: ref.Artikel_Nummer, actor, slotKey })
      });
      if (res.ok) {
        const data = await res.json();
        onComplete(data.itemUUID);
      } else {
        const err = await res.json().catch(() => ({}));
        setError((err as any).error || 'Fehler beim Katalogisieren');
      }
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setConfirmingIndex(null);
    }
  }

  return (
    <div
      className="card"
      style={{ position: 'absolute', zIndex: 100, minWidth: 320, maxWidth: 480, padding: '1rem', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <strong>{slotLabel} katalogisieren</strong>
        <button type="button" className="sml-btn btn" onClick={onClose} aria-label="Schließen">✕</button>
      </div>
      <p className="muted" style={{ margin: '0 0 0.75rem' }}>aus: {deviceLabel}</p>

      {error && <p style={{ color: 'var(--color-error, #d73a49)', margin: '0 0 0.5rem' }}>{error}</p>}

      {loading && <p className="muted">Suche läuft…</p>}

      {!loading && suggestions.length > 0 && !showSearch && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.5rem' }}>
          <tbody>
            {suggestions.map((s, i) => (
              <tr key={s.Artikel_Nummer} style={{ borderBottom: '1px solid var(--color-border, #e0e0e0)' }}>
                <td style={{ padding: '0.375rem 0' }}>
                  <div>{s.Artikelbeschreibung || s.Kurzbeschreibung || s.Artikel_Nummer}</div>
                  <div className="muted mono" style={{ fontSize: '0.8em' }}>{s.Artikel_Nummer}</div>
                </td>
                <td style={{ padding: '0.375rem 0 0.375rem 0.5rem', whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    className="btn btn--primary"
                    style={{ fontSize: '0.85em', padding: '0.2rem 0.6rem' }}
                    disabled={confirmingIndex !== null}
                    onClick={() => handleConfirm(s)}
                  >
                    {confirmingIndex === i ? '…' : 'Ist es das?'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && suggestions.length === 0 && !showSearch && (
        <p className="muted" style={{ margin: '0 0 0.5rem' }}>Keine Vorschläge gefunden.</p>
      )}

      {showSearch ? (
        <div style={{ marginTop: '0.5rem' }}>
          <RefSearchInput
            placeholder={`${slotLabel} suchen…`}
            disabled={confirmingIndex !== null}
            onSelected={(ref) => handleConfirm(ref)}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button type="button" className="btn btn--secondary" style={{ fontSize: '0.85em' }} onClick={() => setShowSearch(true)}>
            Anderen suchen
          </button>
        </div>
      )}
    </div>
  );
}
