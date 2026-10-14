import React, { useCallback, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import QualityReviewStep from './QualityReviewStep';
import type { QualityReviewResult } from './QualityReviewStep';
import { ensureUser } from '../lib/user';
import { clearQualityDraft } from '../lib/qualityDraft';
import type { AssemblyPart } from '../../../models/assembly-contract';

interface Props {
  itemId: string;
  subCategory?: number | null;
  onDone: () => void;
  onCancel: () => void;
  initialAnswers?: Record<string, string>;
  /** Root crumb label, e.g. the device name. */
  itemLabel?: string;
}

/**
 * One level of the nested assessment (Laptop › Displayassembly › Webcam). `itemId` is null for a
 * part that is not catalogued yet: it is created only when this level is saved (lazy), so opening
 * and abandoning a part leaves no orphan items.
 */
interface Level {
  key: string;
  itemId: string | null;
  parentIndex: number | null;
  slotKey: string | null;
  subCategory: number | null;
  label: string;
  draftKey: string;
  initialAnswers?: Record<string, string>;
  loading: boolean;
  refreshKey: number;
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

export default function QualityReviewModal({ itemId, subCategory, onDone, onCancel, initialAnswers, itemLabel }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lowScoreNudge, setLowScoreNudge] = useState<number | null>(null);
  const [levels, setLevelsState] = useState<Level[]>(() => [{
    key: 'root',
    itemId,
    parentIndex: null,
    slotKey: null,
    subCategory: subCategory ?? null,
    label: itemLabel || 'Gerät',
    draftKey: itemId,
    initialAnswers,
    loading: false,
    refreshKey: 0,
  }]);
  // Async steps (creating parents, saving) need the current stack, not the render-time closure.
  const levelsRef = useRef(levels);
  const setLevels = useCallback((update: (prev: Level[]) => Level[]) => {
    setLevelsState((prev) => {
      const next = update(prev);
      levelsRef.current = next;
      return next;
    });
  }, []);

  const top = levels.length - 1;

  const openPart = useCallback((fromIndex: number, part: AssemblyPart, childItemId: string | null) => {
    const parent = levelsRef.current[fromIndex];
    const key = `${parent.key}>${part.key}:${childItemId ?? 'new'}:${Date.now()}`;
    const level: Level = {
      key,
      itemId: childItemId,
      parentIndex: fromIndex,
      slotKey: part.key,
      subCategory: part.targetSubcategory,
      label: part.label,
      // A new part has no id yet: key its draft by parent + slot so a reload finds it again.
      draftKey: childItemId ?? `${parent.draftKey}>${part.key}`,
      loading: !!childItemId,
      refreshKey: 0,
    };
    setError(null);
    setLevels((prev) => [...prev.slice(0, fromIndex + 1), level]);
    if (!childItemId) return;
    fetch(`/api/items/${encodeURIComponent(childItemId)}/quality-review`)
      .then((res) => (res.ok ? res.json() : { responses: {} }))
      .then((data: { responses?: Record<string, string> }) => {
        setLevels((prev) => prev.map((l) => (l.key === key ? { ...l, initialAnswers: data.responses ?? {}, loading: false } : l)));
      })
      .catch(() => {
        setLevels((prev) => prev.map((l) => (l.key === key ? { ...l, initialAnswers: {}, loading: false } : l)));
      });
  }, [setLevels]);

  /** Creates the level's item (and, first, any not-yet-created ancestors) as reference-less components. */
  const ensureItem = useCallback(async (index: number, actor: string): Promise<string> => {
    const level = levelsRef.current[index];
    if (level.itemId) return level.itemId;
    if (level.parentIndex === null || !level.slotKey) throw new Error('level without parent');
    const parentId = await ensureItem(level.parentIndex, actor);
    const res = await fetch(`/api/items/${encodeURIComponent(parentId)}/spare-parts/component`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor, slotKey: level.slotKey }),
    });
    const data = await res.json().catch(() => ({})) as { itemUUID?: string; error?: string };
    // 409 on an occupied single slot carries the existing part — assess that one instead.
    const createdId = data.itemUUID;
    if (!createdId) throw new Error(data.error ?? `Bauteil konnte nicht angelegt werden (${res.status})`);
    setLevels((prev) => prev.map((l, i) => (i === index ? { ...l, itemId: createdId } : l)));
    return createdId;
  }, [setLevels]);

  const back = useCallback((toIndex: number, refreshParent: boolean) => {
    setError(null);
    setLevels((prev) => prev.slice(0, toIndex + 1).map((l, i) => (i === toIndex && refreshParent ? { ...l, refreshKey: l.refreshKey + 1 } : l)));
  }, [setLevels]);

  async function handleComplete(index: number, result: QualityReviewResult) {
    const actor = await ensureUser();
    if (!actor) return;
    setSaving(true);
    setError(null);
    try {
      const level = levelsRef.current[index];
      const targetId = index === 0 ? itemId : await ensureItem(index, actor);
      const failure = await postQualityReview(targetId, actor, result, level.subCategory);
      if (failure) {
        setError(failure);
        return;
      }
      clearQualityDraft(level.draftKey);
      if (index > 0) {
        back(level.parentIndex ?? 0, true);
        return;
      }
      if (result.assessment.value <= 3) {
        setLowScoreNudge(result.assessment.value);
      } else {
        onDone();
      }
    } catch (err) {
      console.error('[QualityReviewModal] Save failed', err);
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  function discardLevel(index: number) {
    const level = levelsRef.current[index];
    clearQualityDraft(level.draftKey);
    back(level.parentIndex ?? 0, false);
  }

  return ReactDOM.createPortal(
    <div className="dialog-overlay" role="presentation" onClick={saving || top > 0 ? undefined : onCancel}>
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
            {levels.length > 1 && (
              <nav aria-label="Baugruppen" style={{ padding: '0.75rem 1rem 0', display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                {levels.map((level, i) => (
                  <React.Fragment key={level.key}>
                    {i > 0 && <span className="muted">›</span>}
                    {i < top ? (
                      // Going up keeps the deeper drafts in localStorage; reopening the part restores them.
                      <button type="button" className="link-btn" disabled={saving} onClick={() => back(i, true)}>{level.label}</button>
                    ) : (
                      <strong aria-current="page">{level.label}</strong>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            )}
            {/* Every level stays mounted (hidden when not on top) so unsaved answers survive the trip down. */}
            {levels.map((level, i) => (
              <div key={level.key} style={i === top ? undefined : { display: 'none' }}>
                {level.loading ? (
                  <p className="muted" style={{ padding: '1rem' }}>Bewertung wird geladen…</p>
                ) : (
                  <QualityReviewStep
                    subCategory={level.subCategory ?? undefined}
                    itemId={level.itemId ?? undefined}
                    draftKey={level.draftKey}
                    partsRefreshKey={level.refreshKey}
                    onOpenPart={(part, childItemId) => openPart(i, part, childItemId)}
                    onComplete={(result) => void handleComplete(i, result)}
                    onSkip={i === 0 ? onCancel : () => discardLevel(i)}
                    submitLabel={i === 0 ? undefined : 'Speichern & zurück'}
                    skipLabel={i === 0 ? undefined : 'Verwerfen & zurück'}
                    heading={i === 0 ? undefined : `Qualitätsbewertung: ${level.label}`}
                    layout="embedded"
                    initialAnswers={level.initialAnswers}
                    disabled={saving}
                  />
                )}
              </div>
            ))}
            {saving && <p className="muted" style={{ margin: '0.5rem 1rem' }}>Wird gespeichert…</p>}
            {error && <p className="error" style={{ margin: '0.5rem 1rem' }}>{error}</p>}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
