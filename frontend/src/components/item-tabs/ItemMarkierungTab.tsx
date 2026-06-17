import React, { useState, useEffect, useCallback } from 'react';
import { useUserMarks } from '../../context/UserMarksContext';
import { getUser } from '../../lib/user';

interface ItemMark {
  Username: string;
  Note: string | null;
  CreatedAt: string;
}

interface Props {
  itemUUID: string;
}

export default function ItemMarkierungTab({ itemUUID }: Props) {
  const { isMarked, getNote, saveMark, removeMark } = useUserMarks();
  const [noteInput, setNoteInput] = useState<string>(() => getNote(itemUUID) ?? '');
  const [saving, setSaving] = useState(false);
  const [allMarks, setAllMarks] = useState<ItemMark[]>([]);
  const marked = isMarked(itemUUID);
  const username = getUser().trim();

  const loadAllMarks = useCallback(async () => {
    try {
      const res = await fetch(`/api/user-marks/item/${encodeURIComponent(itemUUID)}`);
      if (res.ok) {
        const data = await res.json() as { marks: ItemMark[] };
        setAllMarks(data.marks);
      }
    } catch {
      // non-critical, silently ignore
    }
  }, [itemUUID]);

  useEffect(() => {
    void loadAllMarks();
  }, [loadAllMarks]);

  async function handleSave() {
    if (!username) return;
    setSaving(true);
    try {
      await saveMark(itemUUID, noteInput.trim() || null);
      await loadAllMarks();
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
      await loadAllMarks();
    } finally {
      setSaving(false);
    }
  }

  const otherMarks = allMarks.filter((m) => m.Username !== username);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {allMarks.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: '0.75rem' }}>Kommentare</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {allMarks.map((m) => (
              <div key={m.Username} style={{ borderLeft: '3px solid var(--border-color, #e2e8f0)', paddingLeft: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <strong>{m.Username}{m.Username === username ? ' (Sie)' : ''}</strong>
                  <span className="muted" style={{ fontSize: '0.8em' }}>
                    {new Date(m.CreatedAt).toLocaleDateString('de-CH')}
                  </span>
                </div>
                {m.Note
                  ? <p style={{ margin: 0 }}>{m.Note}</p>
                  : <p className="muted" style={{ margin: 0, fontStyle: 'italic' }}>keine Notiz</p>
                }
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Meine Markierung</h3>
        {!username ? (
          <p className="muted">Bitte zuerst Benutzernamen setzen.</p>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
