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
        onDone();
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
        {saving ? (
          <div className="card"><p className="muted">Wird gespeichert…</p></div>
        ) : (
          <>
            <QualityReviewStep
              subCategory={subCategory ?? undefined}
              onComplete={(result) => void handleComplete(result)}
              onSkip={onCancel}
              layout="embedded"
              initialAnswers={initialAnswers}
            />
            {error && <p className="error" style={{ margin: '0.5rem 1rem' }}>{error}</p>}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
