import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ItemDetailsFields,
  ItemFormData,
  ItemFormMode,
  ItemFormPayload,
  LockedFieldConfig,
  PhotoFieldKey,
  PHOTO_INPUT_FIELDS,
  createPhotoChangeHandler,
  useItemFormState
} from './forms/itemFormShared';
import PhotoCaptureModal from './PhotoCaptureModal';

type ItemFormProps<T extends ItemFormPayload = ItemFormData> = {
  item: Partial<T>;
  onSubmit: (data: Partial<T>) => Promise<void>;
  submitLabel: string;
  isNew?: boolean;
  headerContent?: React.ReactNode;
  lockedFields?: LockedFieldConfig;
  hidePhotoInputs?: boolean;
  initialPhotos?: readonly string[];
  formMode?: ItemFormMode;
};

export default function ItemForm<T extends ItemFormPayload = ItemFormData>({
  item,
  onSubmit,
  submitLabel,
  isNew,
  headerContent,
  lockedFields,
  hidePhotoInputs,
  initialPhotos,
  formMode = 'full'
}: ItemFormProps<T>) {
  const { form, update, mergeForm, generateMaterialNumber, changeStock, seedPhotos, seededPhotos, clearPhoto } = useItemFormState({
    initialItem: item as Partial<ItemFormPayload>,
    initialPhotos,
    formMode
  });
  const [activePhotoField, setActivePhotoField] = useState<PhotoFieldKey | null>(null);
  const isCameraAvailable = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    []
  );

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      console.log('Submitting item form', form);
      await onSubmit(form as Partial<T>);
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

  const handleRemovePhoto = useCallback(
    (field: PhotoFieldKey) => {
      try {
        clearPhoto(field);
      } catch (error) {
        console.error('Failed to remove photo from preview list', { field, error });
      }
    },
    [clearPhoto]
  );

  const handleOpenCamera = useCallback((field: PhotoFieldKey) => {
    try {
      setActivePhotoField(field);
    } catch (error) {
      console.error('Failed to open camera capture modal', { error, field });
    }
  }, []);

  const handleCloseCamera = useCallback(() => {
    try {
      setActivePhotoField(null);
    } catch (error) {
      console.error('Failed to close camera capture modal', error);
    }
  }, []);

  const handleCapturePhoto = useCallback(
    (dataUrl: string) => {
      if (!activePhotoField) {
        console.warn('Captured photo without active field');
        return;
      }
      try {
        update(activePhotoField, dataUrl as ItemFormPayload[typeof activePhotoField]);
      } catch (error) {
        console.error('Failed to apply captured photo to item form', { error, field: activePhotoField });
      }
    },
    [activePhotoField, update]
  );
  const cameraTitle = useMemo(() => {
    if (!activePhotoField) {
      return 'Foto aufnehmen';
    }
    const index = PHOTO_INPUT_FIELDS.indexOf(activePhotoField);
    if (index < 0) {
      return 'Foto aufnehmen';
    }
    return `Foto ${index + 1} aufnehmen`;
  }, [activePhotoField]);

  const photoPreview = useMemo(() => {
    const entries = PHOTO_INPUT_FIELDS.map((field, index) => {
      const value = form[field];
      if (!value) {
        return null;
      }
      return { field, label: `Foto ${index + 1} übernommen` };
    }).filter((entry): entry is { field: PhotoFieldKey; label: string } => entry !== null);

    if (entries.length === 0) {
      return null;
    }
    return (
      <div className="row">
        <label>Vorhandene Fotos</label>
        <ul className="photo-preview-list">
          {entries.map(({ field, label }) => (
            <li key={field}>
              {/* TODO: Consider extracting the photo preview item into its own component once additional actions are introduced. */}
              <span>{label}</span>
              <button
                type="button"
                className="photo-preview-remove"
                aria-label={`${label} entfernen`}
                onClick={() => handleRemovePhoto(field)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }, [form.picture1, form.picture2, form.picture3, handleRemovePhoto]);

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
            formMode={formMode}
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
                  {isCameraAvailable ? (
                    <button
                      type="button"
                      onClick={() => handleOpenCamera('picture1')}
                      aria-label="Kamera öffnen für Foto 1"
                    >
                      Kamera öffnen
                    </button>
                  ) : null}
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
                    {isCameraAvailable ? (
                      <button
                        type="button"
                        onClick={() => handleOpenCamera('picture2')}
                        aria-label="Kamera öffnen für Foto 2"
                      >
                        Kamera öffnen
                      </button>
                    ) : null}
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
                    {isCameraAvailable ? (
                      <button
                        type="button"
                        onClick={() => handleOpenCamera('picture3')}
                        aria-label="Kamera öffnen für Foto 3"
                      >
                        Kamera öffnen
                      </button>
                    ) : null}
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
      <PhotoCaptureModal
        isOpen={activePhotoField !== null}
        onClose={handleCloseCamera}
        onCapture={handleCapturePhoto}
        title={cameraTitle}
      />
    </div>
  );
}
