import React, { useCallback, useMemo } from 'react';
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
}

export default function ItemForm({ item, onSubmit, submitLabel, isNew, headerContent, lockedFields, hidePhotoInputs }: Props) {
  const { form, update, generateMaterialNumber, changeStock } = useItemFormState({ initialItem: item });
  const { getCapture, isCameraMode, toggleMode } = usePhotoInputModes();

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
                    capture={getCapture('picture1')}
                    required={isNew}
                    onChange={handlePhoto1Change}
                  />
                  <button
                    type="button"
                    className="button-secondary photo-input-toggle"
                    onClick={() => handlePhotoModeToggle('picture1')}
                    aria-pressed={!isCameraMode('picture1')}
                    aria-label="Foto 1 Eingabemodus umschalten"
                  >
                    {isCameraMode('picture1') ? 'Datei auswählen' : 'Kamera verwenden'}
                  </button>
                </div>
              </div>

              {form.picture1 && (
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
                      capture={getCapture('picture2')}
                      onChange={handlePhoto2Change}
                    />
                    <button
                      type="button"
                      className="button-secondary photo-input-toggle"
                      onClick={() => handlePhotoModeToggle('picture2')}
                      aria-pressed={!isCameraMode('picture2')}
                      aria-label="Foto 2 Eingabemodus umschalten"
                    >
                      {isCameraMode('picture2') ? 'Datei auswählen' : 'Kamera verwenden'}
                    </button>
                  </div>
                </div>
              )}

              {form.picture2 && (
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
                      capture={getCapture('picture3')}
                      onChange={handlePhoto3Change}
                    />
                    <button
                      type="button"
                      className="button-secondary photo-input-toggle"
                      onClick={() => handlePhotoModeToggle('picture3')}
                      aria-pressed={!isCameraMode('picture3')}
                      aria-label="Foto 3 Eingabemodus umschalten"
                    >
                      {isCameraMode('picture3') ? 'Datei auswählen' : 'Kamera verwenden'}
                    </button>
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
