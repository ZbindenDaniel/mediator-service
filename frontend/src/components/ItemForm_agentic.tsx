import React, { useEffect, useRef, useState } from 'react';
import type { Item } from '../../../models';

interface ItemFormData extends Item {
  picture1?: string | null;
  picture2?: string | null;
  picture3?: string | null;
}

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
  const [form, setForm] = useState<Partial<ItemFormData>>({ ...draft });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function update<K extends keyof ItemFormData>(key: K, value: ItemFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    setForm((prev) => ({ ...prev, ...draft }));
  }, [draft]);

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

  async function generateMaterialNumber() {
    try {
      const res = await fetch('/api/getNewMaterialNumber');
      if (res.ok) {
        const j = await res.json();
        update('Artikel_Nummer', j.nextArtikelNummer);
      } else {
        console.error('Failed to get material number', res.status);
      }
    } catch (err) {
      console.error('Failed to get material number', err);
    }
  }

  return (
    <div className='container item'>
      <div className="card">
        <form ref={formRef} onSubmit={handleSubmit} className="item-form">
          <input value={form.BoxID || ''} readOnly hidden />

          <div className="row">
            <label>
              Artikelbeschreibung*
            </label>
            <input
              value={form.Artikelbeschreibung || ''}
              onChange={(e) => update('Artikelbeschreibung', e.target.value)}
              required
            />
          </div>

          <div className="row">
            {form.ItemUUID && (
              <>
                <label>
                  Behälter-ID
                </label>
                <input type="hidden" value={form.ItemUUID} />
              </>
            )}

            <label>
              Artikelnummer*
            </label>
            <div className="combined-input">
              <input
                value={form.Artikel_Nummer || ''}
                onChange={(e) => update('Artikel_Nummer', e.target.value)}
                required
              />
              {isNew && (
                <button type="button" onClick={generateMaterialNumber}>
                  neu?
                </button>
              )}
            </div>
          </div>

          <div className="row">
            <label>
              Anzahl*
            </label>
            {isNew ? (
              <input
                type="number"
                value={form.Auf_Lager ?? 0}
                onChange={(e) => update('Auf_Lager', parseInt(e.target.value, 10) || 0)}
                required
              />
            ) : (
              <input type="number" value={form.Auf_Lager ?? 0} readOnly required />
            )}
          </div>

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
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => update('picture1', reader.result as string);
                      reader.readAsDataURL(file);
                    } else {
                      update('picture1', null as any);
                    }
                  }}
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
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => update('picture2', reader.result as string);
                        reader.readAsDataURL(file);
                      } else {
                        update('picture2', null as any);
                      }
                    }}
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
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => update('picture3', reader.result as string);
                        reader.readAsDataURL(file);
                      } else {
                        update('picture3', null as any);
                      }
                    }}
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
