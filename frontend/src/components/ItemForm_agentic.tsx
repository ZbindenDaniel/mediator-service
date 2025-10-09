import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ItemDetailsFields, ItemFormData, createPhotoChangeHandler, useItemFormState } from './forms/itemFormShared';

type AgenticFormMode = 'details' | 'photos';

interface Props {
  draft: Partial<ItemFormData>;
  onSubmitDetails?: (data: Partial<ItemFormData>) => Promise<void>;
  onSubmitPhotos: (data: Partial<ItemFormData>) => Promise<void>;
  onFallbackToManual?: (data: Partial<ItemFormData>) => void;
  submitLabel: string;
  isNew?: boolean;
}

export default function ItemForm_Agentic({
  draft,
  onSubmitDetails,
  onSubmitPhotos,
  onFallbackToManual,
  submitLabel,
  isNew
}: Props) {
  const { form, update, mergeForm, generateMaterialNumber } = useItemFormState({ initialItem: draft });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const hasBasicDraftInfo = useMemo(
    () => typeof draft.Artikelbeschreibung === 'string' && draft.Artikelbeschreibung.trim().length > 0,
    [draft.Artikelbeschreibung]
  );
  const [mode, setMode] = useState<AgenticFormMode>(hasBasicDraftInfo ? 'photos' : 'details');
  const formRef = useRef<HTMLFormElement>(null);
  const materialNumberRequestedRef = useRef(false);

  useEffect(() => {
    mergeForm(draft);
  }, [draft, mergeForm]);

  useEffect(() => {
    if (hasBasicDraftInfo && mode !== 'photos') {
      console.log('Agentic form detected prefilled draft, switching to photo mode');
      setMode('photos');
    }
  }, [hasBasicDraftInfo, mode]);

  useEffect(() => {
    if (!isNew) {
      materialNumberRequestedRef.current = false;
      return;
    }
    if (mode !== 'photos') {
      materialNumberRequestedRef.current = false;
      return;
    }
    if (form.Artikel_Nummer) {
      materialNumberRequestedRef.current = false;
      return;
    }
    if (materialNumberRequestedRef.current) {
      return;
    }
    materialNumberRequestedRef.current = true;
    let cancelled = false;
    const ensureMaterialNumber = async () => {
      try {
        const generated = await generateMaterialNumber();
        if (!generated) {
          console.warn('Material number request returned empty value in photo mode');
          materialNumberRequestedRef.current = false;
          return;
        }
        if (!cancelled) {
          console.log('Generated material number while skipping details screen', { Artikel_Nummer: generated });
        }
      } catch (error) {
        console.error('Failed to ensure material number during photo mode', error);
        materialNumberRequestedRef.current = false;
      }
    };
    void ensureMaterialNumber();
    return () => {
      cancelled = true;
    };
  }, [form.Artikel_Nummer, generateMaterialNumber, isNew, mode]);

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

  const handleManualFallback = useCallback(() => {
    if (!onFallbackToManual) {
      console.warn('Manual fallback requested without handler; ignoring request.');
      return;
    }

    try {
      console.log('Agentic flow fallback requested by user', {
        mode,
        hasArtikelbeschreibung: Boolean(form.Artikelbeschreibung),
        hasMaterialNumber: Boolean(form.Artikel_Nummer)
      });
      onFallbackToManual({ ...form });
      setSubmitError(null);
    } catch (error) {
      console.error('Failed to execute manual fallback handler from agentic form', error);
    }
  }, [form, mode, onFallbackToManual]);

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
      let submissionData = form;
      if (isNew && !form.Artikel_Nummer) {
        console.warn('Generating material number before agentic photo submission');
        const generated = await generateMaterialNumber();
        if (!generated) {
          console.error('Material number generation failed before photo submission');
          setSubmitError('Materialnummer konnte nicht erstellt werden. Bitte erneut versuchen.');
          return;
        }
        submissionData = { ...form, Artikel_Nummer: generated };
      }

      console.log('Submitting agentic photos', {
        hasPicture1: Boolean(submissionData.picture1),
        hasPicture2: Boolean(submissionData.picture2),
        hasPicture3: Boolean(submissionData.picture3),
        Artikel_Nummer: submissionData.Artikel_Nummer
      });
      await onSubmitPhotos(submissionData);
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
          {onFallbackToManual && (
            <div className="row">
              {/* TODO: Replace manual fallback trigger with shared secondary button styling once design refresh lands. */}
              <button type="button" className="button-secondary" onClick={handleManualFallback}>
                Manuell fortfahren
              </button>
            </div>
          )}
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
