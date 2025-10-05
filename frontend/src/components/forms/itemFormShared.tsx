import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Item, ItemQuant, ItemReference } from '../../../../models';
import { getUser } from '../../lib/user';
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

const REFERENCE_KEYS: (keyof ItemReference)[] = [
  'ItemRefID',
  'Datum_erfasst',
  'Artikel_Nummer',
  'Grafikname',
  'Artikelbeschreibung',
  'Verkaufspreis',
  'Kurzbeschreibung',
  'Langtext',
  'Hersteller',
  'Länge_mm',
  'Breite_mm',
  'Höhe_mm',
  'Gewicht_kg',
  'Hauptkategorien_A',
  'Unterkategorien_A',
  'Hauptkategorien_B',
  'Unterkategorien_B',
  'Veröffentlicht_Status',
  'Shopartikel',
  'Artikeltyp',
  'Einheit',
  'WmsLink'
];

const QUANTITY_KEYS: (keyof ItemQuant)[] = [
  'ItemUUID',
  'ItemRefID',
  'BoxID',
  'Location',
  'StoredLocation',
  'Quantity',
  'CreatedAt',
  'UpdatedAt'
];

function normaliseItemFormData(data: Partial<ItemFormData>): Partial<ItemFormData> {
  const base: Partial<ItemFormData> = { ...data };
  const reference: Partial<ItemReference> = { ...(base.reference ?? {}) };
  const quantity: Partial<ItemQuant> = { ...(base.quantity ?? {}) };

  for (const key of REFERENCE_KEYS) {
    const topValue = (base as Record<string, unknown>)[key];
    if (topValue !== undefined && reference[key] === undefined) {
      reference[key] = key === 'ItemRefID' ? (topValue as number | null) ?? null : (topValue as any);
    } else if (reference[key] !== undefined && topValue === undefined) {
      (base as Record<string, unknown>)[key] = reference[key] as unknown;
    }
  }

  if (typeof base.Artikelbeschreibung !== 'undefined' && reference.Artikelbeschreibung === undefined) {
    reference.Artikelbeschreibung = base.Artikelbeschreibung;
  } else if (reference.Artikelbeschreibung !== undefined && base.Artikelbeschreibung === undefined) {
    base.Artikelbeschreibung = reference.Artikelbeschreibung as string | undefined | null;
  }

  if (typeof base.Artikel_Nummer !== 'undefined' && reference.Artikel_Nummer === undefined) {
    reference.Artikel_Nummer = base.Artikel_Nummer;
  } else if (reference.Artikel_Nummer !== undefined && base.Artikel_Nummer === undefined) {
    base.Artikel_Nummer = reference.Artikel_Nummer as string | undefined | null;
  }

  for (const key of QUANTITY_KEYS) {
    const topValue = (base as Record<string, unknown>)[key];
    if (topValue !== undefined && quantity[key] === undefined) {
      quantity[key] = key === 'ItemRefID'
        ? (topValue as number | null) ?? null
        : (topValue as any);
    } else if (quantity[key] !== undefined && topValue === undefined) {
      (base as Record<string, unknown>)[key] = quantity[key] as unknown;
    }
  }

  if (typeof base.Auf_Lager === 'number' && quantity.Quantity === undefined) {
    quantity.Quantity = base.Auf_Lager;
  } else if (typeof quantity.Quantity === 'number' && base.Auf_Lager === undefined) {
    base.Auf_Lager = quantity.Quantity;
  }

  if (base.BoxID !== undefined && quantity.BoxID === undefined) {
    quantity.BoxID = base.BoxID;
  } else if (quantity.BoxID !== undefined && base.BoxID === undefined) {
    base.BoxID = quantity.BoxID ?? null;
  }

  if (base.ItemUUID && !quantity.ItemUUID) {
    quantity.ItemUUID = base.ItemUUID;
  } else if (!base.ItemUUID && quantity.ItemUUID) {
    base.ItemUUID = quantity.ItemUUID;
  }

  const refIdFromTop =
    typeof base.ItemRefID === 'number'
      ? base.ItemRefID
      : reference.ItemRefID ?? quantity.ItemRefID ?? null;
  reference.ItemRefID = refIdFromTop ?? null;
  quantity.ItemRefID = refIdFromTop ?? null;
  base.ItemRefID = refIdFromTop ?? undefined;

  base.reference = reference;
  base.quantity = quantity;

  return base;
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

export function useItemFormState({ initialItem }: UseItemFormStateOptions) {
  const [form, setInternalForm] = useState<Partial<ItemFormData>>(() => normaliseItemFormData({ ...initialItem }));

  const applyFormUpdate = useCallback(
    (
      next:
        | Partial<ItemFormData>
        | ((prev: Partial<ItemFormData>) => Partial<ItemFormData>)
    ) => {
      if (typeof next === 'function') {
        setInternalForm((prev) => {
          try {
            const computed = (next as (value: Partial<ItemFormData>) => Partial<ItemFormData>)(prev);
            return normaliseItemFormData(computed ?? {});
          } catch (err) {
            console.error('Failed to compute next form state', err);
            return prev;
          }
        });
      } else {
        setInternalForm(normaliseItemFormData(next));
      }
    },
    []
  );

  const update = useCallback(<K extends keyof ItemFormData>(key: K, value: ItemFormData[K]) => {
    setInternalForm((prev) => {
      const next: Partial<ItemFormData> = { ...prev };
      if (key === 'reference' && value && typeof value === 'object') {
        next.reference = { ...(prev.reference ?? {}), ...(value as Partial<ItemReference>) };
      } else if (key === 'quantity' && value && typeof value === 'object') {
        next.quantity = { ...(prev.quantity ?? {}), ...(value as Partial<ItemQuant>) };
      } else {
        (next as Record<string, unknown>)[key as string] = value as unknown;
      }
      return normaliseItemFormData(next);
    });
  }, []);

  const mergeForm = useCallback(
    (next: Partial<ItemFormData>) => {
      applyFormUpdate((prev) => ({ ...prev, ...next }));
    },
    [applyFormUpdate]
  );

  const resetForm = useCallback((next: Partial<ItemFormData>) => {
    applyFormUpdate({ ...next });
  }, [applyFormUpdate]);

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
    const itemUUID = form.quantity?.ItemUUID ?? form.ItemUUID;
    if (!itemUUID) {
      console.warn('Cannot change stock without an ItemUUID');
      return;
    }

    const actor = getUser();
    const primaryUrl = `/api/item-quants/${encodeURIComponent(itemUUID)}/${op === 'add' ? 'increment' : 'decrement'}`;
    const legacyUrl = `/api/items/${encodeURIComponent(itemUUID)}/${op}`;

    const requestInit: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor })
    };

    let response: Response | null = null;
    let payload: any = null;

    try {
      console.log('Changing stock quantity via primary endpoint', { op, itemUUID });
      response = await fetch(primaryUrl, requestInit);
      if (!response.ok && [404, 405, 501].includes(response.status)) {
        console.warn('Primary item quant endpoint unavailable, falling back to legacy endpoint', {
          op,
          itemUUID,
          status: response.status
        });
        response = null;
      }
    } catch (primaryErr) {
      console.error('Primary item quant endpoint failed', primaryErr);
      response = null;
    }

    if (!response) {
      try {
        console.log('Changing stock quantity via legacy endpoint', { op, itemUUID });
        response = await fetch(legacyUrl, requestInit);
      } catch (legacyErr) {
        console.error('Legacy stock endpoint failed', legacyErr);
        return;
      }
    }

    if (!response) {
      console.error('No response received from stock endpoints', { op, itemUUID });
      return;
    }

    if (!response.ok) {
      const errorBody = await response
        .text()
        .catch((err) => {
          console.error('Failed to read stock response body', err);
          return '';
        });
      console.error(`Failed to ${op} stock`, {
        status: response.status,
        body: errorBody
      });
      return;
    }

    try {
      payload = await response.json();
    } catch (parseErr) {
      console.error('Failed to parse stock response', parseErr);
      payload = null;
    }

    const nextQuantity = typeof payload?.quantity === 'number' ? payload.quantity : undefined;
    const nextBoxId =
      payload && Object.prototype.hasOwnProperty.call(payload, 'boxId')
        ? payload.boxId ?? null
        : payload?.item?.BoxID ?? null;

    applyFormUpdate((prev) => {
      const currentQuantity: Partial<ItemQuant> = { ...(prev.quantity ?? {}) };
      if (nextQuantity !== undefined) {
        currentQuantity.Quantity = nextQuantity;
      }
      if (nextBoxId !== undefined) {
        currentQuantity.BoxID = nextBoxId;
      }
      return normaliseItemFormData({
        ...prev,
        Auf_Lager: nextQuantity ?? prev.Auf_Lager,
        BoxID: nextBoxId ?? prev.BoxID ?? null,
        quantity: currentQuantity
      });
    });

    console.log(`Stock ${op === 'add' ? 'increase' : 'decrease'} succeeded`, {
      op,
      itemUUID,
      quantity: nextQuantity,
      boxId: nextBoxId
    });
  }, [applyFormUpdate, form.ItemUUID, form.quantity?.ItemUUID]);

  const setForm = useCallback(applyFormUpdate, [applyFormUpdate]);

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
  const reference = form.reference ?? {};
  const quantity = form.quantity ?? {};

  const artikelbeschreibungValue = readString(reference.Artikelbeschreibung) ?? form.Artikelbeschreibung ?? '';
  const artikelNummerValue = readString(reference.Artikel_Nummer) ?? form.Artikel_Nummer ?? '';
  const kurzbeschreibungValue = readString(reference.Kurzbeschreibung) ?? form.Kurzbeschreibung ?? '';
  const langtextValue = readString(reference.Langtext) ?? form.Langtext ?? '';
  const herstellerValue = readString(reference.Hersteller) ?? form.Hersteller ?? '';
  const einheitValue = readString(reference.Einheit) ?? form.Einheit ?? '';
  const wmsLinkValue = readString(reference.WmsLink) ?? form.WmsLink ?? '';
  const verkaufspreisValue = readNumber(reference.Verkaufspreis) ?? form.Verkaufspreis ?? 0;
  const laengeValue = readNumber(reference.Länge_mm) ?? form.Länge_mm ?? 0;
  const breiteValue = readNumber(reference.Breite_mm) ?? form.Breite_mm ?? 0;
  const hoeheValue = readNumber(reference.Höhe_mm) ?? form.Höhe_mm ?? 0;
  const gewichtValue = readNumber(reference.Gewicht_kg) ?? form.Gewicht_kg ?? 0;
  const hauptAValue = readNumber(reference.Hauptkategorien_A) ?? form.Hauptkategorien_A;
  const unterAValue = readNumber(reference.Unterkategorien_A) ?? form.Unterkategorien_A;
  const hauptBValue = readNumber(reference.Hauptkategorien_B) ?? form.Hauptkategorien_B;
  const unterBValue = readNumber(reference.Unterkategorien_B) ?? form.Unterkategorien_B;
  const quantityValue = typeof quantity.Quantity === 'number' ? quantity.Quantity : form.Auf_Lager ?? 0;
  const boxIdValue =
    typeof quantity.BoxID === 'string'
      ? quantity.BoxID
      : quantity.BoxID === null
      ? ''
      : form.BoxID || '';

  if (isNew && onGenerateMaterialNumber && !(artikelNummerValue || '').toString().trim()) {
    onGenerateMaterialNumber();
  }

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
    () => buildHauptOptions(typeof hauptAValue === 'number' ? hauptAValue : undefined),
    [buildHauptOptions, hauptAValue]
  );
  const hauptOptionsB = useMemo(
    () => buildHauptOptions(typeof hauptBValue === 'number' ? hauptBValue : undefined),
    [buildHauptOptions, hauptBValue]
  );

  const unterOptionsA = useMemo(
    () =>
      buildUnterOptions(
        typeof hauptAValue === 'number' ? hauptAValue : undefined,
        typeof unterAValue === 'number' ? unterAValue : undefined
      ),
    [buildUnterOptions, hauptAValue, unterAValue]
  );
  const unterOptionsB = useMemo(
    () =>
      buildUnterOptions(
        typeof hauptBValue === 'number' ? hauptBValue : undefined,
        typeof unterBValue === 'number' ? unterBValue : undefined
      ),
    [buildUnterOptions, hauptBValue, unterBValue]
  );

  useEffect(() => {
    if (typeof hauptAValue === 'number' && !categoryLookup.has(hauptAValue)) {
      console.warn('Missing Hauptkategorie mapping for Hauptkategorien_A', hauptAValue);
    }
  }, [categoryLookup, hauptAValue]);

  useEffect(() => {
    if (typeof hauptBValue === 'number' && !categoryLookup.has(hauptBValue)) {
      console.warn('Missing Hauptkategorie mapping for Hauptkategorien_B', hauptBValue);
    }
  }, [categoryLookup, hauptBValue]);

  useEffect(() => {
    if (typeof unterAValue === 'number') {
      const haupt = typeof hauptAValue === 'number' ? categoryLookup.get(hauptAValue) : undefined;
      const known = haupt?.subcategories.some((subCategory) => subCategory.code === unterAValue) ?? false;
      if (!known) {
        console.warn('Missing Unterkategorie mapping for Unterkategorien_A', {
          hauptkategorie: hauptAValue,
          unterkategorie: unterAValue
        });
      }
    }
  }, [categoryLookup, hauptAValue, unterAValue]);

  useEffect(() => {
    if (typeof unterBValue === 'number') {
      const haupt = typeof hauptBValue === 'number' ? categoryLookup.get(hauptBValue) : undefined;
      const known = haupt?.subcategories.some((subCategory) => subCategory.code === unterBValue) ?? false;
      if (!known) {
        console.warn('Missing Unterkategorie mapping for Unterkategorien_B', {
          hauptkategorie: hauptBValue,
          unterkategorie: unterBValue
        });
      }
    }
  }, [categoryLookup, hauptBValue, unterBValue]);

  return (
    <>
      <input value={boxIdValue} readOnly hidden />

      {descriptionLockHidden ? (
        <input type="hidden" value={artikelbeschreibungValue} readOnly />
      ) : (
        <div className="row">
          <label>
            Artikelbeschreibung*
          </label>
          <input
            value={artikelbeschreibungValue}
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
              value={artikelNummerValue}
              onChange={(e) => onUpdate('Artikel_Nummer', e.target.value)}
              required
              readOnly={artikelNummerReadonly}
            />
          </div>
      </div>

      {quantityHidden ? (
        <input type="hidden" value={quantityValue} readOnly />
      ) : (
        <div className="row">
          <label>
            Anzahl*
          </label>
           <div className="combined-input">
              <button type="button" onClick={() => handleStock('remove')} disabled={quantityReadonly}>-</button>
              <input type="number" value={quantityValue} required readOnly={quantityReadonly} />
              <button type="button" onClick={() => handleStock('add')} disabled={quantityReadonly}>+</button>
            </div>
        </div>
      )}

      <div className="row">
        <label>
          Kurzbeschreibung
        </label>
        <input
          value={kurzbeschreibungValue}
          onChange={(e) => onUpdate('Kurzbeschreibung', e.target.value)}
        />
      </div>

      <div className="row">
        <label>
          Langtext
        </label>
        <textarea
          value={langtextValue}
          onChange={(e) => onUpdate('Langtext', e.target.value)}
          rows={3}
        />
      </div>

      <div className="row">
        <label>
          Hersteller
        </label>
        <input
          value={herstellerValue}
          onChange={(e) => onUpdate('Hersteller', e.target.value)}
        />
      </div>

      <div className="row">
        <label>
          Länge (mm)
        </label>
        <input
          type="number"
          value={laengeValue}
          onChange={(e) => onUpdate('Länge_mm', parseInt(e.target.value, 10) || 0)}
        />
      </div>
      <div className="row">
        <label>
          Breite (mm)
        </label>
        <input
          type="number"
          value={breiteValue}
          onChange={(e) => onUpdate('Breite_mm', parseInt(e.target.value, 10) || 0)}
        />
      </div>
      <div className="row">
        <label>
          Höhe (mm)
        </label>
        <input
          type="number"
          value={hoeheValue}
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
          value={gewichtValue}
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
          value={verkaufspreisValue}
          onChange={(e) => onUpdate('Verkaufspreis', parseFloat(e.target.value) || 0)}
        />
      </div>

      <hr></hr>

      <div className="row">
        <label>
          Hauptkategorien A
        </label>
        <select
          value={typeof hauptAValue === 'number' ? hauptAValue.toString() : ''}
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
          value={typeof unterAValue === 'number' ? unterAValue.toString() : ''}
          onChange={handleUnterkategorieChange('Unterkategorien_A')}
          disabled={typeof hauptAValue !== 'number'}
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
          value={typeof hauptBValue === 'number' ? hauptBValue.toString() : ''}
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
          value={typeof unterBValue === 'number' ? unterBValue.toString() : ''}
          onChange={handleUnterkategorieChange('Unterkategorien_B')}
          disabled={typeof hauptBValue !== 'number'}
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
          value={einheitValue}
          onChange={(e) => onUpdate('Einheit', e.target.value)}
        />
      </div>

      <div className="row">
        <label>
          Kivi-Link
        </label>
        <input
          value={wmsLinkValue}
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
