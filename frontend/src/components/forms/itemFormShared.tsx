import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AgenticRunStatus, Item, ItemRef, ItemReferenceEdit } from '../../../../models';
import { ItemEinheit, ITEM_EINHEIT_VALUES, isItemEinheit } from '../../../../models';
import { describeQuality, normalizeQuality, QUALITY_MIN } from '../../../../models/quality';
import { ensureUser, getUser } from '../../lib/user';
import { itemCategories } from '../../data/itemCategories';
import { buildItemCategoryLookups } from '../../lib/categoryLookup';
import type { ConfirmDialogOptions } from '../dialog';
import { dialogService } from '../dialog';
import { parseLangtext, stringifyLangtextEntries } from '../../lib/langtext';
import { metaDataKeys } from '../../data/metaDataKeys';

// TODO(edit-quality-stock): Confirm whether Quality/Auf_Lager should stay hidden on edits once access roles are defined.
// TODO(reference-only-edit): Keep reference-only form mode aligned with ItemReferenceEdit fields.
// TODO(einheit-immutability): Keep Einheit locked on edit forms while backend enforces immutability.
// TODO(reference-flag-controls): Keep Shopartikel/Veröffentlicht_Status controls restricted to binary 0/1 semantics.
// TODO(binary-switch-a11y): Revisit switch labels if we add translated aria-live status hints.
// TODO(optional-dimension-inputs): Keep dimension/weight inputs nullable so blank form values stay omitted in payloads.

const PHOTO_FIELD_KEYS = ['picture1', 'picture2', 'picture3'] as const;
export type PhotoFieldKey = (typeof PHOTO_FIELD_KEYS)[number];
export const PHOTO_INPUT_FIELDS: readonly PhotoFieldKey[] = PHOTO_FIELD_KEYS;

type PhotoSeedCandidate = string | null | undefined;

function normalisePhotoSeedValue(candidate: unknown): string | null {
  if (typeof candidate !== 'string') {
    return null;
  }
  const trimmed = candidate.trim();
  return trimmed ? trimmed : null;
}

function normalisePhotoSeedList(seeds?: readonly PhotoSeedCandidate[]): (string | null)[] {
  return PHOTO_FIELD_KEYS.map((_, index) => normalisePhotoSeedValue(seeds?.[index]));
}

function normalizeQualityForForm(value: unknown, context: string): number | null {
  try {
    return normalizeQuality(value, console);
  } catch (error) {
    console.error('[itemForm] Failed to normalize quality value', { context, error });
    return null;
  }
}

export function captureMediaStreamFrame(video: HTMLVideoElement): string | null {
  try {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      console.warn('Unable to capture media stream frame: video metadata unavailable', { width, height });
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Unable to capture media stream frame: missing 2D context');
      return null;
    }
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to capture media stream frame', error);
    return null;
  }
}

export interface ItemFormData extends Item {
  picture1?: string | null;
  picture2?: string | null;
  picture3?: string | null;
  agenticStatus?: AgenticRunStatus;
  agenticSearch?: string;
  agenticManualFallback?: boolean;
}

export type ItemReferenceFormData = Partial<ItemReferenceEdit> & {
  picture1?: string | null;
  picture2?: string | null;
  picture3?: string | null;
};

export type ItemFormMode = 'full' | 'reference';
export type ItemFormPayload = ItemFormData & ItemReferenceFormData;
export type ItemFormFieldKey = keyof ItemFormPayload;

export const ITEM_FORM_DEFAULT_EINHEIT: ItemEinheit = ItemEinheit.Stk;

function resolveFormEinheit(value: unknown, context: string): ItemEinheit {
  try {
    if (isItemEinheit(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (isItemEinheit(trimmed)) {
        return trimmed;
      }
      if (trimmed.length > 0) {
        console.warn('[itemForm] Invalid Einheit encountered, falling back to default', {
          context,
          provided: trimmed
        });
      }
    }
  } catch (error) {
    console.error('[itemForm] Failed to resolve Einheit value, using default', {
      context,
      error
    });
  }
  return ITEM_FORM_DEFAULT_EINHEIT;
}

// TODO(langtext-json): Extend the inline editor with hinting for curated metaDataKeys ordering once the backend exposes rank metadata.
const referenceFieldKeys: (keyof ItemReferenceEdit)[] = [
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
  'EntityType'
];

export function extractReferenceFields(
  source: Partial<Item> | Partial<ItemRef> | Partial<ItemReferenceEdit>
): Partial<ItemReferenceEdit> {
  const reference: Partial<ItemReferenceEdit> = {};
  for (const key of referenceFieldKeys) {
    if (key in source) {
      // Deliberately copy undefined to allow clearing inherited values
      (reference as Record<string, unknown>)[key] = (source as Record<string, unknown>)[key];
    }
  }
  return reference;
}

export type LockedFieldMode = 'readonly' | 'hidden';
export type LockedFieldConfig = Partial<Record<ItemFormFieldKey, LockedFieldMode>>;

export type StockOperation = 'add' | 'remove';

export function buildStockConfirmOptions(op: StockOperation): ConfirmDialogOptions {
  return {
    title: 'Bestandsänderung bestätigen',
    message: `Bestand ${op === 'add' ? 'erhöhen' : 'verringern'}?`,
    confirmLabel: op === 'add' ? 'Erhöhen' : 'Verringern',
    cancelLabel: 'Abbrechen'
  };
}

interface UseItemFormStateOptions {
  initialItem: Partial<ItemFormPayload>;
  initialPhotos?: readonly PhotoSeedCandidate[];
  formMode?: ItemFormMode;
}

export function useItemFormState({ initialItem, initialPhotos, formMode = 'full' }: UseItemFormStateOptions) {
  const normalizedInitialItem = formMode === 'reference' ? extractReferenceFields(initialItem) : initialItem;
  const initialPhotoSeedsRef = useRef<(string | null)[]>(normalisePhotoSeedList(initialPhotos));
  const seededPhotosRef = useRef<(string | null)[]>(initialPhotoSeedsRef.current);
  const [seededPhotos, setSeededPhotos] = useState<(string | null)[]>(initialPhotoSeedsRef.current);
  const [form, setForm] = useState<Partial<ItemFormPayload>>(() => {
    const initialEinheit = normalizedInitialItem
      ? resolveFormEinheit(normalizedInitialItem.Einheit, 'initialState')
      : ITEM_FORM_DEFAULT_EINHEIT;
    const shouldIncludeQuality = formMode === 'full';
    const initialQuality = shouldIncludeQuality
      ? normalizeQualityForForm((normalizedInitialItem as Partial<ItemFormData>)?.Quality, 'initialState')
      : undefined;
    const draft: Partial<ItemFormPayload> = {
      ...normalizedInitialItem,
      Einheit: initialEinheit,
      ...(shouldIncludeQuality ? { Quality: initialQuality } : {})
    };
    const draftRecord = draft as Record<PhotoFieldKey, string | null | undefined>;
    initialPhotoSeedsRef.current.forEach((seed, index) => {
      if (!seed) {
        return;
      }
      const key = PHOTO_FIELD_KEYS[index];
      if (draftRecord[key] == null) {
        draftRecord[key] = seed;
      }
    });
    return draft;
  });
  const update = useCallback((key: ItemFormFieldKey, value: ItemFormPayload[ItemFormFieldKey]) => {
    const shouldNormalizeQuality = formMode === 'full' && key === 'Quality';
    const normalizedValue = shouldNormalizeQuality
      ? (normalizeQualityForForm(value, 'update') as ItemFormPayload[ItemFormFieldKey])
      : value;
    setForm((prev) => ({ ...prev, [key]: normalizedValue }));
  }, [formMode]);

  const mergeForm = useCallback((next: Partial<ItemFormPayload>) => {
    const safeNext = formMode === 'reference' ? extractReferenceFields(next) : next;
    setForm((prev) => {
      const requestedEinheit = safeNext.Einheit ?? prev.Einheit ?? ITEM_FORM_DEFAULT_EINHEIT;
      const normalizedEinheit = resolveFormEinheit(requestedEinheit, 'mergeForm');
      return {
        ...prev,
        ...safeNext,
        Einheit: normalizedEinheit,
        ...(formMode === 'full'
          ? {
              Quality: normalizeQualityForForm(
                (safeNext as Partial<ItemFormData>).Quality ?? (prev as Partial<ItemFormData>).Quality ?? null,
                'mergeForm'
              )
            }
          : {})
      };
    });
  }, [formMode]);

  const resetForm = useCallback((next: Partial<ItemFormPayload>) => {
    const safeNext = formMode === 'reference' ? extractReferenceFields(next) : next;
    setForm({
      ...safeNext,
      Einheit: resolveFormEinheit(safeNext.Einheit, 'resetForm'),
      ...(formMode === 'full'
        ? {
            Quality: normalizeQualityForForm(
              (safeNext as Partial<ItemFormData>).Quality ?? null,
              'resetForm'
            )
          }
        : {})
    });
  }, [formMode]);

  const generateMaterialNumber = useCallback(async (): Promise<string | undefined> => {
    try {
      console.log('Requesting new material number for item form');
      const res = await fetch('/api/getNewMaterialNumber');
      if (!res.ok) {
        console.error('Failed to get material number', res.status);
        return undefined;
      }
      const j = await res.json();
      const nextNumber = j?.nextArtikelNummer;
      if (typeof nextNumber !== 'string' || !nextNumber.trim()) {
        console.error('Received invalid material number payload', j);
        return undefined;
      }
      update('Artikel_Nummer', nextNumber);
      return nextNumber;
    } catch (err) {
      console.error('Failed to get material number', err);
      return undefined;
    }
  }, [update]);

  const changeStock = useCallback(async (op: StockOperation) => {
    if (formMode === 'reference') {
      console.warn('Stock change requested in reference-only form mode; ignoring.', { op });
      return;
    }
    if (!form.ItemUUID) {
      try {
        setForm((prev) => {
          const previousQuantity = (prev as Partial<ItemFormData>).Auf_Lager ?? 0;
          const nextQuantity = op === 'add' ? previousQuantity + 1 : Math.max(0, previousQuantity - 1);
          console.log('Adjusting local stock quantity for unsaved item', {
            operation: op,
            previousQuantity,
            nextQuantity
          });
          return { ...prev, Auf_Lager: nextQuantity } as Partial<ItemFormPayload>;
        });
      } catch (error) {
        console.error('Failed to adjust local stock quantity for unsaved item', error);
      }
      return;
    }
    const actor = await ensureUser();
    if (!actor) {
      console.info('Stock change aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for stock change', error);
      }
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
        const next = { ...prev, Auf_Lager: j.quantity } as Partial<ItemFormPayload>;
        if (op === 'remove' && j.boxId === null) {
          next.BoxID = null as any;
        }
        return next;
      });
      console.log(`Stock ${op === 'add' ? 'increase' : 'decrease'} succeeded`, j);
    } catch (err) {
      console.error(`Failed to ${op} stock`, err);
    }
  }, [form.ItemUUID, formMode, setForm]);

  const seedPhotos = useCallback(
    (photos?: readonly PhotoSeedCandidate[]) => {
      try {
        const normalized = normalisePhotoSeedList(photos);
        const previousSeeds = seededPhotosRef.current;
        const seedsChanged = normalized.some((value, index) => value !== previousSeeds[index]);
        let formChanged = false;
        setForm((prev) => {
          const nextDraft: Partial<ItemFormPayload> = { ...prev };
          const draftRecord = nextDraft as Record<PhotoFieldKey, string | null | undefined>;
          let changed = false;
          PHOTO_FIELD_KEYS.forEach((key, index) => {
            const incoming = normalized[index];
            const priorSeed = previousSeeds[index];
            const currentValue = draftRecord[key];
            const shouldReplace = currentValue == null || currentValue === priorSeed;
            if (incoming) {
              if (shouldReplace && currentValue !== incoming) {
                draftRecord[key] = incoming;
                changed = true;
              }
            } else if (shouldReplace && currentValue != null) {
              draftRecord[key] = null;
              changed = true;
            }
          });
          if (!changed) {
            return prev;
          }
          formChanged = true;
          return nextDraft;
        });
        if (seedsChanged) {
          seededPhotosRef.current = normalized;
          setSeededPhotos(normalized);
        }
        if (formChanged) {
          console.log('Seeded initial photos into item form state', {
            seededCount: normalized.filter(Boolean).length
          });
        }
      } catch (error) {
        console.error('Failed to seed initial photos into item form state', error);
      }
    },
    [setForm]
  );

  const clearPhoto = useCallback(
    (field: PhotoFieldKey) => {
      try {
        let removedFromForm = false;
        setForm((prev) => {
          const currentValue = prev[field];
          if (currentValue == null) {
            return prev;
          }
          removedFromForm = true;
          const next = { ...prev, [field]: null };
          console.log('Cleared photo from item form state', { field });
          return next;
        });
        setSeededPhotos((prev) => {
          const index = PHOTO_FIELD_KEYS.indexOf(field);
          if (index === -1) {
            return prev;
          }
          const previousSeed = prev[index];
          if (previousSeed == null) {
            return prev;
          }
          const next = [...prev];
          next[index] = null;
          seededPhotosRef.current = next;
          if (!removedFromForm) {
            console.log('Removed seeded photo reference without local form value', { field });
          }
          return next;
        });
      } catch (error) {
        console.error('Failed to clear photo from item form state', { field, error });
      }
    },
    [setForm, setSeededPhotos]
  );

  useEffect(() => {
    seedPhotos(initialPhotos);
  }, [initialPhotos, seedPhotos]);

  return {
    form,
    update,
    mergeForm,
    resetForm,
    setForm,
    generateMaterialNumber,
    changeStock,
    seedPhotos,
    seededPhotos,
    clearPhoto
  } as const;
}

interface ItemDetailsFieldsProps {
  form: Partial<ItemFormPayload>;
  isNew?: boolean;
  onUpdate: (key: ItemFormFieldKey, value: ItemFormPayload[ItemFormFieldKey]) => void;
  onGenerateMaterialNumber?: () => void | Promise<void | string>;
  onChangeStock?: (op: StockOperation) => void | Promise<void>;
  lockedFields?: LockedFieldConfig;
  langtextEditorTestHarness?: (helpers: { add: (key?: string) => void; remove: (key: string) => void }) => void;
  formMode?: ItemFormMode;
}

function isFieldLocked(lockedFields: LockedFieldConfig | undefined, field: ItemFormFieldKey, mode: LockedFieldMode) {
  return lockedFields?.[field] === mode;
}

export function ItemDetailsFields({
  form,
  isNew,
  onUpdate,
  onGenerateMaterialNumber,
  onChangeStock,
  lockedFields,
  langtextEditorTestHarness,
  formMode = 'full'
}: ItemDetailsFieldsProps) {
  const isReferenceMode = formMode === 'reference';
  if (isNew && onGenerateMaterialNumber && form.Artikel_Nummer == null) {
    try {
      const maybePromise = onGenerateMaterialNumber();
      if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === 'function') {
        (maybePromise as Promise<unknown>).catch((error) => {
          console.error('Failed to auto-generate material number during render', error);
        });
      }
    } catch (error) {
      console.error('Failed to trigger auto material number generation', error);
    }
  }

  const handleStock = useCallback(async (op: StockOperation) => {
    if (isReferenceMode) {
      console.warn('Stock change ignored in reference-only mode', { operation: op });
      return;
    }
    if (!onChangeStock) {
      console.warn('onChangeStock: no callback');
      return;
    }
    let confirmed = true;
    const requiresConfirmation = Boolean(form.ItemUUID);
    if (requiresConfirmation) {
      confirmed = false;
      try {
        confirmed = await dialogService.confirm(buildStockConfirmOptions(op));
      } catch (error) {
        console.error('Failed to confirm stock change', error);
        return;
      }
      if (!confirmed) {
        console.log('Stock change cancelled', { operation: op });
        return;
      }
    } else {
      console.log('Skipping stock change confirmation for unsaved item', { operation: op });
    }
    try {
      await onChangeStock(op);
    } catch (err) {
      console.error('Stock change handler failed', err);
    }
  }, [form.ItemUUID, isReferenceMode, onChangeStock]);

  const descriptionLockHidden = isFieldLocked(lockedFields, 'Artikelbeschreibung', 'hidden');
  const descriptionLockReadonly = isFieldLocked(lockedFields, 'Artikelbeschreibung', 'readonly');

  const artikelNummerHidden = isFieldLocked(lockedFields, 'Artikel_Nummer', 'hidden');
  const artikelNummerReadonly = isFieldLocked(lockedFields, 'Artikel_Nummer', 'readonly');

  const quantityHidden = isReferenceMode || isFieldLocked(lockedFields, 'Auf_Lager', 'hidden');
  const quantityReadonly = isFieldLocked(lockedFields, 'Auf_Lager', 'readonly');

  const qualityHidden = isReferenceMode || isNew || isFieldLocked(lockedFields, 'Quality', 'hidden');
  const qualityReadonly = isFieldLocked(lockedFields, 'Quality', 'readonly');

  const placementHidden = isReferenceMode || isFieldLocked(lockedFields, 'BoxID', 'hidden');
  const placementReadonly = isFieldLocked(lockedFields, 'BoxID', 'readonly');

  const einheitHidden = isFieldLocked(lockedFields, 'Einheit', 'hidden');
  const einheitReadonly = isFieldLocked(lockedFields, 'Einheit', 'readonly');
  const publishedStatusSwitchValue = useMemo(() => {
    try {
      const raw = form.Veröffentlicht_Status;
      if (typeof raw === 'number') {
        return raw > 0 ? 1 : 0;
      }
      if (typeof raw === 'boolean') {
        return raw ? 1 : 0;
      }
      if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        return ['yes', 'ja', 'true', '1', 'published'].includes(normalized) ? 1 : 0;
      }
    } catch (error) {
      console.error('[itemForm] Failed to resolve Veröffentlicht_Status switch value', error);
    }
    return 0;
  }, [form.Veröffentlicht_Status]);
  const shopartikelSwitchValue = useMemo(() => {
    try {
      const raw = form.Shopartikel as unknown;
      if (typeof raw === 'number') {
        return raw > 0 ? 1 : 0;
      }
      if (typeof raw === 'boolean') {
        return raw ? 1 : 0;
      }
      if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        return ['1', 'true', 'yes', 'ja'].includes(normalized) ? 1 : 0;
      }
    } catch (error) {
      console.error('[itemForm] Failed to resolve Shopartikel switch value', error);
    }
    return 0;
  }, [form.Shopartikel]);

  // TODO(langtext-observability): Revisit Langtext rendering once parser mode stabilizes across
  // sanitized payloads and legacy fallbacks.
  const parsedLangtext = useMemo(() => parseLangtext(form.Langtext ?? ''), [form.Langtext]);
  const [langtextFocusKey, setLangtextFocusKey] = useState<string | null>(null);
  const langtextValueRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const langtextFieldIdPrefix = useId();
  const qualitySummary = useMemo(
    () => describeQuality((form as Partial<ItemFormData>).Quality ?? null),
    [form.Quality]
  );

  // TODO(langtext-type-guards): Consider splitting JSON and text Langtext editors into
  // dedicated components so union handling is localised and type-safe.
  useEffect(() => {
    if (parsedLangtext.mode !== 'json') {
      langtextValueRefs.current = {};
      return;
    }

    const activeKeys = new Set(parsedLangtext.entries.map((entry) => entry.key));
    for (const key of Object.keys(langtextValueRefs.current)) {
      if (!activeKeys.has(key)) {
        delete langtextValueRefs.current[key];
      }
    }
  }, [parsedLangtext]);

  useEffect(() => {
    if (!langtextFocusKey) {
      return;
    }

    if (parsedLangtext.mode !== 'json') {
      console.warn('Langtext focus request ignored because payload is not JSON-backed', {
        key: langtextFocusKey
      });
      setLangtextFocusKey(null);
      return;
    }

    const target = langtextValueRefs.current[langtextFocusKey];
    if (target) {
      try {
        target.focus();
      } catch (error) {
        console.error('Failed to focus Langtext value field', { key: langtextFocusKey, error });
      }
    } else {
      console.warn('Langtext value focus target missing', { key: langtextFocusKey });
    }

    setLangtextFocusKey(null);
  }, [langtextFocusKey, parsedLangtext]);

  const [pendingLangtextKey, setPendingLangtextKey] = useState<string>('');

  const normaliseKeyLength = useCallback((candidate: string, context: string): string => {
    const trimmed = candidate.trim();
    if (trimmed.length <= 25) {
      return trimmed;
    }

    const truncated = trimmed.slice(0, 25);
    console.warn('Langtext key exceeds 25 characters, truncating value', {
      context,
      originalLength: trimmed.length,
      truncated
    });
    return truncated;
  }, []);

  const handleLangtextJsonChange = useCallback(
    (currentKey: string, next: { key?: string; value?: string }) => {
      if (parsedLangtext.mode !== 'json') {
        console.warn('Langtext JSON editor active without JSON payload, falling back to text update', {
          key: currentKey
        });
        const fallbackValue = next.value ?? '';
        onUpdate('Langtext', fallbackValue as ItemFormPayload['Langtext']);
        return;
      }

      try {
        const currentEntry = parsedLangtext.entries.find((entry) => entry.key === currentKey);
        if (!currentEntry) {
          console.warn('Attempted to update unknown Langtext key', { key: currentKey });
          return;
        }

        const requestedKey = normaliseKeyLength(next.key ?? currentEntry.key, 'update');
        if (!requestedKey) {
          console.warn('Langtext key cannot be empty, aborting update', { key: currentKey });
          return;
        }

        if (
          requestedKey !== currentKey &&
          parsedLangtext.entries.some((entry) => entry.key === requestedKey)
        ) {
          console.warn('Langtext key already present, skipping reassignment', {
            currentKey,
            requestedKey
          });
          return;
        }

        const nextEntries = parsedLangtext.entries.map((entry) => {
          if (entry.key !== currentKey) {
            return entry;
          }
          return {
            key: requestedKey,
            value: next.value ?? currentEntry.value
          };
        });

        const nextPayload = stringifyLangtextEntries(nextEntries);
        onUpdate('Langtext', nextPayload as ItemFormPayload['Langtext']);
      } catch (error) {
        console.error('Failed to update Langtext entry', { key: currentKey, error });
      }
    },
    [normaliseKeyLength, onUpdate, parsedLangtext]
  );

  const handleLangtextJsonAdd = useCallback(
    (explicitKey?: string) => {
      if (parsedLangtext.mode !== 'json') {
        console.warn('Langtext JSON editor inactive, cannot append key-value pair');
        return;
      }

      try {
        const rawKey = explicitKey ?? pendingLangtextKey;
        const normalisedKey = normaliseKeyLength(rawKey, 'add');
        if (!normalisedKey) {
          console.warn('Langtext key cannot be empty, skipping addition');
          return;
        }

        if (parsedLangtext.entries.some((entry) => entry.key === normalisedKey)) {
          console.warn('Langtext key already present, skipping add', { key: normalisedKey });
          return;
        }

        const nextEntries = [...parsedLangtext.entries, { key: normalisedKey, value: '' }];
        const nextPayload = stringifyLangtextEntries(nextEntries);
        onUpdate('Langtext', nextPayload as ItemFormPayload['Langtext']);

        if (!explicitKey) {
          setPendingLangtextKey('');
        }
        setLangtextFocusKey(normalisedKey);
        console.info('Added Langtext entry via JSON add handler', { key: normalisedKey });
      } catch (error) {
        console.error('Failed to add Langtext entry', { error });
      }
    },
    [normaliseKeyLength, onUpdate, parsedLangtext, pendingLangtextKey]
  );

  const handlePendingLangtextKeyChange = useCallback(
    (value: string) => {
      if (!value) {
        setPendingLangtextKey('');
        return;
      }

      const normalised = normaliseKeyLength(value, 'pending');
      setPendingLangtextKey(normalised);
    },
    [normaliseKeyLength]
  );

  const handleLangtextJsonDelete = useCallback(
    (keyToRemove: string) => {
      if (parsedLangtext.mode !== 'json') {
        console.warn('Langtext JSON editor inactive, cannot remove key-value pair', { key: keyToRemove });
        return;
      }

      try {
        const nextEntries = parsedLangtext.entries.filter((entry) => entry.key !== keyToRemove);
        if (nextEntries.length === parsedLangtext.entries.length) {
          console.warn('Attempted to remove unknown Langtext key during JSON delete', { key: keyToRemove });
          return;
        }

        const nextPayload = stringifyLangtextEntries(nextEntries);
        onUpdate('Langtext', nextPayload as ItemFormPayload['Langtext']);
        console.info('Removed Langtext entry via JSON delete handler', { key: keyToRemove });
      } catch (error) {
        console.error('Failed to stringify Langtext entries during value update', {
          error,
          key: keyToRemove
        });
      }
    },
    [onUpdate, parsedLangtext]
  );

  const handleLangtextRemoveEntry = useCallback(
    (key: string) => {
      if (parsedLangtext.mode !== 'json') {
        console.warn('Langtext remove ignored because payload is not JSON-backed', { key });
        return;
      }

      const nextEntries = parsedLangtext.entries.filter((entry) => entry.key !== key);
      if (nextEntries.length === parsedLangtext.entries.length) {
        console.warn('Attempted to remove unknown Langtext key', { key });
        return;
      }

      try {
        const nextPayload = stringifyLangtextEntries(nextEntries);
        onUpdate('Langtext', nextPayload as ItemFormPayload['Langtext']);
        console.info('Removed Langtext entry', { key });
      } catch (error) {
        console.error('Failed to remove Langtext entry', { key, error });
      }
    },
    [onUpdate, parsedLangtext, pendingLangtextKey]
  );

  const handleLangtextTextChange = useCallback(
    (value: string) => {
      onUpdate('Langtext', value as ItemFormPayload['Langtext']);
    },
    [onUpdate]
  );

  if (langtextEditorTestHarness && parsedLangtext.mode === 'json') {
    // Test harness hook: allows non-DOM tests to exercise the JSON addition and removal pathways.
    langtextEditorTestHarness({ add: handleLangtextJsonAdd, remove: handleLangtextJsonDelete });
  }

  const placementInputValue = typeof (form as Partial<ItemFormData>).BoxID === 'string'
    ? (form as Partial<ItemFormData>).BoxID ?? ''
    : '';
  const hasPlacementValue = placementInputValue.trim() !== '';
  const shouldDisplayPlacement = !isReferenceMode && !placementHidden && (!isNew || hasPlacementValue);

  const handlePlacementChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (placementReadonly) {
        console.info('Placement change ignored because the field is readonly.');
        return;
      }

      try {
        const nextValue = event.target.value;
        onUpdate('BoxID', nextValue as ItemFormPayload['BoxID']);
        console.log('Updated item placement draft value', { nextBoxId: nextValue });
      } catch (error) {
        console.error('Failed to handle placement change', error);
      }
    },
    [onUpdate, placementReadonly]
  );

  const handlePlacementClear = useCallback(() => {
    if (placementReadonly) {
      console.info('Placement clear ignored because the field is readonly.');
      return;
    }
    try {
      console.log('Clearing item placement via placement controls');
      onUpdate('BoxID', null);
    } catch (error) {
      console.error('Failed to clear item placement', error);
    }
  }, [onUpdate, placementReadonly]);

  const handleQuantityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (quantityReadonly) {
        console.info('Quantity change ignored because the field is readonly');
        return;
      }

      // TODO(agent): Revisit quantity input behavior once instance/bulk entry UX is finalized.
      try {
        const { value } = event.target;

        if (value === '') {
          onUpdate('Auf_Lager', undefined);
          return;
        }

        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) {
          console.warn('Received non-numeric quantity input', { value });
          return;
        }

        if (parsed < 0) {
          console.warn('Received negative quantity input, clamping to zero', { value: parsed });
          onUpdate('Auf_Lager', 0);
          return;
        }

        onUpdate('Auf_Lager', parsed);
      } catch (error) {
        console.error('Failed to handle quantity change', error);
      }
    },
    [onUpdate, quantityReadonly]
  );

  const categoryLookup = useMemo(() => buildItemCategoryLookups().haupt, []);

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

  const handleQualityChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (isReferenceMode) {
      console.info('Quality change ignored in reference-only mode');
      return;
    }
    if (qualityReadonly) {
      console.info('Quality change ignored because the field is readonly');
      return;
    }
    try {
      const nextValue = normalizeQuality(event.target.value, console);
      onUpdate('Quality', nextValue as ItemFormData['Quality']);
    } catch (error) {
      console.error('Failed to update quality value in item form', error);
    }
  }, [isReferenceMode, onUpdate, qualityReadonly]);

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

      {shouldDisplayPlacement && (
        <div className="row">
          <label>Behälter</label>
          <div className="combined-input placement-controls">
            <input
              value={placementInputValue}
              onChange={handlePlacementChange}
              placeholder="Behälter-ID"
              readOnly={placementReadonly}
            />
            <button
              type="button"
              onClick={handlePlacementClear}
              disabled={placementReadonly || !hasPlacementValue}
            >
              Entfernen
            </button>
          </div>
          <p className="muted">Leer lassen, um den Artikel ohne Behälter zu speichern.</p>
        </div>
      )}

      <div className="row">
        {!isReferenceMode && (form as Partial<ItemFormData>).ItemUUID && (
          <input type="hidden" value={(form as Partial<ItemFormData>).ItemUUID} />
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

      {!quantityHidden && (
        <div className="row">
          <label>
            Anzahl*
          </label>
          <div className="combined-input">
            {/* <button
              type="button"
              onClick={() => handleStock('remove')}
              disabled={quantityReadonly}
            >
              -
            </button> */}
            <input
              type="number"
              value={(form as Partial<ItemFormData>).Auf_Lager ?? 0}
              onChange={handleQuantityChange}
              required
              disabled={quantityReadonly}
              min={0}
            />
            {/* <button
              type="button"
              onClick={() => handleStock('add')}
              disabled={quantityReadonly}
            >
              +
            </button> */}
          </div>
        </div>
      )}

      {!qualityHidden && (
        <div className="row">
          <label>
            <span>Qualität:</span>
            {/* <QualityBadge compact labelPrefix="Qualität" value={qualitySummary.value} /> */}
            <span key={`quality-label-${qualitySummary.value ?? 'unknown'}`}>{qualitySummary.label}</span>
          </label>
          <div className="combined-input">
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={qualitySummary.value ?? QUALITY_MIN}
              onChange={handleQualityChange}
              aria-valuetext={`${qualitySummary.label} (${qualitySummary.value ?? QUALITY_MIN})`}
              disabled={qualityReadonly}
            />
          </div>
          {/* <div className="muted">
          </div> */}
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

      {/* TODO(spezifikationen-ui): Align Spezifikationen label strings with final UX copy review. */}
      <div className="row">
        <label>
          Spezifikationen
        </label>
        {parsedLangtext.mode === 'json' ? (
          <div className="langtext-editor" role="group" aria-label="Spezifikationen Schlüssel-Wert-Paare">
            {parsedLangtext.entries.length === 0 ? (
              <p className="langtext-editor__empty">Es sind derzeit keine Spezifikationen-Schlüssel hinterlegt.</p>
            ) : (
              parsedLangtext.entries.map((entry, index) => {
                const entryValueId = `${langtextFieldIdPrefix}-value-${index}`;
                // TODO(langtext-editor): Replace ad-hoc muted label styling with shared form label tokens.
                return (
                  <div className="langtext-editor__entry" key={entry.key}>
                    <label
                      className="langtext-editor__key muted"
                      htmlFor={entryValueId}
                      title={entry.key}
                    >
                      {entry.key}
                    </label>
                    <textarea
                      id={entryValueId}
                      ref={(element) => {
                        langtextValueRefs.current[entry.key] = element;
                      }}
                      className="langtext-editor__value"
                      value={entry.value}
                      onChange={(event) =>
                        handleLangtextJsonChange(entry.key, { value: event.target.value })
                      }
                      rows={Math.max(2, entry.value.split('\n').length)}
                    />
                    <button
                      type="button"
                      className="langtext-editor__remove"
                      onClick={() => handleLangtextRemoveEntry(entry.key)}
                      aria-label={`Spezifikationen-Schlüssel ${entry.key} entfernen`}
                    >
                      -
                    </button>
                  </div>
                );
              })
            )}
            <div className="langtext-editor__row langtext-editor__row--add">
              <label className="langtext-editor__cell langtext-editor__cell--key">
                <span className="langtext-editor__key">Neuer Schlüssel</span>
                <input
                  type="text"
                  className="langtext-editor__input"
                  aria-label="Neuer Spezifikationen-Schlüssel"
                  value={pendingLangtextKey}
                  maxLength={25}
                  onChange={(event) => handlePendingLangtextKeyChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleLangtextJsonAdd();
                    }
                  }}
                  placeholder="Schlüssel eingeben"
                />
              </label>
              <div className="langtext-editor__cell langtext-editor__cell--value">
                <span className="langtext-editor__add-hint">Wert kann nach dem Hinzufügen ergänzt werden.</span>
              </div>
              <div className="langtext-editor__cell langtext-editor__cell--actions">
                <button
                  type="button"
                  className="langtext-editor__add-button"
                  onClick={() => handleLangtextJsonAdd()}
                  disabled={!pendingLangtextKey.trim()}
                  aria-label="Spezifikationen-Schlüssel hinzufügen"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="langtext-editor langtext-editor--legacy">
            <textarea
              value={parsedLangtext.rawText}
              onChange={(event) => handleLangtextTextChange(event.target.value)}
              rows={3}
            />
            <p className="langtext-editor__hint">
              Dieses Feld nutzt noch das bisherige Textformat. Sobald strukturierte Daten vorliegen, wird die Liste der
              Schlüssel automatisch angezeigt.
            </p>
          </div>
        )}
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
          value={form.Länge_mm ?? ''}
          onChange={(e) => {
            try {
              const rawValue = e.target.value.trim();
              if (!rawValue) {
                onUpdate('Länge_mm', undefined);
                return;
              }

              const parsed = Number.parseInt(rawValue, 10);
              if (Number.isNaN(parsed)) {
                console.warn('[itemForm] Rejecting invalid Länge_mm input', { rawValue });
                return;
              }

              onUpdate('Länge_mm', parsed);
            } catch (error) {
              console.error('Failed to parse Länge_mm', error);
            }
          }}
        />
      </div>
      <div className="row">
        <label>
          Breite (mm)
        </label>
        <input
          type="number"
          value={form.Breite_mm ?? ''}
          onChange={(e) => {
            try {
              const rawValue = e.target.value.trim();
              if (!rawValue) {
                onUpdate('Breite_mm', undefined);
                return;
              }

              const parsed = Number.parseInt(rawValue, 10);
              if (Number.isNaN(parsed)) {
                console.warn('[itemForm] Rejecting invalid Breite_mm input', { rawValue });
                return;
              }

              onUpdate('Breite_mm', parsed);
            } catch (error) {
              console.error('Failed to parse Breite_mm', error);
            }
          }}
        />
      </div>
      <div className="row">
        <label>
          Höhe (mm)
        </label>
        <input
          type="number"
          value={form.Höhe_mm ?? ''}
          onChange={(e) => {
            try {
              const rawValue = e.target.value.trim();
              if (!rawValue) {
                onUpdate('Höhe_mm', undefined);
                return;
              }

              const parsed = Number.parseInt(rawValue, 10);
              if (Number.isNaN(parsed)) {
                console.warn('[itemForm] Rejecting invalid Höhe_mm input', { rawValue });
                return;
              }

              onUpdate('Höhe_mm', parsed);
            } catch (error) {
              console.error('Failed to parse Höhe_mm', error);
            }
          }}
        />
      </div>
      <div className="row">
        <label>
          Gewicht (kg)
        </label>
        <input
          type="number"
          step="0.01"
          value={form.Gewicht_kg ?? ''}
          onChange={(e) => {
            try {
              const rawValue = e.target.value.trim();
              if (!rawValue) {
                onUpdate('Gewicht_kg', undefined);
                return;
              }

              const parsed = Number.parseFloat(rawValue);
              if (Number.isNaN(parsed)) {
                console.warn('[itemForm] Rejecting invalid Gewicht_kg input', { rawValue });
                return;
              }

              onUpdate('Gewicht_kg', parsed);
            } catch (error) {
              console.error('Failed to parse Gewicht_kg', error);
            }
          }}
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
          onChange={(e) => {
            try {
              const parsed = Number.parseFloat(e.target.value);
              onUpdate('Verkaufspreis', Number.isNaN(parsed) ? 0 : parsed);
            } catch (error) {
              console.error('Failed to parse Verkaufspreis', error);
              onUpdate('Verkaufspreis', 0);
            }
          }}
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
          Veröffentlich-Status
        </label>
        <input
          type="checkbox"
          role="switch"
          className="item-form__binary-switch"
          checked={publishedStatusSwitchValue === 1}
          onChange={(event) => {
            try {
              const nextValue = event.target.checked ? 1 : 0;
              console.log('[itemForm] Updated Veröffentlicht_Status switch', { nextValue });
              onUpdate('Veröffentlicht_Status', nextValue);
            } catch (error) {
              console.error('[itemForm] Failed to update Veröffentlicht_Status switch', error);
              onUpdate('Veröffentlicht_Status', 0);
            }
          }}
        />
      </div>

      <div className="row">
        <label>
          Shopartikel
        </label>
        <input
          type="checkbox"
          role="switch"
          className="item-form__binary-switch"
          checked={shopartikelSwitchValue === 1}
          onChange={(event) => {
            try {
              const nextValue = event.target.checked ? 1 : 0;
              console.log('[itemForm] Updated Shopartikel switch', { nextValue });
              onUpdate('Shopartikel', nextValue);
            } catch (error) {
              console.error('[itemForm] Failed to update Shopartikel switch', error);
              onUpdate('Shopartikel', 0);
            }
          }}
        />
      </div>

      {einheitHidden ? (
        <input type="hidden" value={form.Einheit ?? ITEM_FORM_DEFAULT_EINHEIT} readOnly />
      ) : (
        <div className="row">
          <label>
            Einheit
          </label>
          <select
            value={form.Einheit ?? ITEM_FORM_DEFAULT_EINHEIT}
            onChange={(event) => {
              try {
                const value = event.target.value;
                if (isItemEinheit(value)) {
                  onUpdate('Einheit', value);
                  return;
                }
                const trimmed = value.trim();
                if (isItemEinheit(trimmed)) {
                  onUpdate('Einheit', trimmed);
                  return;
                }
                console.warn('[itemForm] Invalid Einheit selection, reverting to default', { value });
              } catch (error) {
                console.error('[itemForm] Failed to process Einheit selection', error);
              }
              onUpdate('Einheit', ITEM_FORM_DEFAULT_EINHEIT);
            }}
            disabled={einheitReadonly}
          >
            {ITEM_EINHEIT_VALUES.map((value) => (
              <option key={`einheit-option-${value}`} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      )}

    </>
  );
}

export type PhotoInputMode = 'camera' | 'file';

export type PhotoInputModeState = Record<PhotoFieldKey, PhotoInputMode>;

export function initializePhotoInputModes(initial?: Partial<PhotoInputModeState>): PhotoInputModeState {
  const base: PhotoInputModeState = {
    picture1: 'camera',
    picture2: 'camera',
    picture3: 'camera'
  };
  if (!initial) {
    return base;
  }
  const resolved: PhotoInputModeState = { ...base };
  for (const field of PHOTO_INPUT_FIELDS) {
    const mode = initial[field];
    if (mode === 'camera' || mode === 'file') {
      resolved[field] = mode;
    }
  }
  return resolved;
}


export function usePhotoInputModes(initial?: Partial<PhotoInputModeState>) {
  const [modes, setModes] = useState<PhotoInputModeState>(() => initializePhotoInputModes(initial));

  const setMode = useCallback((field: PhotoFieldKey, mode: PhotoInputMode) => {
    setModes((prev) => {
      if (prev[field] === mode) {
        return prev;
      }
      const next = { ...prev, [field]: mode };
      try {
        console.log('Photo input mode updated', { field, mode });
      } catch (logError) {
        console.error('Failed to log photo input mode update', logError);
      }
      return next;
    });
  }, []);

  const toggleMode = useCallback((field: PhotoFieldKey) => {
    setModes((prev) => {
      const nextMode = getNextPhotoInputMode(prev[field]);
      const next = { ...prev, [field]: nextMode };
      try {
        console.log('Photo input mode toggled', { field, mode: nextMode });
      } catch (logError) {
        console.error('Failed to log photo input mode toggle', logError);
      }
      return next;
    });
  }, []);

  const isCameraMode = useCallback((field: PhotoFieldKey) => modes[field] === 'camera', [modes]);

  const getCapture = useCallback(
    (field: PhotoFieldKey) => resolvePhotoCaptureAttribute(modes[field]),
    [modes]
  );

  return { modes, setMode, toggleMode, isCameraMode, getCapture } as const;
}

export function createPhotoChangeHandler(
  onUpdate: (key: ItemFormFieldKey, value: ItemFormPayload[ItemFormFieldKey]) => void,
  field: PhotoFieldKey
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
