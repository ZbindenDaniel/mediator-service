import React, { useEffect } from 'react';
import { ITEM_EINHEIT_VALUES, isItemEinheit } from '../../../models';
import { ItemFormData, ITEM_FORM_DEFAULT_EINHEIT, useItemFormState } from './forms/itemFormShared';

interface ItemBasicInfoFormProps {
  initialValues: Partial<ItemFormData>;
  onSubmit: (data: Partial<ItemFormData>) => void;
  submitLabel?: string;
  layout?: 'page' | 'embedded';
  headerContent?: React.ReactNode;
}

// TODO(overview-inline-create): Confirm basic info form header layout for the overview inline flow.
export function ItemBasicInfoForm({
  initialValues,
  onSubmit,
  submitLabel = 'Weiter',
  layout = 'page',
  headerContent
}: ItemBasicInfoFormProps) {
  const { form, update, mergeForm } = useItemFormState({ initialItem: initialValues });
  useEffect(() => {
    mergeForm(initialValues);
  }, [initialValues, mergeForm]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload: Partial<ItemFormData> = { ...form };
      const qualityProvided = Object.prototype.hasOwnProperty.call(initialValues, 'Quality');
      if (!qualityProvided && payload.Quality == null) {
        delete (payload as Record<string, unknown>).Quality;
      }
      console.log('Submitting basic item info step', payload);
      onSubmit(payload);
    } catch (err) {
      console.error('Failed to submit basic item info step', err);
    }
  };

  const formBody = (
    <>
      {headerContent ? <div className="item-form__header">{headerContent}</div> : null}
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
          <button type="submit">{submitLabel}</button>
        </div>
      </form>
    </>
  );

  const card = <div className="card">{formBody}</div>;

  if (layout === 'embedded') {
    return card;
  }

  return (
    <div className='container item'>
      {card}
    </div>
  );
}
