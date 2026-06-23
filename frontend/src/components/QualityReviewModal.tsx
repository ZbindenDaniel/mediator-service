import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import QualityReviewStep from './QualityReviewStep';
import type { QualityReviewResult } from './QualityReviewStep';
import { ensureUser } from '../lib/user';

interface Props {
  itemId: string;
  subCategory?: number | null;
  onDone: () => void;
  onCancel: () => void;
  initialAnswers?: Record<string, string>;
}

export default function QualityReviewModal({ itemId, subCategory, onDone, onCancel, initialAnswers }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lowScoreNudge, setLowScoreNudge] = useState<number | null>(null);

  async function handleComplete(result: QualityReviewResult) {
    const actor = await ensureUser();
    if (!actor) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/quality-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewed_by: actor,
          answers: result.contractAnswers,
          ...(subCategory != null ? { subCategory } : {}),
        }),
      });
      if (res.ok) {
        if (result.assessment.value <= 3) {
          setLowScoreNudge(result.assessment.value);
        } else {
          onDone();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? `Fehler ${res.status}`);
      }
    } catch (err) {
      console.error('[QualityReviewModal] Save failed', err);
      setError('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  return ReactDOM.createPortal(
    <div className="dialog-overlay" role="presentation" onClick={saving ? undefined : onCancel}>
      <div
        className="dialog-content"
        role="dialog"
        aria-modal="true"
        aria-label="Qualität bewerten"
        onClick={(e) => e.stopPropagation()}
      >
        {lowScoreNudge !== null ? (
          <div style={{ padding: '1.5rem' }}>
            <p style={{ marginBottom: '0.75rem' }}>
              <strong>Qualität {lowScoreNudge}/5</strong> — Lohnt es sich, Einzelteile separat zu katalogisieren?
            </p>
            <p className="muted" style={{ marginBottom: '1rem' }}>
              Im Tab <em>Zubehör &amp; Komponenten</em> können RAM, SSD und andere Bauteile als eigenständige Artikel erfasst werden.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn--primary" onClick={onDone}>
                Zum Zubehör-Tab →
              </button>
              <button type="button" className="btn btn--secondary" onClick={onDone}>
                Überspringen
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Keep QualityReviewStep mounted during save so answers are not lost on error */}
            <QualityReviewStep
              subCategory={subCategory ?? undefined}
              onComplete={(result) => void handleComplete(result)}
              onSkip={onCancel}
              layout="embedded"
              initialAnswers={initialAnswers}
              disabled={saving}
            />
            {saving && <p className="muted" style={{ margin: '0.5rem 1rem' }}>Wird gespeichert…</p>}
            {error && <p className="error" style={{ margin: '0.5rem 1rem' }}>{error}</p>}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
