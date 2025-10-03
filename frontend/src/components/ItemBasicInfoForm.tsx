import React, { useEffect, useMemo } from 'react';
import { ItemFormData, createPhotoChangeHandler, useItemFormState } from './forms/itemFormShared';

interface ItemBasicInfoFormProps {
  initialValues: Partial<ItemFormData>;
  onSubmit: (data: Partial<ItemFormData>) => void;
  submitLabel?: string;
}

export function ItemBasicInfoForm({ initialValues, onSubmit, submitLabel = 'Weiter' }: ItemBasicInfoFormProps) {
  const normalizedInitialValues = useMemo(
    () => ({
      ...initialValues,
      Auf_Lager: initialValues.Auf_Lager ?? 1
    }),
    [initialValues]
  );

  const { form, update, mergeForm } = useItemFormState({ initialItem: normalizedInitialValues });

  useEffect(() => {
    mergeForm({
      ...initialValues,
      Auf_Lager: initialValues.Auf_Lager ?? 1
    });
  }, [initialValues, mergeForm]);

  const handlePhoto1Change = useMemo(
    () => createPhotoChangeHandler(update, 'picture1'),
    [update]
  );
  const handlePhoto2Change = useMemo(
    () => createPhotoChangeHandler(update, 'picture2'),
    [update]
  );
  const handlePhoto3Change = useMemo(
    () => createPhotoChangeHandler(update, 'picture3'),
    [update]
  );

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
          <input type="hidden" value={form.BoxID || ''} readOnly />

          <div className="row">
            <label>Artikelbeschreibung*</label>
            <input
              value={form.Artikelbeschreibung || ''}
              onChange={(event) => update('Artikelbeschreibung', event.target.value)}
              required
            />
          </div>

          <div className="row">
            <label>Anzahl*</label>
            <input
              type="number"
              min={1}
              value={form.Auf_Lager ?? 1}
              onChange={(event) => {
                const nextValue = parseInt(event.target.value, 10);
                update('Auf_Lager', Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 1);
              }}
              required
            />
          </div>

          {/* https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture */}
          <div className="row">
            <label>Foto 1*</label>
            <input
              type="file"
              id="basic-picture1"
              name="basic-picture1"
              accept="image/*"
              capture="environment"
              required
              onChange={handlePhoto1Change}
            />
          </div>

          {form.picture1 && (
            <div className="row">
              <label>Foto 2</label>
              <input
                type="file"
                id="basic-picture2"
                name="basic-picture2"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto2Change}
              />
            </div>
          )}

          {form.picture2 && (
            <div className="row">
              <label>Foto 3</label>
              <input
                type="file"
                id="basic-picture3"
                name="basic-picture3"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto3Change}
              />
            </div>
          )}

          <div className="row">
            <button type="submit">{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
