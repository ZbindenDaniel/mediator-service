import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { ItemDetailsFields, ItemFormData, createPhotoChangeHandler, useItemFormState } from './forms/itemFormShared';
import { SimilarItemsPanel } from './forms/SimilarItemsPanel';
import { useSimilarItems } from './forms/useSimilarItems';

interface Props {
  item: Partial<ItemFormData>;
  onSubmit: (data: Partial<ItemFormData>) => Promise<void>;
  submitLabel: string;
  isNew?: boolean;
  headerContent?: React.ReactNode;
  existingMediaFiles?: string[];
}

const fileInputWithChipsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem'
};

const fileChipListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.25rem'
};

const fileChipStyle: CSSProperties = {
  backgroundColor: '#f1f3f5',
  borderRadius: '999px',
  padding: '0.25rem 0.75rem',
  fontSize: '0.85rem',
  lineHeight: 1.2,
  display: 'inline-block'
};

// TODO: Support editing existing media assets directly from the form.
export default function ItemForm({ item, onSubmit, submitLabel, isNew, headerContent, existingMediaFiles }: Props) {
  const { form, update, setForm, generateMaterialNumber, changeStock } = useItemFormState({ initialItem: item });

  const { similarItems, loading, error, hasQuery } = useSimilarItems({
    description: form.Artikelbeschreibung,
    currentItemUUID: form.ItemUUID
  });

  const normalisedMediaFileNames = useMemo(() => {
    try {
      if (!Array.isArray(existingMediaFiles)) {
        return [] as string[];
      }
      const seen = new Set<string>();
      const normalised: string[] = [];
      existingMediaFiles.forEach((candidate) => {
        if (typeof candidate !== 'string') {
          return;
        }
        const trimmed = candidate.trim();
        if (!trimmed) {
          return;
        }
        const fileName = trimmed.split('/').pop() || trimmed;
        if (seen.has(fileName)) {
          return;
        }
        seen.add(fileName);
        normalised.push(fileName);
      });
      return normalised;
    } catch (err) {
      console.error('Failed to normalise existing media filenames for form display', err);
      return [] as string[];
    }
  }, [existingMediaFiles]);

  const primaryMediaFile = normalisedMediaFileNames[0] ?? null;
  const secondaryMediaFiles = normalisedMediaFileNames.slice(1);
  const tertiaryMediaFiles = secondaryMediaFiles.slice(1);
  const shouldShowAllExistingMediaOnPrimary = !form.picture1;
  const primaryMediaChips = shouldShowAllExistingMediaOnPrimary
    ? normalisedMediaFileNames
    : primaryMediaFile
      ? [primaryMediaFile]
      : [];
  const secondaryMediaChips = form.picture1 ? secondaryMediaFiles : [];
  const tertiaryMediaChips = form.picture2 ? tertiaryMediaFiles : [];

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


  return (
    <div className='container item'>
      <div className="card">
        {headerContent}
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
            <div className="file-input-with-chips" style={fileInputWithChipsStyle}>
                <input
                  type="file"
                  id="picture1"
                  name="picture1"
                  accept="image/*"
                  capture="environment"
                  required={isNew}
                  onChange={handlePhoto1Change}
                />
                {primaryMediaChips.length > 0 && (
                  <div className="file-chip-list" role="list" aria-label="Bereits vorhandene Dateien" style={fileChipListStyle}>
                    {primaryMediaChips.map((fileName) => (
                      <span className="file-chip" role="listitem" key={`existing-media-${fileName}`} style={fileChipStyle}>
                        {fileName}
                      </span>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {form.picture1 && (
            <div className="row">
              <label>
                Foto 2
              </label>
              <div className="file-input-with-chips" style={fileInputWithChipsStyle}>
                  <input
                    type="file"
                    id="picture2"
                    name="picture2"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhoto2Change}
                  />
                  {secondaryMediaChips.length > 0 && (
                    <div className="file-chip-list" role="list" aria-label="Bereits vorhandene Dateien" style={fileChipListStyle}>
                      {secondaryMediaChips.map((fileName) => (
                        <span className="file-chip" role="listitem" key={`existing-media-${fileName}`} style={fileChipStyle}>
                          {fileName}
                        </span>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          )}

          {form.picture2 && (
            <div className="row">
              <label>
                Foto 3
              </label>
              <div className="file-input-with-chips" style={fileInputWithChipsStyle}>
                  <input
                    type="file"
                    id="picture3"
                    name="picture3"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhoto3Change}
                  />
                  {tertiaryMediaChips.length > 0 && (
                    <div className="file-chip-list" role="list" aria-label="Bereits vorhandene Dateien" style={fileChipListStyle}>
                      {tertiaryMediaChips.map((fileName) => (
                        <span className="file-chip" role="listitem" key={`existing-media-${fileName}`} style={fileChipStyle}>
                          {fileName}
                        </span>
                      ))}
                    </div>
                  )}
              </div>
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
