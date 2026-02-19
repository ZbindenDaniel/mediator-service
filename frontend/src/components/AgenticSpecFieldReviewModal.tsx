import React, { useMemo, useState } from 'react';
import { logError } from '../utils/logger';

// TODO(agentic-review-spec-modal): Revisit keyboard shortcuts if reviewers request faster bulk selection.
// TODO(agentic-review-spec-input): Validate missing-field token parsing UX once reviewers provide examples.
export interface AgenticSpecFieldOption {
  value: string;
  label: string;
}

export interface AgenticSpecFieldReviewResult {
  selectedFields: string[];
  additionalInput: string;
}

interface Props {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  fieldOptions: AgenticSpecFieldOption[];
  includeAdditionalInput?: boolean;
  additionalInputPlaceholder?: string;
  defaultSelectedFields?: string[];
  defaultAdditionalInput?: string;
  onConfirm: (result: AgenticSpecFieldReviewResult) => void;
  onCancel: () => void;
}

export default function AgenticSpecFieldReviewModal({
  title,
  description,
  confirmLabel = 'Übernehmen',
  cancelLabel = 'Abbrechen',
  fieldOptions,
  includeAdditionalInput = false,
  additionalInputPlaceholder,
  defaultSelectedFields = [],
  defaultAdditionalInput = '',
  onConfirm,
  onCancel
}: Props) {
  const [selectedFields, setSelectedFields] = useState<string[]>(defaultSelectedFields);
  const [additionalInput, setAdditionalInput] = useState<string>(defaultAdditionalInput);
  const selectedSet = useMemo(() => new Set(selectedFields), [selectedFields]);

  const toggleField = (fieldValue: string) => {
    try {
      setSelectedFields((current) => (
        current.includes(fieldValue)
          ? current.filter((entry) => entry !== fieldValue)
          : [...current, fieldValue]
      ));
    } catch (error) {
      logError('AgenticSpecFieldReviewModal: Failed to toggle field selection', error, {
        fieldValue
      });
    }
  };

  const handleConfirm = () => {
    try {
      onConfirm({
        selectedFields,
        additionalInput: additionalInput.trim()
      });
    } catch (error) {
      logError('AgenticSpecFieldReviewModal: Failed to submit modal result', error, {
        selectedCount: selectedFields.length
      });
    }
  };

  return (
    <div className="dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className="dialog-content review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agentic-spec-field-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title" id="agentic-spec-field-review-title">{title}</h2>
        <p className="muted">{description}</p>
        <div className="review-dialog__chips" role="group" aria-label="Spezifikationsfelder">
          {fieldOptions.length > 0 ? fieldOptions.map((field) => {
            const checked = selectedSet.has(field.value);
            return (
              <label key={field.value} className="review-dialog__chip">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleField(field.value)}
                />
                <span>{field.label}</span>
              </label>
            );
          }) : (
            <p className="muted">Keine erkannten Spezifikationsfelder. Bitte bei Bedarf freien Text verwenden.</p>
          )}
        </div>
        {includeAdditionalInput ? (
          <div className="review-dialog__additional-input">
            <label htmlFor="agentic-spec-field-review-additional-input">Fehlende Felder (kommagetrennt)</label>
            <input
              id="agentic-spec-field-review-additional-input"
              type="text"
              value={additionalInput}
              placeholder={additionalInputPlaceholder}
              onChange={(event) => setAdditionalInput(event.target.value)}
            />
          </div>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="btn" onClick={handleConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
