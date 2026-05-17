import React, { useEffect, useState } from 'react';
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
} from '../lib/qualityContracts';
import QualityBadge from './QualityBadge';

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
}: QualityReviewStepProps) {
  const [contracts, setContracts] = useState<{ general: QualityContract | null; subCat: QualityContract | null }>({
    general: null,
    subCat: null,
  });
  const [contractsLoading, setContractsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setContractsLoading(true);
    loadContractsAsync(subCategory).then((loaded) => {
      if (!cancelled) {
        setContracts(loaded);
        setContractsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [subCategory]);

  const { general, subCat } = contracts;
  const questions = getAllQuestions(general, subCat);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');

  const setAnswer = (id: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const activeContracts = [
    ...(general ? [general] : []),
    ...(subCat ? [subCat] : [])
  ];
  const qualityValue = deriveQualityFromAnswers(activeContracts, answers);
  const aiPriority = deriveAiPriorityFromAssessment(qualityValue);
  const canSubmit = allRequiredAnswered(questions, answers);

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
        <h2>Qualitätsbewertung</h2>
        <p className="muted">Bitte den Zustand des Artikels bewerten.</p>
      </div>

      <form onSubmit={handleSubmit} className="item-form">
        {generalQuestions.map((q) => (
          <QuestionRow
            key={q.id}
            question={q}
            value={answers[q.id]}
            onChange={(v) => setAnswer(q.id, v)}
          />
        ))}

        {subCatQuestions.length > 0 && (
          <>
            <div className="row">
              <p className="muted" style={{ margin: 0 }}>
                <strong>{subCat!.subCategory && `Kategorie ${subCat!.subCategory}`}</strong>
              </p>
            </div>
            {subCatQuestions.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                value={answers[q.id]}
                onChange={(v) => setAnswer(q.id, v)}
              />
            ))}
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
            <QualityBadge value={qualityValue} />
            <span className="muted quality-review-step__priority">
              KI-Priorität: {AI_PRIORITY_LABELS[aiPriority]}
            </span>
          </div>
        )}

        <div className="item-create__step-actions">
          <button type="button" className="btn btn--secondary" onClick={onSkip}>
            Überspringen
          </button>
          <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
            Weiter →
          </button>
        </div>
      </form>
    </div>
  );
}
