import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ItemDetailsFields, ItemFormData, createPhotoChangeHandler, extractReferenceFields, useItemFormState } from './forms/itemFormShared';
import { SimilarItemsPanel } from './forms/SimilarItemsPanel';
import { useSimilarItems } from './forms/useSimilarItems';

interface Props {
  draft: Partial<ItemFormData>;
  step: number;
  onSubmitDetails: (data: Partial<ItemFormData>) => Promise<void>;
  onSubmitPhotos: (data: Partial<ItemFormData>) => Promise<void>;
  submitLabel: string;
  isNew?: boolean;
}

export default function ItemForm_Agentic({
  draft,
  step,
  onSubmitDetails,
  onSubmitPhotos,
  submitLabel,
  isNew
}: Props) {
  const { form, update, mergeForm, setForm, generateMaterialNumber } = useItemFormState({ initialItem: draft });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { similarItems, loading, error, hasQuery } = useSimilarItems({
    description: form.Artikelbeschreibung,
    currentItemUUID: form.ItemUUID
  });

  const handleSelectSimilar = (selected: typeof similarItems[number]) => {
    try {
      console.log('Applying similar item selection (agentic)', selected.ItemUUID);
      setForm((prev) => {
        const referenceFields = extractReferenceFields(selected);
        const { Artikelbeschreibung: _ignoredDescription, ...restReferenceFields } = referenceFields;
        if (_ignoredDescription !== undefined) {
          console.log('Preserving existing description while adopting reference fields (agentic)');
        }
        const next = { ...prev, ...restReferenceFields } as Partial<ItemFormData>;
        if (isNew) {
          delete (next as Partial<ItemFormData>).ItemUUID;
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to apply similar item selection (agentic)', err);
    }
  };

  useEffect(() => {
    mergeForm(draft);
  }, [draft, mergeForm]);

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
    if (step !== 2) {
      return;
    }
    try {
      console.log('Submitting form via step 2 handler', form);
      await onSubmitPhotos(form);
    } catch (err) {
      console.error('Item form submit failed', err);
      setSubmitError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    }
  }

  async function handleStepOneSubmit() {
    setSubmitError(null);
    if (formRef.current && !formRef.current.reportValidity()) {
      return;
    }
    try {
      console.log('Submitting form via step 1 handler', form);
      await onSubmitDetails(form);
    } catch (err) {
      console.error('Item step 1 submit failed', err);
      setSubmitError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    }
  }

  return (
    <div className='container item'>
      <div className="card">
        <form ref={formRef} onSubmit={handleSubmit} className="item-form">
          <ItemDetailsFields
            form={form}
            isNew={isNew}
            onUpdate={update}
            onGenerateMaterialNumber={generateMaterialNumber}
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

          <hr></hr>

          {step === 2 && (
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
            {step === 1 ? (
              <button type="button" onClick={handleStepOneSubmit}>
                Weiter
              </button>
            ) : (
              <button type="submit">{submitLabel}</button>
            )}
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
