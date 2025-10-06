import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ItemDetailsFields, ItemFormData, useItemFormState } from './forms/itemFormShared';
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
        const next = { ...prev, ...selected } as Partial<ItemFormData>;
        if (selected?.Grafikname === undefined && prev?.Grafikname) {
          next.Grafikname = prev.Grafikname;
        }
        delete (next as Partial<ItemFormData>).picture1;
        delete (next as Partial<ItemFormData>).picture2;
        delete (next as Partial<ItemFormData>).picture3;
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

  const manualFormLink = useMemo(() => {
    if (form.ItemUUID) {
      return `/items/${encodeURIComponent(form.ItemUUID)}/edit`;
    }
    const params = new URLSearchParams();
    if (form.BoxID) {
      params.set('box', String(form.BoxID));
    }
    params.set('manual', '1');
    const query = params.toString();
    return `/items/new${query ? `?${query}` : ''}`;
  }, [form.BoxID, form.ItemUUID]);

  const handleOpenManualForm = useCallback(() => {
    if (!manualFormLink) {
      console.warn('Manual form link missing while trying to open it for photo upload assistance');
      return;
    }
    try {
      window.open(manualFormLink, '_blank', 'noopener,noreferrer');
      console.info('Opened manual form for managing photos', {
        manualFormLink,
        itemUUID: form.ItemUUID
      });
    } catch (err) {
      console.error('Failed to open manual form link', err);
    }
  }, [form.ItemUUID, manualFormLink]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (step !== 2) {
      return;
    }
    try {
      const { picture1: _picture1, picture2: _picture2, picture3: _picture3, ...payload } = form;
      console.log('Submitting form via step 2 handler (photos managed manually)', payload);
      await onSubmitPhotos(payload as Partial<ItemFormData>);
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
            <section className="agentic-photo-helper">
              <div className="row">
                <label>Fotos verwalten</label>
                <p className="muted">
                  Neue Fotos können aktuell nur im manuellen Formular hochgeladen oder ersetzt werden.
                </p>
                {form.Grafikname ? (
                  <p className="muted">
                    Aktuelles Foto:
                    {' '}
                    <a href={form.Grafikname} target="_blank" rel="noopener noreferrer">
                      {form.Grafikname}
                    </a>
                  </p>
                ) : (
                  <p className="muted">Für diesen Artikel liegt noch kein Foto vor.</p>
                )}
              </div>
              <div className="row">
                <label>Manuelles Formular</label>
                <div className="manual-form-helper">
                  <input
                    type="text"
                    readOnly
                    value={manualFormLink}
                    onFocus={(event) => {
                      try {
                        event.currentTarget.select();
                      } catch (err) {
                        console.warn('Selecting manual form link failed', err);
                      }
                    }}
                  />
                  <button type="button" onClick={handleOpenManualForm}>
                    Öffnen
                  </button>
                </div>
              </div>
            </section>
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
