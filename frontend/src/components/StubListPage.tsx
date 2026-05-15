import React, { useEffect, useState } from 'react';
import { GoPlus, GoX } from 'react-icons/go';
import { getUser } from '../lib/user';

type BoxStub = {
  Id: string;
  ShelfId: string;
  Description: string;
  NumberLooseItems: number;
  NumberLooseBoxes: number;
  CreatedAt: string;
  CreatedBy: string;
  IsActive: number;
  Notes: string | null;
};

const EMPTY_FORM = { shelfId: '', description: '', numberLooseItems: '', numberLooseBoxes: '', notes: '' };

export default function StubListPage() {
  const [stubs, setStubs] = useState<BoxStub[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function loadStubs() {
    fetch('/api/stubs')
      .then((r) => r.json())
      .then((data) => setStubs(Array.isArray(data.stubs) ? data.stubs : []))
      .catch(() => setError('Stubs konnten nicht geladen werden.'));
  }

  useEffect(() => { loadStubs(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.shelfId.trim()) { setFormError('Regal-ID ist erforderlich.'); return; }
    if (!form.description.trim()) { setFormError('Beschreibung ist erforderlich.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/stubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shelfId: form.shelfId.trim(),
          description: form.description.trim(),
          numberLooseItems: parseInt(form.numberLooseItems || '0', 10) || 0,
          numberLooseBoxes: parseInt(form.numberLooseBoxes || '0', 10) || 0,
          notes: form.notes.trim() || null,
          createdBy: getUser(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormError((err as any).error ?? 'Fehler beim Speichern.');
        return;
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadStubs();
    } catch {
      setFormError('Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="list-container">
      <div className="list-header">
        <h2>Stubs</h2>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => { setShowForm(true); setFormError(null); }}
        >
          <GoPlus aria-hidden="true" /> Stub hinzufügen
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <strong>Neuer Stub</strong>
            <button type="button" className="icon-btn" onClick={() => setShowForm(false)} aria-label="Schliessen">
              <GoX />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label htmlFor="stub-shelf">Regal-ID <span aria-hidden="true">*</span></label>
              <input
                id="stub-shelf"
                type="text"
                placeholder="z.B. S-12"
                value={form.shelfId}
                onChange={(e) => setForm((f) => ({ ...f, shelfId: e.target.value }))}
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="stub-desc">Beschreibung <span aria-hidden="true">*</span></label>
              <input
                id="stub-desc"
                type="text"
                placeholder="z.B. alte Laptops und Modems"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                required
              />
            </div>
            <div className="form-row form-row--inline">
              <div>
                <label htmlFor="stub-loose-items">Lose Artikel</label>
                <input
                  id="stub-loose-items"
                  type="number"
                  min="0"
                  value={form.numberLooseItems}
                  onChange={(e) => setForm((f) => ({ ...f, numberLooseItems: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="stub-loose-boxes">Lose Kartons</label>
                <input
                  id="stub-loose-boxes"
                  type="number"
                  min="0"
                  value={form.numberLooseBoxes}
                  onChange={(e) => setForm((f) => ({ ...f, numberLooseBoxes: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="stub-notes">Notizen</label>
              <input
                id="stub-notes"
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {formError && <div className="error-text" style={{ marginBottom: '0.5rem' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
              <button type="button" className="btn" onClick={() => setShowForm(false)}>Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      {error && <div className="muted">{error}</div>}

      {!error && stubs.length === 0 && (
        <div className="muted">Keine aktiven Stubs vorhanden.</div>
      )}

      {stubs.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Regal</th>
              <th>Beschreibung</th>
              <th>Lose Artikel</th>
              <th>Lose Kartons</th>
              <th>Erstellt von</th>
              <th>Datum</th>
            </tr>
          </thead>
          <tbody>
            {stubs.map((stub) => (
              <tr key={stub.Id}>
                <td><span className="mono">{stub.ShelfId}</span></td>
                <td>{stub.Description}{stub.Notes ? <span className="muted"> — {stub.Notes}</span> : null}</td>
                <td>{stub.NumberLooseItems || '—'}</td>
                <td>{stub.NumberLooseBoxes || '—'}</td>
                <td>{stub.CreatedBy}</td>
                <td className="muted">{new Date(stub.CreatedAt).toLocaleDateString('de-CH')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
