import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Item } from '../../../../models';
import { ensureUser } from '../../lib/user';
import { itemCategories } from '../../data/itemCategories';
import type { ItemCategoryDefinition } from '../../data/itemCategories';

export interface ItemFormData extends Item {
  picture1?: string | null;
  picture2?: string | null;
  picture3?: string | null;
  agenticStatus?: 'queued' | 'running';
  agenticSearch?: string;
}

export type LockedFieldMode = 'readonly' | 'hidden';
export type LockedFieldConfig = Partial<Record<keyof ItemFormData, LockedFieldMode>>;

export type StockOperation = 'add' | 'remove';

interface UseItemFormStateOptions {
  initialItem: Partial<ItemFormData>;
}

export function useItemFormState({ initialItem }: UseItemFormStateOptions) {
  const [form, setForm] = useState<Partial<ItemFormData>>({ ...initialItem });
  const update = useCallback(<K extends keyof ItemFormData>(key: K, value: ItemFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const mergeForm = useCallback((next: Partial<ItemFormData>) => {
    setForm((prev) => ({ ...prev, ...next }));
  }, []);

  const resetForm = useCallback((next: Partial<ItemFormData>) => {
    setForm({ ...next });
  }, []);

  const generateMaterialNumber = useCallback(async () => {
    try {
      console.log('Requesting new material number for item form');
      const res = await fetch('/api/getNewMaterialNumber');
      if (!res.ok) {
        console.error('Failed to get material number', res.status);
        return;
      }
      const j = await res.json();
      update('Artikel_Nummer', j.nextArtikelNummer);
    } catch (err) {
      console.error('Failed to get material number', err);
    }
  }, [update]);

  const changeStock = useCallback(async (op: StockOperation) => {
    if (!form.ItemUUID) {
      console.warn('Cannot change stock without an ItemUUID');
      return;
    }
    const actor = await ensureUser();
    if (!actor) {
      console.info('Stock change aborted: missing username.');
      window.alert('Bitte zuerst oben den Benutzer setzen.');
      return;
    }
    try {
      console.log('Changing stock quantity', { op, itemUUID: form.ItemUUID });
      const res = await fetch(`/api/items/${encodeURIComponent(form.ItemUUID)}/${op}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor })
      });
      if (!res.ok) {
        console.error(`Failed to ${op} stock`, res.status);
        return;
      }
      const j = await res.json();
      setForm((prev) => {
        const next = { ...prev, Auf_Lager: j.quantity };
        if (op === 'remove' && j.boxId === null) {
          next.BoxID = null as any;
        }
        return next;
      });
      console.log(`Stock ${op === 'add' ? 'increase' : 'decrease'} succeeded`, j);
    } catch (err) {
      console.error(`Failed to ${op} stock`, err);
    }
  }, [form.ItemUUID]);

  return { form, update, mergeForm, resetForm, setForm, generateMaterialNumber, changeStock } as const;
}

interface ItemDetailsFieldsProps {
  form: Partial<ItemFormData>;
  isNew?: boolean;
  onUpdate: <K extends keyof ItemFormData>(key: K, value: ItemFormData[K]) => void;
  onGenerateMaterialNumber?: () => void | Promise<void>;
  onChangeStock?: (op: StockOperation) => void | Promise<void>;
  descriptionSuggestions?: React.ReactNode;
  lockedFields?: LockedFieldConfig;
}

function isFieldLocked(lockedFields: LockedFieldConfig | undefined, field: keyof ItemFormData, mode: LockedFieldMode) {
  return lockedFields?.[field] === mode;
}

export function ItemDetailsFields({
  form,
  isNew,
  onUpdate,
  onGenerateMaterialNumber,
  onChangeStock,
  descriptionSuggestions,
  lockedFields
}: ItemDetailsFieldsProps) {
  if(isNew && onGenerateMaterialNumber && form.Artikel_Nummer == null)
    onGenerateMaterialNumber();

  const handleStock = useCallback(async (op: StockOperation) => {
    if (!onChangeStock) {
      console.warn('onChangeStock: no callback')
      return;
    }
    const confirmed = window.confirm(`Bestand ${op === 'add' ? 'erhöhen' : 'verringern'}?`);
    if (!confirmed) {
      return;
    }
    try {
      await onChangeStock(op);
    } catch (err) {
      console.error('Stock change handler failed', err);
    }
  }, [onChangeStock]);

  const descriptionLockHidden = isFieldLocked(lockedFields, 'Artikelbeschreibung', 'hidden');
  const descriptionLockReadonly = isFieldLocked(lockedFields, 'Artikelbeschreibung', 'readonly');

  const artikelNummerHidden = isFieldLocked(lockedFields, 'Artikel_Nummer', 'hidden');
  const artikelNummerReadonly = isFieldLocked(lockedFields, 'Artikel_Nummer', 'readonly');

  const quantityHidden = isFieldLocked(lockedFields, 'Auf_Lager', 'hidden');
  const quantityReadonly = isFieldLocked(lockedFields, 'Auf_Lager', 'readonly');

  const categoryLookup = useMemo(() => {
    const map = new Map<number, ItemCategoryDefinition>();
    for (const category of itemCategories) {
      map.set(category.code, category);
    }
    return map;
  }, []);

  const buildHauptOptions = useCallback(
    (currentValue?: number) => {
      const options = itemCategories.map((category) => ({
        value: category.code.toString(),
        label: category.label
      }));

      if (typeof currentValue === 'number' && !categoryLookup.has(currentValue)) {
        options.unshift({
          value: currentValue.toString(),
          label: `Unbekannte Kategorie (${currentValue})`
        });
      }

      return options;
    },
    [categoryLookup]
  );

  const buildUnterOptions = useCallback(
    (parentValue?: number, currentValue?: number) => {
      const options: { value: string; label: string }[] = [];
      let known = false;

      if (typeof parentValue === 'number') {
        const parentCategory = categoryLookup.get(parentValue);
        if (parentCategory) {
          for (const subCategory of parentCategory.subcategories) {
            options.push({
              value: subCategory.code.toString(),
              label: subCategory.label
            });
            if (typeof currentValue === 'number' && subCategory.code === currentValue) {
              known = true;
            }
          }
        }
      }

      if (typeof currentValue === 'number' && !known) {
        options.unshift({
          value: currentValue.toString(),
          label: `Unbekannte Kategorie (${currentValue})`
        });
      }

      return options;
    },
    [categoryLookup]
  );

  const handleHauptkategorieChange = useCallback(
    (
      hauptKey: 'Hauptkategorien_A' | 'Hauptkategorien_B',
      unterKey: 'Unterkategorien_A' | 'Unterkategorien_B'
    ) =>
      (event: React.ChangeEvent<HTMLSelectElement>) => {
        try {
          const { value } = event.target;
          if (!value) {
            onUpdate(hauptKey, undefined as any);
            onUpdate(unterKey, undefined as any);
            return;
          }

          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) {
            console.warn('Received non-numeric Hauptkategorie selection', { field: hauptKey, value });
            onUpdate(hauptKey, undefined as any);
            onUpdate(unterKey, undefined as any);
            return;
          }

          onUpdate(hauptKey, parsed as any);
          onUpdate(unterKey, undefined as any);
        } catch (err) {
          console.error('Failed to handle Hauptkategorie change', { field: hauptKey }, err);
        }
      },
    [onUpdate]
  );

  const handleUnterkategorieChange = useCallback(
    (unterKey: 'Unterkategorien_A' | 'Unterkategorien_B') =>
      (event: React.ChangeEvent<HTMLSelectElement>) => {
        try {
          const { value } = event.target;
          if (!value) {
            onUpdate(unterKey, undefined as any);
            return;
          }

          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) {
            console.warn('Received non-numeric Unterkategorie selection', { field: unterKey, value });
            onUpdate(unterKey, undefined as any);
            return;
          }

          onUpdate(unterKey, parsed as any);
        } catch (err) {
          console.error('Failed to handle Unterkategorie change', { field: unterKey }, err);
        }
      },
    [onUpdate]
  );

  const hauptOptionsA = useMemo(
    () => buildHauptOptions(form.Hauptkategorien_A),
    [buildHauptOptions, form.Hauptkategorien_A]
  );
  const hauptOptionsB = useMemo(
    () => buildHauptOptions(form.Hauptkategorien_B),
    [buildHauptOptions, form.Hauptkategorien_B]
  );

  const unterOptionsA = useMemo(
    () => buildUnterOptions(form.Hauptkategorien_A, form.Unterkategorien_A),
    [buildUnterOptions, form.Hauptkategorien_A, form.Unterkategorien_A]
  );
  const unterOptionsB = useMemo(
    () => buildUnterOptions(form.Hauptkategorien_B, form.Unterkategorien_B),
    [buildUnterOptions, form.Hauptkategorien_B, form.Unterkategorien_B]
  );

  useEffect(() => {
    if (typeof form.Hauptkategorien_A === 'number' && !categoryLookup.has(form.Hauptkategorien_A)) {
      console.warn('Missing Hauptkategorie mapping for Hauptkategorien_A', form.Hauptkategorien_A);
    }
  }, [categoryLookup, form.Hauptkategorien_A]);

  useEffect(() => {
    if (typeof form.Hauptkategorien_B === 'number' && !categoryLookup.has(form.Hauptkategorien_B)) {
      console.warn('Missing Hauptkategorie mapping for Hauptkategorien_B', form.Hauptkategorien_B);
    }
  }, [categoryLookup, form.Hauptkategorien_B]);

  useEffect(() => {
    if (typeof form.Unterkategorien_A === 'number') {
      const haupt = typeof form.Hauptkategorien_A === 'number' ? categoryLookup.get(form.Hauptkategorien_A) : undefined;
      const known = haupt?.subcategories.some((subCategory) => subCategory.code === form.Unterkategorien_A) ?? false;
      if (!known) {
        console.warn('Missing Unterkategorie mapping for Unterkategorien_A', {
          hauptkategorie: form.Hauptkategorien_A,
          unterkategorie: form.Unterkategorien_A
        });
      }
    }
  }, [categoryLookup, form.Hauptkategorien_A, form.Unterkategorien_A]);

  useEffect(() => {
    if (typeof form.Unterkategorien_B === 'number') {
      const haupt = typeof form.Hauptkategorien_B === 'number' ? categoryLookup.get(form.Hauptkategorien_B) : undefined;
      const known = haupt?.subcategories.some((subCategory) => subCategory.code === form.Unterkategorien_B) ?? false;
      if (!known) {
        console.warn('Missing Unterkategorie mapping for Unterkategorien_B', {
          hauptkategorie: form.Hauptkategorien_B,
          unterkategorie: form.Unterkategorien_B
        });
      }
    }
  }, [categoryLookup, form.Hauptkategorien_B, form.Unterkategorien_B]);

  return (
    <>
      <input value={form.BoxID || ''} readOnly hidden />

      {descriptionLockHidden ? (
        <input type="hidden" value={form.Artikelbeschreibung || ''} readOnly />
      ) : (
        <div className="row">
          <label>
            Artikelbeschreibung*
          </label>
          <input
            value={form.Artikelbeschreibung || ''}
            onChange={(e) => onUpdate('Artikelbeschreibung', e.target.value)}
            required
            readOnly={descriptionLockReadonly}
          />
        </div>
      )}

      {!descriptionLockHidden ? descriptionSuggestions : null}

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
              onChange={(e) => onUpdate('Artikel_Nummer', e.target.value)}
              required
              readOnly
            />
          </div>
      </div>

      {(
        <div className="row">
          <label>
            Anzahl*
          </label>
           <div className="combined-input">
              <button type="button" onClick={() => handleStock('remove')}>-</button>
              <input type="number" value={form.Auf_Lager ?? 0} required />
              <button type="button" onClick={() => handleStock('add')}>+</button>
            </div>
        </div>
      )}

      <div className="row">
        <label>
          Kurzbeschreibung
        </label>
        <input
          value={form.Kurzbeschreibung || ''}
          onChange={(e) => onUpdate('Kurzbeschreibung', e.target.value)}
        />
      </div>

      <div className="row">
        <label>
          Langtext
        </label>
        <textarea
          value={form.Langtext || ''}
          onChange={(e) => onUpdate('Langtext', e.target.value)}
          rows={3}
        />
      </div>

      <div className="row">
        <label>
          Hersteller
        </label>
        <input
          value={form.Hersteller || ''}
          onChange={(e) => onUpdate('Hersteller', e.target.value)}
        />
      </div>

      <div className="row">
        <label>
          Länge (mm)
        </label>
        <input
          type="number"
          value={form.Länge_mm ?? 0}
          onChange={(e) => onUpdate('Länge_mm', parseInt(e.target.value, 10) || 0)}
        />
      </div>
      <div className="row">
        <label>
          Breite (mm)
        </label>
        <input
          type="number"
          value={form.Breite_mm ?? 0}
          onChange={(e) => onUpdate('Breite_mm', parseInt(e.target.value, 10) || 0)}
        />
      </div>
      <div className="row">
        <label>
          Höhe (mm)
        </label>
        <input
          type="number"
          value={form.Höhe_mm ?? 0}
          onChange={(e) => onUpdate('Höhe_mm', parseInt(e.target.value, 10) || 0)}
        />
      </div>
      <div className="row">
        <label>
          Gewicht (kg)
        </label>
        <input
          type="number"
          step="0.01"
          value={form.Gewicht_kg ?? 0}
          onChange={(e) => onUpdate('Gewicht_kg', parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="row">
        <label>
          Verkaufspreis (CHF)
        </label>
        <input
          type="number"
          step="0.01"
          value={form.Verkaufspreis ?? 0}
          onChange={(e) => onUpdate('Verkaufspreis', parseFloat(e.target.value) || 0)}
        />
      </div>

      <hr></hr>

      <div className="row">
        <label>
          Hauptkategorien A
        </label>
        <select
          value={typeof form.Hauptkategorien_A === 'number' ? form.Hauptkategorien_A.toString() : ''}
          onChange={handleHauptkategorieChange('Hauptkategorien_A', 'Unterkategorien_A')}
        >
          <option value="">Bitte auswählen</option>
          {hauptOptionsA.map((option) => (
            <option key={`haupt-a-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>
          Unterkategorien A
        </label>
        <select
          value={typeof form.Unterkategorien_A === 'number' ? form.Unterkategorien_A.toString() : ''}
          onChange={handleUnterkategorieChange('Unterkategorien_A')}
          disabled={typeof form.Hauptkategorien_A !== 'number'}
        >
          <option value="">Bitte auswählen</option>
          {unterOptionsA.map((option) => (
            <option key={`unter-a-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>
          Hauptkategorien B
        </label>
        <select
          value={typeof form.Hauptkategorien_B === 'number' ? form.Hauptkategorien_B.toString() : ''}
          onChange={handleHauptkategorieChange('Hauptkategorien_B', 'Unterkategorien_B')}
        >
          <option value="">Bitte auswählen</option>
          {hauptOptionsB.map((option) => (
            <option key={`haupt-b-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>
          Unterkategorien B
        </label>
        <select
          value={typeof form.Unterkategorien_B === 'number' ? form.Unterkategorien_B.toString() : ''}
          onChange={handleUnterkategorieChange('Unterkategorien_B')}
          disabled={typeof form.Hauptkategorien_B !== 'number'}
        >
          <option value="">Bitte auswählen</option>
          {unterOptionsB.map((option) => (
            <option key={`unter-b-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <hr></hr>

      <div className="row">
        <label>
          Einheit
        </label>
        <input
          value={form.Einheit || ''}
          onChange={(e) => onUpdate('Einheit', e.target.value)}
        />
      </div>

      <div className="row">
        <label>
          Kivi-Link
        </label>
        <input
          value={form.WmsLink || ''}
          onChange={(e) => onUpdate('WmsLink', e.target.value)}
        />
      </div>
    </>
  );
}

export function createPhotoChangeHandler(
  onUpdate: <K extends keyof ItemFormData>(key: K, value: ItemFormData[K]) => void,
  field: 'picture1' | 'picture2' | 'picture3'
) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      onUpdate(field, null as any);
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        onUpdate(field, reader.result as string);
      };
      reader.onerror = (event) => {
        console.error('Failed to read photo input', event);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to process photo input', err);
    }
  };
}
