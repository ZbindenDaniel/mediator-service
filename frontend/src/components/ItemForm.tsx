import React, { useMemo } from 'react';
import { ItemDetailsFields, ItemFormData, createPhotoChangeHandler, useItemFormState } from './forms/itemFormShared';
import { SimilarItemsPanel } from './forms/SimilarItemsPanel';
import { useSimilarItems } from './forms/useSimilarItems';

interface Props {
  item: Partial<ItemFormData>;
  onSubmit: (data: Partial<ItemFormData>) => Promise<void>;
  submitLabel: string;
  isNew?: boolean;
  headerContent?: React.ReactNode;
}

export default function ItemForm({ item, onSubmit, submitLabel, isNew }: Props) {
  const { form, update, setForm, generateMaterialNumber, changeStock } = useItemFormState({ initialItem: item });

  const { similarItems, loading, error, hasQuery } = useSimilarItems({
    description: form.Artikelbeschreibung,
    currentItemUUID: form.ItemUUID
  });

  const handleSelectSimilar = (selected: typeof similarItems[number]) => {
    try {
      console.log('Applying similar item selection', selected.ItemUUID);
      setForm((prev) => {
        const next = { ...prev, ...selected } as Partial<ItemFormData>;
        if (isNew) {
          delete (next as Partial<ItemFormData>).ItemUUID;
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to apply similar item selection', err);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      console.log('Submitting item form', form);
      await onSubmit(form);
    } catch (err) {
      console.error('Item form submit failed', err);
    }
  }

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

  let headerContent = 'TODO!!';

  return (
    <div className='container item'>
      <div className="card">
        {headerContent ? <div className="item-form__header">{headerContent}</div> : null}
        <form onSubmit={handleSubmit} className="item-form">
          <ItemDetailsFields
            form={form}
            isNew={isNew}
            onUpdate={update}
            onGenerateMaterialNumber={generateMaterialNumber}
            onChangeStock={!isNew ? changeStock : undefined}
            descriptionSuggestions={
              hasQuery ? (
                <SimilarItemsPanel
                  items={similarItems}
                  loading={loading}
                  error={error}
                  onSelect={handleSelectSimilar}
                />
              ) : null
            }
          />

          {/* https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture */}
          <div className="row">
            <label>
              Foto 1{isNew ? '*' : ''}
            </label>
            <input
              type="file"
              id="picture1"
              name="picture1"
              accept="image/*"
              capture="environment"
              required={isNew}
              onChange={handlePhoto1Change}
            />
          </div>

          {form.picture1 && (
            <div className="row">
              <label>
                Foto 2
              </label>
              <input
                type="file"
                id="picture2"
                name="picture2"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto2Change}
              />
            </div>
          )}

          {form.picture2 && (
            <div className="row">
              <label>
                Foto 3
              </label>
              <input
                type="file"
                id="picture3"
                name="picture3"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto3Change}
              />
            </div>
          )}

          <div className="row">
            <button type="submit">{submitLabel}</button>
          </div>
        </form >
      </div>
    </div>
  );
}
