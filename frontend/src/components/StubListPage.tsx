import React, { useEffect, useState } from 'react';
import { GoPlus, GoTrash, GoX } from 'react-icons/go';
import { getUser } from '../lib/user';
import { usePanelContext } from '../context/PanelContext';

type BoxStub = {
  Id: string;
  ShelfId: string;
  Description: string;
  NumberLooseItems: number;
  CreatedAt: string;
  CreatedBy: string;
  IsActive: number;
  Notes: string | null;
};

const EMPTY_FORM = { shelfId: '', description: '', numberLooseItems: '', notes: '' };

export default function StubListPage() {
  const { setEntity, setMainView } = usePanelContext();
  const [stubs, setStubs] = useState<BoxStub[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function loadStubs() {
    fetch('/api/stubs')
      .then((r) => r.json())
      .then((data) => setStubs(Array.isArray(data.stubs) ? data.stubs : []))
      .catch(() => setError('Stubs konnten nicht geladen werden.'));
  }

  useEffect(() => { loadStubs(); }, []);

  async function handleDelete(stub: BoxStub) {
    if (!window.confirm(`Fund löschen: "${stub.Description}"?`)) return;
    const actor = getUser();
    if (!actor) { setDeleteError('Bitte zuerst Benutzer setzen.'); return; }
    try {
      const res = await fetch(`/api/stubs/${encodeURIComponent(stub.Id)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor, confirm: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setDeleteError((err as any).error ?? 'Löschen fehlgeschlagen.');
        return;
      }
      setDeleteError(null);
      loadStubs();
    } catch {
      setDeleteError('Löschen fehlgeschlagen.');
    }
  }

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
        <h2>Fundsachen</h2>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => { setShowForm(true); setFormError(null); }}
        >
          <GoPlus aria-hidden="true" /> was gefunden?
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <strong>Neuer Fund</strong>
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
            <div className="form-row">
              <label htmlFor="stub-loose-items">Lose Artikel</label>
              <input
                id="stub-loose-items"
                type="number"
                min="0"
                value={form.numberLooseItems}
                onChange={(e) => setForm((f) => ({ ...f, numberLooseItems: e.target.value }))}
              />
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
      {deleteError && <div className="error-text" style={{ marginBottom: '0.5rem' }}>{deleteError}</div>}

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
              <th>Erstellt von</th>
              <th>Datum</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stubs.map((stub) => (
              <tr key={stub.Id}>
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => { setEntity('box', stub.ShelfId); setMainView('boxes'); }}
                  >
                    <span className="mono">{stub.ShelfId}</span>
                  </button>
                </td>
                <td>{stub.Description}{stub.Notes ? <span className="muted"> — {stub.Notes}</span> : null}</td>
                <td>{stub.NumberLooseItems || '—'}</td>
                <td>{stub.CreatedBy}</td>
                <td className="muted">{new Date(stub.CreatedAt).toLocaleDateString('de-CH')}</td>
                <td>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => { void handleDelete(stub); }}
                    aria-label="Löschen"
                  >
                    <GoTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
