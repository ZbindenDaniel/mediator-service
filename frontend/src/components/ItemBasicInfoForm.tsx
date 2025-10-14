import React, { useEffect } from 'react';
import { ItemFormData, useItemFormState } from './forms/itemFormShared';

interface ItemBasicInfoFormProps {
  initialValues: Partial<ItemFormData>;
  onSubmit: (data: Partial<ItemFormData>) => void;
  submitLabel?: string;
}

export function ItemBasicInfoForm({ initialValues, onSubmit, submitLabel = 'Weiter' }: ItemBasicInfoFormProps) {
  const { form, update, mergeForm, generateMaterialNumber } = useItemFormState({ initialItem: initialValues });

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
            />
          </div>

          <div className="row">
            <label>Anzahl*</label>
            <input
              type="number"
              value={form.Auf_Lager ?? 1}
              onChange={(event) => update('Auf_Lager', parseInt(event.target.value, 10) || 0)}
              required
            />
          </div>


          <div className="row">
            <button type="submit">{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

