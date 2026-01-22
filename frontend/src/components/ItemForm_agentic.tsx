import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ItemDetailsFields,
  ItemFormData,
  PhotoFieldKey,
  PHOTO_INPUT_FIELDS,
  createPhotoChangeHandler,
  useItemFormState
} from './forms/itemFormShared';
import PhotoCaptureModal from './PhotoCaptureModal';

type AgenticFormMode = 'details' | 'photos';

// TODO(optional-photos): Re-evaluate agentic photo submission now that Foto 1 is optional.
interface Props {
  draft: Partial<ItemFormData>;
  onSubmitDetails?: (data: Partial<ItemFormData>) => Promise<void>;
  onSubmitPhotos: (data: Partial<ItemFormData>) => Promise<void>;
  onFallbackToManual?: (data: Partial<ItemFormData>) => void;
  submitLabel: string;
  isNew?: boolean;
  initialPhotos?: readonly string[];
  layout?: 'page' | 'embedded';
}

export default function ItemForm_Agentic({
  draft,
  onSubmitDetails,
  onSubmitPhotos,
  onFallbackToManual,
  submitLabel,
  isNew,
  initialPhotos,
  layout = 'page'
}: Props) {
  const { form, update, mergeForm, generateMaterialNumber, seedPhotos, seededPhotos } = useItemFormState({
    initialItem: draft,
    initialPhotos
  });
  const [activePhotoField, setActivePhotoField] = useState<PhotoFieldKey | null>(null);
  const isCameraAvailable = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    []
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const hasBasicDraftInfo = useMemo(
    () => typeof draft.Artikelbeschreibung === 'string' && draft.Artikelbeschreibung.trim().length > 0,
    [draft.Artikelbeschreibung]
  );
  const [mode, setMode] = useState<AgenticFormMode>(hasBasicDraftInfo ? 'photos' : 'details');
  const formRef = useRef<HTMLFormElement>(null);
  const materialNumberRequestedRef = useRef(false);
  const manualFallbackInFlightRef = useRef(false);
  const [manualFallbackPending, setManualFallbackPending] = useState(false);

  useEffect(() => {
    mergeForm(draft);
  }, [draft, mergeForm]);

  useEffect(() => {
    try {
      seedPhotos(initialPhotos);
    } catch (error) {
      console.error('Failed to apply initial photos to agentic item form state', error);
    }
  }, [initialPhotos, seedPhotos]);

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

  const handleOpenCamera = useCallback((field: PhotoFieldKey) => {
    try {
      setActivePhotoField(field);
    } catch (error) {
      console.error('Failed to open camera capture modal for agentic form', { error, field });
    }
  }, []);

  const handleCloseCamera = useCallback(() => {
    try {
      setActivePhotoField(null);
    } catch (error) {
      console.error('Failed to close camera capture modal for agentic form', error);
    }
  }, []);

  const handleCapturePhoto = useCallback(
    (dataUrl: string) => {
      if (!activePhotoField) {
        console.warn('Captured photo without active agentic field');
        return;
      }
      try {
        update(activePhotoField, dataUrl as ItemFormData[typeof activePhotoField]);
      } catch (error) {
        console.error('Failed to apply captured photo to agentic item form', { error, field: activePhotoField });
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

  const handleManualFallback = useCallback(() => {
    if (!onFallbackToManual) {
      console.warn('Manual fallback requested without handler; ignoring request.');
      return;
    }

    if (manualFallbackInFlightRef.current) {
      console.warn('Manual fallback already triggered. Ignoring duplicate request.');
      return;
    }

    manualFallbackInFlightRef.current = true;
    setManualFallbackPending(true);

    try {
      console.log('Agentic flow fallback requested by user', {
        mode,
        hasArtikelbeschreibung: Boolean(form.Artikelbeschreibung),
        hasMaterialNumber: Boolean(form.Artikel_Nummer)
      });
      onFallbackToManual({ ...form });
      setSubmitError(null);
    } catch (error) {
      manualFallbackInFlightRef.current = false;
      setManualFallbackPending(false);
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

  // TODO(overview-inline-create): Validate agentic form layout when embedded on the overview.
  const cardBody = (
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

        <div className="row">
          <div className="button-group">
            <button type="submit">{mode === 'details' ? 'Weiter' : submitLabel}</button>
            {onFallbackToManual && (
              // TODO: Replace manual fallback trigger with shared secondary button styling once design refresh lands.
              <button
                type="button"
                className="button-secondary"
                onClick={handleManualFallback}
                disabled={manualFallbackPending}
              >
                Zur manuellen Erfassung
              </button>
            )}
          </div>
        </div>
        {submitError && (
          <div className="row error">
            <span>{submitError}</span>
          </div>
        )}
      </form >
    </div>
  );

  const formBlock = layout === 'embedded' ? cardBody : (
    <div className='container item'>
      {cardBody}
    </div>
  );

  return (
    <>
      {formBlock}
      <PhotoCaptureModal
        isOpen={activePhotoField !== null}
        onClose={handleCloseCamera}
        onCapture={handleCapturePhoto}
        title={cameraTitle}
      />
    </>
  );
}
