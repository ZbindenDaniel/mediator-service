import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import QualityReviewStep from './QualityReviewStep';
import type { QualityReviewResult } from './QualityReviewStep';
import { ensureUser } from '../lib/user';
import { clearQualityDraft } from '../lib/qualityDraft';

// Re-assessment of an item without an assembly. Devices that consist of parts are re-assessed on
// the Einzelteile page instead (Zustand + Aufbau side by side), which replaced this modal's drill-down.

interface Props {
  itemId: string;
  subCategory?: number | null;
  onDone: () => void;
  onCancel: () => void;
  initialAnswers?: Record<string, string>;
}

async function postQualityReview(itemId: string, actor: string, result: QualityReviewResult, subCategory: number | null): Promise<string | null> {
  const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/quality-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reviewed_by: actor,
      answers: result.contractAnswers,
      notes: result.assessment.notes,
      ...(subCategory != null ? { subCategory } : {}),
    }),
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return (data as { error?: string }).error ?? `Fehler ${res.status}`;
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
      const failure = await postQualityReview(itemId, actor, result, subCategory ?? null);
      if (failure) {
        setError(failure);
        return;
      }
      clearQualityDraft(itemId);
      onDone();
    } catch (err) {
      console.error('[QualityReviewModal] Save failed', err);
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
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
        <QualityReviewStep
          subCategory={subCategory ?? undefined}
          draftKey={itemId}
          onComplete={(result) => void handleComplete(result)}
          onSkip={onCancel}
          layout="embedded"
          initialAnswers={initialAnswers}
          disabled={saving}
        />
        {saving && <p className="muted" style={{ margin: '0.5rem 1rem' }}>Wird gespeichert…</p>}
        {error && <p className="error" style={{ margin: '0.5rem 1rem' }}>{error}</p>}
      </div>
    </div>,
    document.body
  );
}
