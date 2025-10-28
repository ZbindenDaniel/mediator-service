import React, { useCallback, useEffect, useMemo } from 'react';
import {
  ItemDetailsFields,
  ItemFormData,
  LockedFieldConfig,
  PhotoFieldKey,
  createPhotoChangeHandler,
  useItemFormState,
  usePhotoInputModes
} from './forms/itemFormShared';

interface Props {
  item: Partial<ItemFormData>;
  onSubmit: (data: Partial<ItemFormData>) => Promise<void>;
  submitLabel: string;
  isNew?: boolean;
  headerContent?: React.ReactNode;
  lockedFields?: LockedFieldConfig;
  hidePhotoInputs?: boolean;
  initialPhotos?: readonly string[];
}

export default function ItemForm({
  item,
  onSubmit,
  submitLabel,
  isNew,
  headerContent,
  lockedFields,
  hidePhotoInputs,
  initialPhotos
}: Props) {
  const { form, update, mergeForm, generateMaterialNumber, changeStock, seedPhotos, seededPhotos } = useItemFormState({
    initialItem: item,
    initialPhotos
  });
  const { getCapture, isCameraMode, toggleMode } = usePhotoInputModes();

  useEffect(() => {
    try {
      mergeForm(item);
    } catch (error) {
      console.error('Failed to merge updated item draft into item form state', error);
    }
  }, [item, mergeForm]);

  useEffect(() => {
    try {
      seedPhotos(initialPhotos);
    } catch (error) {
      console.error('Failed to apply initial photos to item form state', error);
    }
  }, [initialPhotos, seedPhotos]);

  const handlePhotoModeToggle = useCallback(
    (field: PhotoFieldKey) => {
      try {
        toggleMode(field);
      } catch (error) {
        console.error('Failed to toggle photo input mode in standard item form', error);
      }
    },
    [toggleMode]
  );

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

  const photoPreview = useMemo(() => {
    const photos = [form.picture1, form.picture2, form.picture3].filter(Boolean);
    if (photos.length === 0) {
      return null;
    }
    return (
      <div className="row">
        <label>Vorhandene Fotos</label>
        <ul className="photo-preview-list">
          {photos.map((_, index) => (
            <li key={index}>
              <span>Foto {index + 1} übernommen</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }, [form.picture1, form.picture2, form.picture3]);

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
            onChangeStock={changeStock}
            lockedFields={lockedFields}
          />

          {!hidePhotoInputs ? (
            <>
              {photoPreview}
              {/* https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture */}
              <div className="row">
                <label htmlFor="picture1">
                  Foto 1{isNew ? '*' : ''}
                </label>
                <div className="photo-input-controls">
                  <input
                    type="file"
                    id="picture1"
                    name="picture1"
                    accept="image/*"
                    capture={undefined}
                    required={isNew}
                    onChange={handlePhoto1Change}
                  />
                </div>
              </div>

              {(form.picture1 || seededPhotos[0]) && (
                <div className="row">
                  <label htmlFor="picture2">
                    Foto 2
                  </label>
                  <div className="photo-input-controls">
                    <input
                      type="file"
                      id="picture2"
                      name="picture2"
                      accept="image/*"
                    capture={undefined}
                      onChange={handlePhoto2Change}
                    />
                  </div>
                </div>
              )}

              {(form.picture2 || seededPhotos[1]) && (
                <div className="row">
                  <label htmlFor="picture3">
                    Foto 3
                  </label>
                  <div className="photo-input-controls">
                    <input
                      type="file"
                      id="picture3"
                      name="picture3"
                      accept="image/*"
                    capture={undefined}
                      onChange={handlePhoto3Change}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            photoPreview
          )}

          <div className="row">
            <button type="submit">{submitLabel}</button>
          </div>
        </form >
      </div>
    </div>
  );
}
