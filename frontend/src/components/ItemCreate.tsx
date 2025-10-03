import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Item } from '../../../models';
import { getUser } from '../lib/user';
import { buildAgenticRunUrl, resolveAgenticApiBase, triggerAgenticRun as triggerAgenticRunRequest } from '../lib/agentic';
import type { AgenticRunTriggerPayload } from '../lib/agentic';
import { ItemBasicInfoForm } from './ItemBasicInfoForm';
import { ItemMatchSelection } from './ItemMatchSelection';
import type { ItemFormData } from './forms/itemFormShared';
import type { SimilarItem } from './forms/useSimilarItems';

interface CreationResult {
  item: Item | undefined;
}

type CreationStep = 'basic' | 'match';

function sanitizeCreationPayload(input: Partial<ItemFormData>): Partial<ItemFormData> {
  const clone: Partial<ItemFormData> = { ...input };
  delete clone.ItemUUID;
  delete (clone as Partial<ItemFormData> & { UpdatedAt?: unknown }).UpdatedAt;
  delete (clone as Partial<ItemFormData> & { Datum_erfasst?: unknown }).Datum_erfasst;
  delete (clone as Partial<ItemFormData> & { EntityType?: unknown }).EntityType;
  return clone;
}

export default function ItemCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const boxId = params.get('box');

  const [step, setStep] = useState<CreationStep>('basic');
  const [basicInfo, setBasicInfo] = useState<Partial<ItemFormData>>(() => ({
    BoxID: boxId || undefined,
    Auf_Lager: 1
  }));
  const [creating, setCreating] = useState(false);
  const [agenticReady, setAgenticReady] = useState(false);

  const agenticApiBase = useMemo(resolveAgenticApiBase, []);
  const agenticRunUrl = useMemo(() => buildAgenticRunUrl(agenticApiBase), [agenticApiBase]);

  useEffect(() => {
    let cancelled = false;

    async function checkAgenticHealth() {
      if (!agenticApiBase) {
        console.info('Agentic API base URL not configured. Skipping agentic trigger.');
        setAgenticReady(false);
        return;
      }

      try {
        const healthUrl = new URL('/health', agenticApiBase).toString();
        const response = await fetch(healthUrl, { method: 'GET' });
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          console.warn('Agentic health endpoint returned non-OK status', response.status);
          setAgenticReady(false);
          return;
        }

        const body = await response
          .json()
          .catch((jsonError) => {
            console.error('Failed to parse agentic health response', jsonError);
            return null;
          });

        if (cancelled) {
          return;
        }

        if (body?.ok === true) {
          console.log('Agentic health check succeeded.');
          setAgenticReady(true);
        } else {
          console.warn('Agentic health endpoint reported unhealthy payload', body);
          setAgenticReady(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Agentic health check failed', err);
          setAgenticReady(false);
        }
      }
    }

    void checkAgenticHealth();

    return () => {
      cancelled = true;
    };
  }, [agenticApiBase]);

  const ensureArtikelNummer = useCallback(async (artikelNummer?: string | null) => {
    if (artikelNummer && artikelNummer.trim()) {
      return artikelNummer;
    }
    try {
      console.log('Requesting new Artikelnummer for item creation');
      const response = await fetch('/api/getNewMaterialNumber', { method: 'GET' });
      if (!response.ok) {
        console.error('Failed to fetch new Artikelnummer', response.status);
        throw new Error(`Artikelnummer konnte nicht geladen werden (Status ${response.status}).`);
      }
      const payload = await response
        .json()
        .catch((err) => {
          console.error('Failed to parse Artikelnummer response', err);
          return null;
        });
      const next = typeof payload?.nextArtikelNummer === 'string' ? payload.nextArtikelNummer.trim() : '';
      if (!next) {
        throw new Error('Antwort enthielt keine gültige Artikelnummer.');
      }
      return next;
    } catch (err) {
      console.error('Failed to retrieve new Artikelnummer', err);
      throw err;
    }
  }, []);

  const triggerAgenticRun = useCallback(
    async ({ itemId, artikelbeschreibung }: { itemId: string | undefined; artikelbeschreibung: string | undefined }) => {
      if (!agenticReady || !itemId || !artikelbeschreibung) {
        if (!agenticReady) {
          console.info('Agentic trigger skipped: service not ready.');
        }
        return;
      }

      const payload: AgenticRunTriggerPayload = {
        itemId,
        artikelbeschreibung
      };

      try {
        await triggerAgenticRunRequest({
          runUrl: agenticRunUrl,
          payload,
          context: 'item creation'
        });
      } catch (err) {
        console.error('Agentic trigger request failed', err);
      }
    },
    [agenticReady, agenticRunUrl]
  );

  const createItem = useCallback(
    async (payload: Partial<ItemFormData>, context: string) => {
      if (creating) {
        console.warn('Create item called while another creation is in progress');
        return;
      }
      setCreating(true);

      const sanitized = sanitizeCreationPayload({
        ...payload,
        BoxID: payload.BoxID ?? boxId ?? undefined
      });

      try {
        const artikelNummer = await ensureArtikelNummer(sanitized.Artikel_Nummer);
        const finalPayload: Partial<ItemFormData> = {
          ...sanitized,
          Artikel_Nummer: artikelNummer,
          Auf_Lager: sanitized.Auf_Lager ?? 1
        };

        const params = new URLSearchParams();
        const actor = getUser();
        if (actor) {
          params.append('actor', actor);
        }
        Object.entries(finalPayload).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') {
            return;
          }
          params.append(key, String(value));
        });

        console.log('Creating item', { context, payload: finalPayload });
        const response = await fetch('/api/import/item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });

        if (!response.ok) {
          console.error('Failed to create item', response.status);
          throw new Error(`Artikel konnte nicht erstellt werden (Status ${response.status}).`);
        }

        const result: CreationResult = await response
          .json()
          .catch((err) => {
            console.error('Failed to parse item creation response', err);
            return { item: undefined };
          });

        const createdItem = result?.item;
        if (!createdItem?.ItemUUID) {
          throw new Error('Antwort enthielt keine gültige ItemUUID.');
        }

        await triggerAgenticRun({ itemId: createdItem.ItemUUID, artikelbeschreibung: createdItem.Artikelbeschreibung });

        try {
          navigate(`/items/${encodeURIComponent(createdItem.ItemUUID)}/edit`, { replace: true });
        } catch (navErr) {
          console.error('Failed to navigate to created item edit view', navErr);
        }
      } catch (err) {
        console.error('Item creation failed', err);
        window.alert('Artikel konnte nicht erstellt werden. Bitte erneut versuchen.');
      } finally {
        setCreating(false);
      }
    },
    [boxId, creating, ensureArtikelNummer, navigate, triggerAgenticRun]
  );

  const handleBasicInfoSubmit = useCallback(
    (data: Partial<ItemFormData>) => {
      console.log('Basic info submitted', data);
      setBasicInfo({
        ...data,
        BoxID: data.BoxID ?? boxId ?? undefined,
        Auf_Lager: data.Auf_Lager ?? 1
      });
      setStep('match');
    },
    [boxId]
  );

  const handleDuplicateSelection = useCallback(
    async (item: SimilarItem) => {
      const basePictures = {
        picture1: basicInfo.picture1,
        picture2: basicInfo.picture2,
        picture3: basicInfo.picture3
      };
      const payload: Partial<ItemFormData> = {
        ...item,
        ...basePictures,
        Artikelbeschreibung: item.Artikelbeschreibung || basicInfo.Artikelbeschreibung,
        Auf_Lager: basicInfo.Auf_Lager ?? item.Auf_Lager ?? 1,
        BoxID: basicInfo.BoxID ?? boxId ?? item.BoxID ?? undefined
      };
      await createItem(payload, `duplicate:${item.ItemUUID || 'unknown'}`);
    },
    [basicInfo, boxId, createItem]
  );

  const handleSkipDuplicates = useCallback(async () => {
    const payload: Partial<ItemFormData> = {
      ...basicInfo,
      BoxID: basicInfo.BoxID ?? boxId ?? undefined,
      Auf_Lager: basicInfo.Auf_Lager ?? 1
    };
    await createItem(payload, 'manual');
  }, [basicInfo, boxId, createItem]);

  if (step === 'basic') {
    return <ItemBasicInfoForm initialValues={basicInfo} onSubmit={handleBasicInfoSubmit} submitLabel="Weiter" />;
  }

  return (
    <ItemMatchSelection
      searchTerm={basicInfo.Artikelbeschreibung || ''}
      onSelect={handleDuplicateSelection}
      onSkip={handleSkipDuplicates}
    />
  );
}
