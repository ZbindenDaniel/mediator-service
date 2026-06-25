import React, { useEffect, useRef, useState } from 'react';
import RefSearchInput, { type RefSuggestion } from './RefSearchInput';
import { getUser } from '../lib/user';

interface Props {
  deviceItemUUID: string;
  deviceLabel: string;
  deviceHersteller?: string | null;
  slotKey: string;
  slotLabel: string;
  targetSubcategory: number;
  instanceSpecs?: Record<string, string> | null;
  onComplete: (newItemUUID: string) => void;
  onClose: () => void;
}

export default function SparepartSlotPopup({
  deviceItemUUID,
  deviceLabel,
  deviceHersteller,
  slotKey,
  slotLabel,
  targetSubcategory,
  instanceSpecs,
  onComplete,
  onClose,
}: Props) {
  const [suggestions, setSuggestions] = useState<RefSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createDesc, setCreateDesc] = useState(`${deviceHersteller ? deviceHersteller + ' ' : ''}${slotLabel}`);
  const [createHersteller, setCreateHersteller] = useState(deviceHersteller ?? '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const term = slotLabel;
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

  async function handleCreate() {
    const actor = getUser();
    if (!actor) { setError('Bitte zuerst Benutzernamen setzen.'); return; }
    if (!createDesc.trim()) { setError('Beschreibung ist erforderlich.'); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(deviceItemUUID)}/spare-parts/new-ref`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artikelbeschreibung: createDesc.trim(),
          hersteller: createHersteller.trim() || null,
          subCategory: targetSubcategory,
          actor,
          slotKey,
          instanceSpecs: instanceSpecs ?? undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        onComplete(data.itemUUID);
      } else {
        const err = await res.json().catch(() => ({}));
        setError((err as any).error || 'Fehler beim Anlegen');
      }
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <strong>{slotLabel} katalogisieren</strong>
        <button type="button" className="sml-btn btn" onClick={onClose} aria-label="Schließen">✕</button>
      </div>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85em' }}>aus: {deviceLabel}</p>

      {error && <p style={{ color: 'var(--color-error, #d73a49)', margin: '0 0 0.5rem' }}>{error}</p>}

      {/* Search — always visible */}
      <RefSearchInput
        placeholder={`${slotLabel} suchen…`}
        disabled={confirmingIndex !== null}
        onSelected={(ref) => handleConfirm(ref)}
      />

      {/* Initial suggestions */}
      {loading && <p className="muted" style={{ marginTop: '0.5rem' }}>Suche läuft…</p>}
      {!loading && suggestions.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0 }}>
          {suggestions.map((s, i) => (
            <li
              key={s.Artikel_Nummer}
              style={{ borderBottom: '1px solid var(--line, #e0e0e0)', padding: '0.375rem 0.25rem', cursor: confirmingIndex !== null ? 'wait' : 'pointer' }}
              onClick={() => confirmingIndex === null && handleConfirm(s)}
            >
              <div style={{ fontWeight: 500 }}>{s.Artikelbeschreibung || s.Kurzbeschreibung || s.Artikel_Nummer}</div>
              <div className="muted mono" style={{ fontSize: '0.78em' }}>{s.Artikel_Nummer}{confirmingIndex === i ? ' …' : ''}</div>
            </li>
          ))}
        </ul>
      )}
      {!loading && suggestions.length === 0 && (
        <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.85em' }}>Keine Vorschläge. Suche oben oder lege neu an.</p>
      )}

      {/* Neu anlegen */}
      <div style={{ marginTop: '1rem', borderTop: '1px solid var(--line, #e0e0e0)', paddingTop: '0.75rem' }}>
        {!showCreate ? (
          <button type="button" className="btn" style={{ fontSize: '0.85em' }} onClick={() => setShowCreate(true)}>
            + Neu anlegen
          </button>
        ) : (
          <>
            <strong style={{ fontSize: '0.9em' }}>Neuen Artikeltyp anlegen</strong>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input
                type="text"
                className="input"
                placeholder="Beschreibung"
                value={createDesc}
                onChange={e => setCreateDesc(e.target.value)}
                style={{ fontSize: '0.9em' }}
              />
              <input
                type="text"
                className="input"
                placeholder="Hersteller (optional)"
                value={createHersteller}
                onChange={e => setCreateHersteller(e.target.value)}
                style={{ fontSize: '0.9em' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ fontSize: '0.85em' }}
                  disabled={creating || !createDesc.trim()}
                  onClick={handleCreate}
                >
                  {creating ? '…' : 'Anlegen & katalogisieren'}
                </button>
                <button type="button" className="btn" style={{ fontSize: '0.85em' }} onClick={() => setShowCreate(false)}>
                  Abbrechen
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
