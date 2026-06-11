import React, { useState } from 'react';
import { useUserMarks } from '../../context/UserMarksContext';
import { getUser } from '../../lib/user';

interface MarkEntry {
  username: string;
  note: string | null;
  createdAt: string;
}

interface Props {
  itemUUID: string;
  allMarks: MarkEntry[];
  onMarksChanged: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function ItemMarkierungTab({ itemUUID, allMarks, onMarksChanged }: Props) {
  const { isMarked, getNote, saveMark, removeMark } = useUserMarks();
  const [noteInput, setNoteInput] = useState<string>(() => getNote(itemUUID) ?? '');
  const [saving, setSaving] = useState(false);
  const marked = isMarked(itemUUID);
  const username = getUser().trim();

  async function handleSave() {
    if (!username) return;
    setSaving(true);
    try {
      await saveMark(itemUUID, noteInput.trim() || null);
      onMarksChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!username) return;
    setSaving(true);
    try {
      await removeMark(itemUUID);
      setNoteInput('');
      onMarksChanged();
    } finally {
      setSaving(false);
    }
  }

  if (!username) {
    return (
      <div className="card">
        <p className="muted">Bitte zuerst Benutzernamen setzen.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {allMarks.length > 0 && (
        <div className="card">
          <h3>Markierungen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {allMarks.map((m) => (
              <li key={m.username} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={{ fontWeight: 600 }}>
                  {m.username}
                  {m.username === username ? ' (Sie)' : ''}
                  <span className="muted" style={{ fontWeight: 400, marginLeft: '0.5rem', fontSize: '0.85em' }}>
                    {formatDate(m.createdAt)}
                  </span>
                </span>
                {m.note ? (
                  <span className="muted" style={{ whiteSpace: 'pre-wrap' }}>{m.note}</span>
                ) : (
                  <span className="muted" style={{ fontStyle: 'italic' }}>Keine Notiz</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>Markierung</h3>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          {marked
            ? 'Dieser Artikel ist von Ihnen markiert.'
            : 'Dieser Artikel ist nicht markiert.'}
        </p>
        <label className="filter-control" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
          <span>Notiz</span>
          <textarea
            rows={4}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
            placeholder="Optionale Notiz…"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            disabled={saving}
          />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {marked ? 'Notiz speichern' : 'Merken'}
          </button>
          {marked && (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void handleRemove()}
              disabled={saving}
            >
              Markierung entfernen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
