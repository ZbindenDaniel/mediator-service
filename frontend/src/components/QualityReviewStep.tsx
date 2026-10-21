import React, { useEffect, useMemo, useState } from 'react';
import type { QualityContract, QualityQuestion } from '../../../models/quality-contract';
import {
  deriveAiPriorityFromAssessment,
  type AiPriority,
  type QualityAssessmentInsert,
} from '../../../models/quality';
import {
  loadContractsAsync,
  deriveQualityFromAnswers,
  getAllQuestions,
  allRequiredAnswered,
  isQuestionVisible,
} from '../lib/qualityContracts';
import QualityBadge from './QualityBadge';
import { parseMultiAnswer, computeQualityScore, scoreToRange, formatQualityScoreRange, gradeFromRange, gradingFrom } from '../../../models/quality-score';
import type { QualityScoreChild } from '../../../models/quality-score';
import type { AssemblyContract } from '../../../models/assembly-contract';
import { assemblyToQualityContract } from '../../../models/assembly-contract';
import type { AssemblyQuestionScope } from '../../../models/assembly-contract';
import { readQualityDraft, writeQualityDraft, clearQualityDraft } from '../lib/qualityDraft';

export interface QualityReviewResult {
  assessment: Omit<QualityAssessmentInsert, 'reviewed_at' | 'reviewed_by'>;
  aiPriority: AiPriority;
  contractAnswers: Record<string, string>;
  subCategory?: number;
}

interface QualityReviewStepProps {
  onComplete: (result: QualityReviewResult) => void;
  onSkip: () => void;
  subCategory?: number;
  layout?: 'page' | 'embedded';
  initialAnswers?: Record<string, string>;
  disabled?: boolean;
  /** When set, the preview includes the item's in-device parts in the percentage score. */
  itemId?: string;
  /** Mirror unsaved answers to localStorage under this key (survives a reload or switching parts). */
  draftKey?: string;
  submitLabel?: string;
  skipLabel?: string;
  heading?: string;
  /** `create` = the device check at creation: only the slots in the contract's askOnCreate. */
  questionScope?: AssemblyQuestionScope;
}

interface SparePartRow {
  ItemUUID: string;
  slotKey: string | null;
  BoxID: string | null;
  QualityScoreMin: number | null;
  QualityScoreMax: number | null;
}

const AI_PRIORITY_LABELS: Record<AiPriority, string> = {
  high: 'Hoch',
  normal: 'Normal',
  low: 'Niedrig',
};

function BooleanToggle({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="quality-review-step__toggle-group">
      <button
        type="button"
        className={`quality-review-step__toggle${value === 'true' ? ' quality-review-step__toggle--active' : ''}`}
        onClick={() => onChange('true')}
      >
        Ja
      </button>
      <button
        type="button"
        className={`quality-review-step__toggle${value === 'false' ? ' quality-review-step__toggle--active' : ''}`}
        onClick={() => onChange('false')}
      >
        Nein
      </button>
    </div>
  );
}

// Inline layout: styles.scss currently carries unrelated uncommitted work; move to SCSS later.
const MULTI_STYLE: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' };
const CHIP_STYLE: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.1rem 0.5rem', borderRadius: '999px', border: '1px solid currentColor' };

/**
 * Multi-value input. Closed list (`values`) → checkboxes; open list → chips + free entry.
 * Stores a JSON array; "Keine" stores "[]" so "checked, nothing found" differs from "not checked".
 */
function MultiInput({
  question,
  value,
  onChange,
}: {
  question: Extract<QualityQuestion, { type: 'multi' }>;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const entries = parseMultiAnswer(value) ?? [];
  const checked = value !== undefined && value.trim() !== '';
  const [draft, setDraft] = useState('');
  const write = (next: string[]) => onChange(JSON.stringify(next));
  const addEntry = (raw: string) => {
    const entry = raw.trim();
    if (!entry || entries.includes(entry)) return;
    write([...entries, entry]);
  };
  const listId = question.suggestions?.length ? `datalist-${question.id}` : undefined;

  if (question.values?.length) {
    return (
      <div className="quality-review-step__multi" style={MULTI_STYLE}>
        {question.values.map((v) => (
          <label key={v} className="quality-review-step__multi-option">
            <input
              type="checkbox"
              checked={entries.includes(v)}
              onChange={(e) => write(e.target.checked ? [...entries, v] : entries.filter((x) => x !== v))}
            />
            {v}
          </label>
        ))}
        <button type="button" className={`quality-review-step__toggle${checked && entries.length === 0 ? ' quality-review-step__toggle--active' : ''}`} onClick={() => write([])}>
          Keine
        </button>
      </div>
    );
  }

  return (
    <div className="quality-review-step__multi" style={MULTI_STYLE}>
      {entries.map((entry) => (
        <span key={entry} className="quality-review-step__chip" style={CHIP_STYLE}>
          {entry}
          <button type="button" aria-label={`${entry} entfernen`} onClick={() => write(entries.filter((x) => x !== entry))}>×</button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        list={listId}
        placeholder="Eintrag + Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addEntry(draft);
            setDraft('');
          }
        }}
        onBlur={() => { if (draft.trim()) { addEntry(draft); setDraft(''); } }}
      />
      {listId && (
        <datalist id={listId}>
          {question.suggestions!.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <button type="button" className={`quality-review-step__toggle${checked && entries.length === 0 ? ' quality-review-step__toggle--active' : ''}`} onClick={() => write([])}>
        Keine
      </button>
    </div>
  );
}

function QuestionRow({
  question,
  value,
  onChange,
}: {
  question: QualityQuestion;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  if (question.type === 'boolean') {
    return (
      <div className="row">
        <label>
          {question.question}
          {question.required && ' *'}
        </label>
        <BooleanToggle value={value} onChange={onChange} />
      </div>
    );
  }

  if (question.type === 'multi') {
    return (
      <div className="row">
        <label>
          {question.question}
          {question.required && ' *'}
        </label>
        <MultiInput question={question} value={value} onChange={onChange} />
      </div>
    );
  }

  if (question.type === 'text') {
    const listId = question.suggestions?.length ? `datalist-${question.id}` : undefined;
    return (
      <div className="row">
        <label>
          {question.question}
          {question.required && ' *'}
        </label>
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          list={listId}
          placeholder="Eingeben oder aus Liste wählen…"
        />
        {listId && (
          <datalist id={listId}>
            {question.suggestions!.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
    );
  }

  return (
    <div className="row">
      <label>
        {question.question}
        {question.required && ' *'}
      </label>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— bitte auswählen —</option>
        {question.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function QualityReviewStep({
  onComplete,
  onSkip,
  subCategory,
  layout,
  initialAnswers,
  disabled,
  itemId,
  draftKey,
  submitLabel = 'Weiter →',
  skipLabel = 'Überspringen',
  heading = 'Qualitätsbewertung',
  questionScope = 'all',
}: QualityReviewStepProps) {
  const [contracts, setContracts] = useState<{ general: QualityContract | null; assembly: QualityContract | null; subCat: QualityContract | null; assemblyRaw: AssemblyContract | null }>({
    general: null,
    assembly: null,
    subCat: null,
    assemblyRaw: null,
  });
  const [spareParts, setSpareParts] = useState<SparePartRow[]>([]);

  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    fetch(`/api/items/${encodeURIComponent(itemId)}/spare-parts`)
      .then((res) => (res.ok ? res.json() : { spareParts: [] }))
      .then((data: { spareParts?: SparePartRow[] }) => {
        if (!cancelled) setSpareParts(data.spareParts ?? []);
      })
      .catch(() => { /* preview only — without parts the slots count as unassessed */ });
    return () => { cancelled = true; };
  }, [itemId]);

  const partScores = useMemo<QualityScoreChild[]>(() => spareParts.map((p) => ({
    slotKey: p.slotKey,
    inDevice: !p.BoxID,
    score: p.QualityScoreMin != null && p.QualityScoreMax != null ? { min: p.QualityScoreMin, max: p.QualityScoreMax } : null,
  })), [spareParts]);
  const [contractsLoading, setContractsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setContractsLoading(true);
    loadContractsAsync(subCategory, questionScope).then((loaded) => {
      if (!cancelled) {
        setContracts(loaded);
        setContractsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [subCategory, questionScope]);

  const { general, assembly, subCat } = contracts;
  const questions = getAllQuestions(general, subCat, assembly);

  // A stored draft wins over the saved answers: it is newer (unsaved work from this browser).
  const restoredDraft = useMemo(() => (draftKey ? readQualityDraft(draftKey) : null), [draftKey]);
  const [answers, setAnswers] = useState<Record<string, string>>(restoredDraft?.answers ?? initialAnswers ?? {});
  const [notes, setNotesState] = useState(restoredDraft?.notes ?? '');
  const [touched, setTouched] = useState(false);
  const [draftRestored, setDraftRestored] = useState(!!restoredDraft);

  useEffect(() => {
    // Only real edits become a draft — merely opening a form must not shadow the saved answers.
    if (draftKey && touched) writeQualityDraft(draftKey, answers, notes);
  }, [draftKey, touched, answers, notes]);

  const setNotes = (value: string) => {
    setTouched(true);
    setNotesState(value);
  };

  const discardDraft = () => {
    if (draftKey) clearQualityDraft(draftKey);
    setAnswers(initialAnswers ?? {});
    setNotesState('');
    setTouched(false);
    setDraftRestored(false);
  };

  const setAnswer = (id: string, value: string) => {
    setTouched(true);
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      // Clear answers for questions that are now hidden due to this change
      for (const q of questions) {
        if (q.showIf?.questionId === id && next[q.id] !== undefined && !isQuestionVisible(q, next)) {
          delete next[q.id];
        }
      }
      return next;
    });
  };

  // Scored with every slot question, like the server — the scope only limits what is asked.
  const activeContracts = [
    ...(general ? [general] : []),
    ...(contracts.assemblyRaw ? [assemblyToQualityContract(contracts.assemblyRaw)] : []),
    ...(subCat ? [subCat] : [])
  ];
  const qualityValue = deriveQualityFromAnswers(activeContracts, answers, contracts.assemblyRaw);
  // Same function the server stores with, so the preview matches what gets saved.
  const scoreRange = scoreToRange(computeQualityScore({
    contracts: activeContracts,
    answers,
    assembly: contracts.assemblyRaw,
    children: partScores,
  }));
  // What the item will show: pessimistic grade, or "?" when the range is too wide to mean anything (U4).
  const displayGrade = gradeFromRange(scoreRange, gradingFrom(activeContracts));
  const aiPriority = deriveAiPriorityFromAssessment(qualityValue);
  // All questions are optional — users may skip any they don't know (e.g. RAM on a laptop).
  const canSubmit = true;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    onComplete({
      assessment: {
        tag: 'Ok', // tag resolved server-side from contract; client preview uses qualityValue
        value: qualityValue,
        is_complete: null,
        has_defects: null,
        is_functional: null,
        notes: notes.trim() || null,
      },
      aiPriority,
      contractAnswers: answers,
      subCategory,
    });
  };

  const generalQuestions = general?.questions ?? [];
  const assemblyQuestions = assembly?.questions ?? [];
  const subCatQuestions = subCat?.questions ?? [];

  if (contractsLoading) {
    return (
      <div className="item-create__step">
        <div className="item-create__step-header">
          <h2>Qualitätsbewertung</h2>
          <p className="muted">Bewertungsformular wird geladen…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="item-create__step">
      <div className="item-create__step-header">
        <h2>{heading}</h2>
        <p className="muted">Bitte den Zustand des Artikels bewerten.</p>
        {draftRestored && (
          <p className="muted">
            Ungespeicherter Entwurf wiederhergestellt ·{' '}
            <button type="button" className="link-btn" onClick={discardDraft}>verwerfen</button>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="item-form">
        {generalQuestions.map((q) =>
          isQuestionVisible(q, answers) ? (
            <QuestionRow
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={(v) => setAnswer(q.id, v)}
            />
          ) : null
        )}

        {assemblyQuestions.length > 0 && (
          <>
            <div className="row">
              <p className="muted" style={{ margin: 0 }}>
                <strong>Komponenten</strong>
              </p>
            </div>
            {assemblyQuestions.map((q) =>
              isQuestionVisible(q, answers) ? (
                <QuestionRow key={q.id} question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
              ) : null
            )}
          </>
        )}

        {subCatQuestions.length > 0 && (
          <>
            <div className="row">
              <p className="muted" style={{ margin: 0 }}>
                <strong>{subCat!.subCategory && `Kategorie ${subCat!.subCategory}`}</strong>
              </p>
            </div>
            {subCatQuestions.map((q) =>
              isQuestionVisible(q, answers) ? (
                <QuestionRow
                  key={q.id}
                  question={q}
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                />
              ) : null
            )}
          </>
        )}

        <div className="row">
          <label>Anmerkungen (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Weitere Hinweise zum Zustand…"
          />
        </div>

        {canSubmit && (
          <div className="row quality-review-step__preview">
            <span className="muted">Vorschau:</span>
            <QualityBadge value={displayGrade} />
            {scoreRange && (
              <span className="quality-review-step__score" title="Sicher erreicht – bestenfalls (ungeprüfte Teile als Unsicherheit)">
                {formatQualityScoreRange(scoreRange)}
              </span>
            )}
            <span className="muted quality-review-step__priority">
              KI-Priorität: {AI_PRIORITY_LABELS[aiPriority]}
            </span>
          </div>
        )}

        <div className="item-create__step-actions">
          <button type="button" className="btn btn--secondary" onClick={onSkip} disabled={disabled}>
            {skipLabel}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!canSubmit || disabled}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
