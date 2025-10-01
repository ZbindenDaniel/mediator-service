import React, { useCallback, useMemo, useState } from 'react';
import type { Item } from '../../../../models';
import { getUser } from '../../lib/user';
import { findCategoryByValue, itemCategories } from '../../data/itemCategories';

export interface ItemFormData extends Item {
  picture1?: string | null;
  picture2?: string | null;
  picture3?: string | null;
  agenticStatus?: 'queued' | 'running';
  agenticSearch?: string;
}

export type StockOperation = 'add' | 'remove';

interface UseItemFormStateOptions {
  initialItem: Partial<ItemFormData>;
}

function createInitialFormState(initialItem: Partial<ItemFormData>) {
  const seed: Partial<ItemFormData> = { ...initialItem };
  if (typeof seed.Auf_Lager !== 'number' || Number.isNaN(seed.Auf_Lager)) {
    console.log('Seeding default stock quantity to 1 for item form');
    seed.Auf_Lager = 1;
  }
  return seed;
}

export function useItemFormState({ initialItem }: UseItemFormStateOptions) {
  const [form, setForm] = useState<Partial<ItemFormData>>(() => createInitialFormState(initialItem));

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
    try {
      console.log('Changing stock quantity', { op, itemUUID: form.ItemUUID });
      const res = await fetch(`/api/items/${encodeURIComponent(form.ItemUUID)}/${op}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: getUser() })
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
}

export function ItemDetailsFields({ form, isNew, onUpdate, onGenerateMaterialNumber, onChangeStock, descriptionSuggestions }: ItemDetailsFieldsProps) {
  const handleStock = useCallback(async (op: StockOperation) => {
    if (!onChangeStock) {
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

  const selectedCategoryA = useMemo(() => findCategoryByValue(form.Hauptkategorien_A ?? undefined), [form.Hauptkategorien_A]);
  const selectedCategoryB = useMemo(() => findCategoryByValue(form.Hauptkategorien_B ?? undefined), [form.Hauptkategorien_B]);

  const subcategoriesA = selectedCategoryA?.subcategories ?? [];
  const subcategoriesB = selectedCategoryB?.subcategories ?? [];

  const hasKnownSubcategoryA = useMemo(
    () => subcategoriesA.some((subcategory) => subcategory.value === form.Unterkategorien_A),
    [subcategoriesA, form.Unterkategorien_A]
  );
  const hasKnownSubcategoryB = useMemo(
    () => subcategoriesB.some((subcategory) => subcategory.value === form.Unterkategorien_B),
    [subcategoriesB, form.Unterkategorien_B]
  );

  const resolveCategoryValue = useCallback((value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return parsed;
  }, []);

  return (
    <>
      <input value={form.BoxID || ''} readOnly hidden />

      <div className="row">
        <label>
          Artikelbeschreibung*
        </label>
        <input
          value={form.Artikelbeschreibung || ''}
          onChange={(e) => onUpdate('Artikelbeschreibung', e.target.value)}
          required
        />
      </div>

      {descriptionSuggestions}

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
          />
          {isNew && onGenerateMaterialNumber && (
            <button type="button" onClick={onGenerateMaterialNumber}>
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
            onChange={(e) => onUpdate('Auf_Lager', parseInt(e.target.value, 10) || 0)}
            required
          />
        ) : onChangeStock ? (
          <div className="combined-input">
            <button type="button" onClick={() => handleStock('remove')}>-</button>
            <input type="number" value={form.Auf_Lager ?? 0} readOnly required />
            <button type="button" onClick={() => handleStock('add')}>+</button>
          </div>
        ) : (
          <input type="number" value={form.Auf_Lager ?? 0} readOnly required />
        )}
      </div>

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
          value={form.Hauptkategorien_A?.toString() || ''}
          onChange={(e) => {
            const nextValue = resolveCategoryValue(e.target.value);
            onUpdate('Hauptkategorien_A', nextValue as ItemFormData['Hauptkategorien_A']);
            const category = findCategoryByValue(nextValue);
            if (!category || !category.subcategories.some((subcategory) => subcategory.value === form.Unterkategorien_A)) {
              onUpdate('Unterkategorien_A', undefined as ItemFormData['Unterkategorien_A']);
            }
          }}
        >
          <option value="">Bitte wählen…</option>
          {!selectedCategoryA && typeof form.Hauptkategorien_A === 'number' && (
            <option value={form.Hauptkategorien_A}>
              Unbekannt ({form.Hauptkategorien_A})
            </option>
          )}
          {itemCategories.map((category) => (
            <option key={`haupt-a-${category.value}`} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>
          Unterkategorien A
        </label>
        <select
          value={form.Unterkategorien_A?.toString() || ''}
          onChange={(e) => {
            const nextValue = resolveCategoryValue(e.target.value);
            onUpdate('Unterkategorien_A', nextValue as ItemFormData['Unterkategorien_A']);
          }}
          disabled={!selectedCategoryA}
        >
          <option value="">Bitte wählen…</option>
          {!hasKnownSubcategoryA && typeof form.Unterkategorien_A === 'number' && (
            <option value={form.Unterkategorien_A}>
              Unbekannt ({form.Unterkategorien_A})
            </option>
          )}
          {subcategoriesA.map((subcategory) => (
            <option key={`unter-a-${subcategory.value}`} value={subcategory.value}>
              {subcategory.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>
          Hauptkategorien B
        </label>
        <select
          value={form.Hauptkategorien_B?.toString() || ''}
          onChange={(e) => {
            const nextValue = resolveCategoryValue(e.target.value);
            onUpdate('Hauptkategorien_B', nextValue as ItemFormData['Hauptkategorien_B']);
            const category = findCategoryByValue(nextValue);
            if (!category || !category.subcategories.some((subcategory) => subcategory.value === form.Unterkategorien_B)) {
              onUpdate('Unterkategorien_B', undefined as ItemFormData['Unterkategorien_B']);
            }
          }}
        >
          <option value="">Bitte wählen…</option>
          {!selectedCategoryB && typeof form.Hauptkategorien_B === 'number' && (
            <option value={form.Hauptkategorien_B}>
              Unbekannt ({form.Hauptkategorien_B})
            </option>
          )}
          {itemCategories.map((category) => (
            <option key={`haupt-b-${category.value}`} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>
          Unterkategorien B
        </label>
        <select
          value={form.Unterkategorien_B?.toString() || ''}
          onChange={(e) => {
            const nextValue = resolveCategoryValue(e.target.value);
            onUpdate('Unterkategorien_B', nextValue as ItemFormData['Unterkategorien_B']);
          }}
          disabled={!selectedCategoryB}
        >
          <option value="">Bitte wählen…</option>
          {!hasKnownSubcategoryB && typeof form.Unterkategorien_B === 'number' && (
            <option value={form.Unterkategorien_B}>
              Unbekannt ({form.Unterkategorien_B})
            </option>
          )}
          {subcategoriesB.map((subcategory) => (
            <option key={`unter-b-${subcategory.value}`} value={subcategory.value}>
              {subcategory.label}
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
