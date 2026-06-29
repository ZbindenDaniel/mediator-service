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

export interface SpecContractFieldEntry {
  key: string;
  required: boolean;
  description?: string;
  currentValue: string | null;
  intakeValue?: string | null;
}

export interface AgenticContractFieldReviewResult {
  specValues: Record<string, string>;
}

interface ContractFieldReviewProps {
  title: string;
  description?: string;
  contractFields: SpecContractFieldEntry[];
  additionalFields?: Record<string, string | string[]>;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (result: AgenticContractFieldReviewResult) => void;
  onCancel: () => void;
}

// Step 3 variant: structured contract field list with editable values and conflict display
export function AgenticContractFieldReviewModal({
  title,
  description,
  contractFields,
  additionalFields = {},
  confirmLabel = 'Übernehmen',
  cancelLabel = 'Abbrechen',
  onConfirm,
  onCancel
}: ContractFieldReviewProps) {
  const initialValues = useMemo(() => {
    const values: Record<string, string> = {};
    for (const field of contractFields) {
      values[field.key] = field.currentValue ?? '';
    }
    for (const [key, value] of Object.entries(additionalFields)) {
      if (!(key in values)) {
        values[key] = Array.isArray(value) ? value.join(', ') : (value ?? '');
      }
    }
    return values;
  }, [contractFields, additionalFields]);

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(initialValues);

  const updateField = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    try {
      onConfirm({ specValues: fieldValues });
    } catch (error) {
      logError('AgenticContractFieldReviewModal: Failed to submit spec values', error, {});
    }
  };

  const contractFieldKeys = new Set(contractFields.map((f) => f.key));
  const extraFields = Object.entries(additionalFields).filter(([k]) => !contractFieldKeys.has(k));

  return (
    <div className="dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className="dialog-content review-dialog review-dialog--contract-fields"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agentic-contract-field-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title" id="agentic-contract-field-review-title">{title}</h2>
        {description ? <p className="muted">{description}</p> : null}

        <div className="review-dialog__contract-fields">
          {contractFields.map((field) => {
            const isConflict = field.intakeValue !== undefined && field.intakeValue !== null && field.currentValue !== null && field.currentValue !== field.intakeValue;
            const isEmpty = !fieldValues[field.key]?.trim();
            return (
              <div
                key={field.key}
                className={[
                  'contract-field-row',
                  field.required ? 'contract-field-row--required' : 'contract-field-row--desired',
                  isConflict ? 'contract-field-row--conflict' : '',
                  isEmpty ? 'contract-field-row--empty' : ''
                ].filter(Boolean).join(' ')}
              >
                <label className="contract-field-row__label" htmlFor={`spec-field-${field.key}`}>
                  <span className="contract-field-row__key">{field.key}</span>
                  {field.required ? <span className="contract-field-row__badge contract-field-row__badge--required">Pflicht</span> : null}
                  {isConflict ? <span className="contract-field-row__badge contract-field-row__badge--conflict">Konflikt</span> : null}
                  {field.description ? <span className="contract-field-row__desc">{field.description}</span> : null}
                </label>
                {isConflict ? (
                  <div className="contract-field-row__conflict-hint">
                    <span>Artikel: <em>{field.currentValue}</em></span>
                    <span>Erfassung: <em>{field.intakeValue}</em></span>
                  </div>
                ) : null}
                <div className="contract-field-row__input-row">
                  <input
                    id={`spec-field-${field.key}`}
                    type="text"
                    className="contract-field-row__input"
                    value={fieldValues[field.key] ?? ''}
                    placeholder={isEmpty ? '(leer — Feld wird entfernt)' : ''}
                    onChange={(e) => updateField(field.key, e.target.value)}
                  />
                  {!isEmpty ? (
                    <button
                      type="button"
                      className="contract-field-row__remove"
                      title="Feld entfernen"
                      onClick={() => updateField(field.key, '')}
                    >✕</button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {extraFields.length > 0 ? (
          <details className="review-dialog__extra-specs">
            <summary className="muted">Weitere extrahierte Felder ({extraFields.length})</summary>
            <div className="review-dialog__contract-fields review-dialog__contract-fields--extra">
              {extraFields.map(([key, rawValue]) => {
                const displayValue = Array.isArray(rawValue) ? rawValue.join(', ') : (rawValue ?? '');
                return (
                  <div key={key} className="contract-field-row contract-field-row--extra">
                    <label className="contract-field-row__label" htmlFor={`spec-extra-${key}`}>
                      <span className="contract-field-row__key">{key}</span>
                    </label>
                    <div className="contract-field-row__input-row">
                      <input
                        id={`spec-extra-${key}`}
                        type="text"
                        className="contract-field-row__input"
                        value={fieldValues[key] ?? displayValue}
                        onChange={(e) => updateField(key, e.target.value)}
                      />
                      {(fieldValues[key] ?? displayValue).trim() ? (
                        <button
                          type="button"
                          className="contract-field-row__remove"
                          title="Feld entfernen"
                          onClick={() => updateField(key, '')}
                        >✕</button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}

        <div className="dialog-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="btn" onClick={handleConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
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
