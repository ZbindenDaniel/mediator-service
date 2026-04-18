import React, { useState } from 'react';
import {
  deriveAiPriorityFromAssessment,
  deriveQualityTagFromCondition,
  type AiPriority,
  type PhysicalConditionAnswers,
  type QualityAssessmentInsert
} from '../../../models/quality';
import QualityBadge from './QualityBadge';

export interface QualityReviewResult {
  assessment: Omit<QualityAssessmentInsert, 'reviewed_at' | 'reviewed_by'>;
  aiPriority: AiPriority;
}

interface QuestionConfig {
  key: keyof PhysicalConditionAnswers;
  label: string;
}

const PHYSICAL_CONDITION_QUESTIONS: QuestionConfig[] = [
  { key: 'is_complete', label: 'Ist der Artikel vollständig?' },
  { key: 'has_defects', label: 'Gibt es sichtbare Schäden?' },
  { key: 'is_functional', label: 'Ist der Artikel funktionsfähig?' }
];

const AI_PRIORITY_LABELS: Record<AiPriority, string> = {
  high: 'Hoch',
  normal: 'Normal',
  low: 'Niedrig'
};

interface QualityReviewStepProps {
  onComplete: (result: QualityReviewResult) => void;
  onSkip: () => void;
  questionSet?: QuestionConfig[];
  layout?: 'page' | 'embedded';
}

export default function QualityReviewStep({
  onComplete,
  onSkip,
  questionSet = PHYSICAL_CONDITION_QUESTIONS
}: QualityReviewStepProps) {
  const [answers, setAnswers] = useState<PhysicalConditionAnswers>({
    is_complete: null,
    has_defects: null,
    is_functional: null
  });
  const [notes, setNotes] = useState('');

  const setAnswer = (key: keyof PhysicalConditionAnswers, value: boolean) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const derived = deriveQualityTagFromCondition(answers);
  const aiPriority = deriveAiPriorityFromAssessment(derived.value);

  const allAnswered = questionSet.every((q) => answers[q.key] !== null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!allAnswered) return;
    onComplete({
      assessment: {
        tag: derived.tag,
        value: derived.value,
        is_complete: answers.is_complete,
        has_defects: answers.has_defects,
        is_functional: answers.is_functional,
        notes: notes.trim() || null
      },
      aiPriority
    });
  };

  return (
    <div className="item-create__step">
      <div className="item-create__step-header">
        <h2>Qualitätsbewertung</h2>
        <p className="muted">Bitte den Zustand des Artikels bewerten.</p>
      </div>
      <form onSubmit={handleSubmit} className="item-form">
        {questionSet.map((question) => {
          const current = answers[question.key];
          return (
            <div key={question.key} className="row">
              <label>{question.label}</label>
              <div className="quality-review-step__toggle-group">
                <button
                  type="button"
                  className={`quality-review-step__toggle${current === true ? ' quality-review-step__toggle--active' : ''}`}
                  onClick={() => setAnswer(question.key, true)}
                >
                  Ja
                </button>
                <button
                  type="button"
                  className={`quality-review-step__toggle${current === false ? ' quality-review-step__toggle--active' : ''}`}
                  onClick={() => setAnswer(question.key, false)}
                >
                  Nein
                </button>
              </div>
            </div>
          );
        })}

        <div className="row">
          <label>Anmerkungen (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Weitere Hinweise zum Zustand…"
          />
        </div>

        {allAnswered && (
          <div className="row quality-review-step__preview">
            <span className="muted">Vorschau:</span>
            <QualityBadge value={derived.value} />
            <span className="muted quality-review-step__priority">
              KI-Priorität: {AI_PRIORITY_LABELS[aiPriority]}
            </span>
          </div>
        )}

        <div className="item-create__step-actions">
          <button type="button" className="btn btn--secondary" onClick={onSkip}>
            Überspringen
          </button>
          <button type="submit" className="btn btn--primary" disabled={!allAnswered}>
            Weiter →
          </button>
        </div>
      </form>
    </div>
  );
}
