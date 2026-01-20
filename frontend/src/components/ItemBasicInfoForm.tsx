// TODO(quality-wizard): Revisit quality slider placement after validating onboarding feedback.
import React, { useEffect, useMemo } from 'react';
import { describeQuality, normalizeQuality, QUALITY_DEFAULT, QUALITY_LABELS } from '../../../models/quality';
import { ITEM_EINHEIT_VALUES, isItemEinheit } from '../../../models';
import { ItemFormData, ITEM_FORM_DEFAULT_EINHEIT, useItemFormState } from './forms/itemFormShared';
import QualityBadge from './QualityBadge';

interface ItemBasicInfoFormProps {
  initialValues: Partial<ItemFormData>;
  onSubmit: (data: Partial<ItemFormData>) => void;
  submitLabel?: string;
}

export function ItemBasicInfoForm({ initialValues, onSubmit, submitLabel = 'Weiter' }: ItemBasicInfoFormProps) {
  const { form, update, mergeForm, generateMaterialNumber } = useItemFormState({ initialItem: initialValues });
  const qualitySummary = useMemo(() => describeQuality(form.Quality ?? QUALITY_DEFAULT), [form.Quality]);

  useEffect(() => {
    mergeForm(initialValues);
  }, [initialValues, mergeForm]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      console.log('Submitting basic item info step', form);
      onSubmit(form);
    } catch (err) {
      console.error('Failed to submit basic item info step', err);
    }
  };

  return (
    <div className='container item'>
      <div className="card">
        <form onSubmit={handleSubmit} className="item-form">
          <div className="row">
            <label>Artikelbeschreibung*</label>
            <input
              value={form.Artikelbeschreibung || ''}
              onChange={(event) => update('Artikelbeschreibung', event.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="row">
            <label>Anzahl*</label>
            {/* TODO(agent): Align basic info quantity defaults with instance-vs-bulk handling guidance. */}
            {/* TODO(agent): Add validation messaging once Einheit-specific copy is finalized. */}
            <input
              type="number"
              value={form.Auf_Lager ?? 1}
              onChange={(event) => {
                try {
                  const parsed = Number.parseInt(event.target.value, 10);
                  if (Number.isNaN(parsed) || parsed <= 0) {
                    console.warn('Invalid Auf_Lager value in basic info form; defaulting to 1.', {
                      rawValue: event.target.value
                    });
                    update('Auf_Lager', 1);
                    return;
                  }
                  update('Auf_Lager', parsed);
                } catch (error) {
                  console.error('Failed to parse Auf_Lager in basic info form', error);
                  update('Auf_Lager', 1);
                }
              }}
              required
            />
            <div className="muted">
              {form.Einheit === ITEM_FORM_DEFAULT_EINHEIT || form.Einheit === 'Stk'
                ? 'Bei Einheit Stk werden einzelne Instanzen angelegt.'
                : 'Bei Einheit Menge wird die Anzahl als Gesamtmenge gespeichert.'}
            </div>
          </div>

          {/* TODO(agent): Confirm Einheit defaults and labels with the inventory team before the next release. */}
          <div className="row">
            <label>Einheit*</label>
            <select
              value={form.Einheit ?? ITEM_FORM_DEFAULT_EINHEIT}
              onChange={(event) => {
                try {
                  const candidate = event.target.value;
                  if (isItemEinheit(candidate)) {
                    update('Einheit', candidate);
                    return;
                  }
                  const trimmed = candidate.trim();
                  if (isItemEinheit(trimmed)) {
                    update('Einheit', trimmed);
                    return;
                  }
                  console.warn('Invalid Einheit selection in basic info form, using default', { candidate });
                  update('Einheit', ITEM_FORM_DEFAULT_EINHEIT);
                } catch (error) {
                  console.error('Failed to update Einheit in basic info form', error);
                  update('Einheit', ITEM_FORM_DEFAULT_EINHEIT);
                }
              }}
              required
            >
              {ITEM_EINHEIT_VALUES.map((value) => (
                <option key={`einheit-${value}`} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <label>Qualität</label>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={qualitySummary.value}
              onChange={(event) => update('Quality', normalizeQuality(event.target.value, console) as ItemFormData['Quality'])}
              aria-valuetext={`${qualitySummary.label} (${qualitySummary.value})`}
            />
            <div className="quality-slider__labels">
              {[1, 2, 3, 4, 5].map((level) => (
                <span key={`basic-quality-${level}`}>{QUALITY_LABELS[level] ?? level}</span>
              ))}
            </div>
            <div className="muted">
              <QualityBadge compact value={qualitySummary.value} />
            </div>
          </div>


          <div className="row">
            <button type="submit">{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
