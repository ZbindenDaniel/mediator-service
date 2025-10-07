import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ItemDetailsFields, ItemFormData, createPhotoChangeHandler, useItemFormState } from './forms/itemFormShared';

type AgenticFormMode = 'details' | 'photos';

interface Props {
  draft: Partial<ItemFormData>;
  onSubmitDetails?: (data: Partial<ItemFormData>) => Promise<void>;
  onSubmitPhotos: (data: Partial<ItemFormData>) => Promise<void>;
  submitLabel: string;
  isNew?: boolean;
}

export default function ItemForm_Agentic({ draft, onSubmitDetails, onSubmitPhotos, submitLabel, isNew }: Props) {
  const { form, update, mergeForm, generateMaterialNumber } = useItemFormState({ initialItem: draft });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const hasBasicDraftInfo = useMemo(
    () => typeof draft.Artikelbeschreibung === 'string' && draft.Artikelbeschreibung.trim().length > 0,
    [draft.Artikelbeschreibung]
  );
  const [mode, setMode] = useState<AgenticFormMode>(hasBasicDraftInfo ? 'photos' : 'details');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    mergeForm(draft);
  }, [draft, mergeForm]);

  useEffect(() => {
    if (hasBasicDraftInfo && mode !== 'photos') {
      console.log('Agentic form detected prefilled draft, switching to photo mode');
      setMode('photos');
    }
  }, [hasBasicDraftInfo, mode]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (mode === 'details') {
      if (formRef.current && !formRef.current.reportValidity()) {
        return;
      }

      if (!onSubmitDetails) {
        console.warn('Agentic details submit handler missing; falling back to photo mode');
        setMode('photos');
        return;
      }

      try {
        console.log('Submitting agentic details before photos', form);
        await onSubmitDetails(form);
        setMode('photos');
      } catch (err) {
        console.error('Item details submit failed', err);
        setSubmitError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
      }
      return;
    }

    if (formRef.current && !formRef.current.reportValidity()) {
      return;
    }

    if (!form.picture1) {
      console.warn('Agentic photo submit attempted without primary photo');
      setSubmitError('Bitte mindestens ein Foto hochladen.');
      return;
    }

    try {
      console.log('Submitting agentic photos', {
        hasPicture1: Boolean(form.picture1),
        hasPicture2: Boolean(form.picture2),
        hasPicture3: Boolean(form.picture3)
      });
      await onSubmitPhotos(form);
    } catch (err) {
      console.error('Item photo submit failed', err);
      setSubmitError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    }
  }

  return (
    <div className='container item'>
      <div className="card">
        <form ref={formRef} onSubmit={handleSubmit} className="item-form">
          {mode === 'details' && (
            <>
              <ItemDetailsFields
                form={form}
                isNew={isNew}
                onUpdate={update}
                onGenerateMaterialNumber={generateMaterialNumber}
              />

              <hr></hr>
            </>
          )}

          {mode === 'photos' && (
            <>
              {/* https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture */}
              <div className="row">
                <label>
                  Foto 1*
                </label>
                <input
                  type="file"
                  id="picture1"
                  name="picture1"
                  accept="image/*"
                  capture="environment"
                  required
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
            </>
          )}

          <div className="row">
            <button type="submit">{mode === 'details' ? 'Weiter' : submitLabel}</button>
          </div>
          {submitError && (
            <div className="row error">
              <span>{submitError}</span>
            </div>
          )}
        </form >
      </div>
    </div>
  );
}
