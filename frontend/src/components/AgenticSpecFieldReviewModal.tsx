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
  secondarySelectedFields?: string[];
  secondaryAdditionalInput?: string;
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
  secondaryTitle?: string;
  secondaryDescription?: string;
  secondaryFieldOptions?: AgenticSpecFieldOption[];
  includeSecondaryAdditionalInput?: boolean;
  secondaryAdditionalInputPlaceholder?: string;
  defaultSecondarySelectedFields?: string[];
  defaultSecondaryAdditionalInput?: string;
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
  secondaryTitle,
  secondaryDescription,
  secondaryFieldOptions = [],
  includeSecondaryAdditionalInput = false,
  secondaryAdditionalInputPlaceholder,
  defaultSecondarySelectedFields = [],
  defaultSecondaryAdditionalInput = '',
  onConfirm,
  onCancel
}: Props) {
  const [selectedFields, setSelectedFields] = useState<string[]>(defaultSelectedFields);
  const [additionalInput, setAdditionalInput] = useState<string>(defaultAdditionalInput);
  const [secondarySelectedFields, setSecondarySelectedFields] = useState<string[]>(defaultSecondarySelectedFields);
  const [secondaryAdditionalInput, setSecondaryAdditionalInput] = useState<string>(defaultSecondaryAdditionalInput);
  const selectedSet = useMemo(() => new Set(selectedFields), [selectedFields]);
  const secondarySelectedSet = useMemo(() => new Set(secondarySelectedFields), [secondarySelectedFields]);

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

  const toggleSecondaryField = (fieldValue: string) => {
    try {
      setSecondarySelectedFields((current) => (
        current.includes(fieldValue)
          ? current.filter((entry) => entry !== fieldValue)
          : [...current, fieldValue]
      ));
    } catch (error) {
      logError('AgenticSpecFieldReviewModal: Failed to toggle secondary field selection', error, {
        fieldValue
      });
    }
  };

  const handleConfirm = () => {
    try {
      onConfirm({
        selectedFields,
        additionalInput: additionalInput.trim(),
        secondarySelectedFields,
        secondaryAdditionalInput: secondaryAdditionalInput.trim()
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
        {secondaryTitle ? (
          <>
            <h3 className="review-dialog__section-title">{secondaryTitle}</h3>
            {secondaryDescription ? <p className="muted">{secondaryDescription}</p> : null}
            <div className="review-dialog__chips" role="group" aria-label={`${secondaryTitle} Spezifikationsfelder`}>
              {secondaryFieldOptions.length > 0 ? secondaryFieldOptions.map((field) => {
                const checked = secondarySelectedSet.has(field.value);
                return (
                  <label key={`secondary-${field.value}`} className="review-dialog__chip">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSecondaryField(field.value)}
                    />
                    <span>{field.label}</span>
                  </label>
                );
              }) : (
                <p className="muted">Keine erkannten Spezifikationsfelder. Bitte bei Bedarf freien Text verwenden.</p>
              )}
            </div>
            {includeSecondaryAdditionalInput ? (
              <div className="review-dialog__additional-input">
                <label htmlFor="agentic-spec-field-review-secondary-additional-input">Weitere fehlende Felder (kommagetrennt)</label>
                <input
                  id="agentic-spec-field-review-secondary-additional-input"
                  type="text"
                  value={secondaryAdditionalInput}
                  placeholder={secondaryAdditionalInputPlaceholder}
                  onChange={(event) => setSecondaryAdditionalInput(event.target.value)}
                />
              </div>
            ) : null}
          </>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="btn" onClick={handleConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
