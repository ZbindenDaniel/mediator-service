// TODO(quality-wizard): Revisit quality slider placement after validating onboarding feedback.
import React, { useEffect, useMemo } from 'react';
import { describeQuality, normalizeQuality, QUALITY_DEFAULT, QUALITY_LABELS } from '../../../models/quality';
import { ItemFormData, useItemFormState } from './forms/itemFormShared';
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
            <input
              type="number"
              value={form.Auf_Lager ?? 1}
              onChange={(event) => {
                try {
                  const parsed = Number.parseInt(event.target.value, 10);
                  update('Auf_Lager', Number.isNaN(parsed) ? 0 : parsed);
                } catch (error) {
                  console.error('Failed to parse Auf_Lager in basic info form', error);
                  update('Auf_Lager', 0);
                }
              }}
              required
            />
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
