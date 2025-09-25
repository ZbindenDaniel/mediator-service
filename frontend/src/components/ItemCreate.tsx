import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Item } from '../../../models';
import { getUser } from '../lib/user';
import ItemForm_Agentic from './ItemForm_agentic';
import ItemForm from './ItemForm';

type ItemFormData = Item & {
  picture1?: string | null;
  picture2?: string | null;
  picture3?: string | null;
  agenticStatus?: 'queued' | 'running';
  agenticSearch?: string;
};

type AgenticHealthStatus = 'unknown' | 'healthy' | 'unhealthy';

type AgenticEnv = typeof globalThis & {
  AGENTIC_API_BASE?: string;
  process?: { env?: Record<string, string | undefined> };
};

function resolveAgenticApiBase(): string | null {
  try {
    const globalScope = globalThis as AgenticEnv;
    const candidate = globalScope.AGENTIC_API_BASE ?? globalScope.process?.env?.AGENTIC_API_BASE;
    if (!candidate) {
      return null;
    }
    return candidate.replace(/\/+$/, '');
  } catch (err) {
    console.error('Failed to resolve agentic API base URL', err);
    return null;
  }
}

export default function ItemCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const boxId = params.get('box') || null;
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Partial<ItemFormData>>(() => ({ BoxID: boxId || undefined }));
  const [itemUUID, setItemUUID] = useState<string | undefined>();
  const [agenticHealth, setAgenticHealth] = useState<AgenticHealthStatus>('unknown');

  const agenticApiBase = useMemo(resolveAgenticApiBase, []);

  const agenticRunUrl = useMemo(() => {
    if (!agenticApiBase) {
      return null;
    }
    try {
      return new URL('/run', agenticApiBase).toString();
    } catch (err) {
      console.error('Failed to construct agentic run URL', err);
      return null;
    }
  }, [agenticApiBase]);

  useEffect(() => {
    let cancelled = false;

    async function checkAgenticHealth() {
      if (!agenticApiBase) {
        console.info('Agentic API base URL not configured. Falling back to legacy item form.');
        setAgenticHealth('unhealthy');
        return;
      }

      try {
        const healthUrl = new URL('/health', agenticApiBase).toString();
        const response = await fetch(healthUrl, { method: 'GET' });
        if (cancelled) {
          return;
        }
        if (response.ok) {
          setAgenticHealth('healthy');
          console.log('Agentic health check succeeded.');
        } else {
          console.warn('Agentic health endpoint returned non-OK status', response.status);
          setAgenticHealth('unhealthy');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Agentic health check failed', err);
          setAgenticHealth('unhealthy');
        }
      }
    }

    void checkAgenticHealth();

    return () => {
      cancelled = true;
    };
  }, [agenticApiBase]);

  const baseDraft = useMemo(
    () => ({
      ...draft,
      BoxID: draft.BoxID || boxId || undefined,
      ItemUUID: itemUUID || draft.ItemUUID
    }),
    [boxId, draft, itemUUID]
  );

  async function triggerAgenticRun(agenticPayload: { id: string | undefined; search: string }, context: string) {
    if (agenticHealth !== 'healthy') {
      console.info(`Agentic trigger skipped (${context}): service not healthy (status: ${agenticHealth}).`);
      return;
    }

    if (!agenticRunUrl) {
      console.warn(`Agentic trigger skipped (${context}): run URL is not configured.`);
      return;
    }

    try {
      if (!agenticPayload.id) {
        console.warn(`Agentic trigger skipped (${context}): missing ItemUUID`);
        return;
      }

      if (!agenticPayload.search) {
        console.warn(`Agentic trigger skipped (${context}): missing search term`);
        return;
      }

      const agenticRes = await fetch(agenticRunUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agenticPayload)
      });

      if (!agenticRes.ok) {
        console.error(`Agentic trigger failed during ${context}`, agenticRes.status);
      }
    } catch (agenticErr) {
      console.error(`Agentic trigger invocation failed during ${context}`, agenticErr);
    }
  }

  async function handleSubmit(data: Partial<ItemFormData>) {
    const p = new URLSearchParams();
    Object.entries({ ...data, BoxID: boxId || data.BoxID || '', actor: getUser() }).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        p.append(k, String(v));
      }
    });
    try {
      const res = await fetch('/api/import/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: p.toString()
      });
      if (!res.ok) {
        console.error('Failed to create item', res.status);
        throw new Error(`Failed to create item. Status: ${res.status}`);
      }

      const j = await res.json();
      const createdItem: Item | undefined = j?.item;

      const searchText = createdItem?.Artikelbeschreibung || data.Artikelbeschreibung || '';
      const agenticPayload = {
        id: createdItem?.ItemUUID,
        search: searchText
      };

      void triggerAgenticRun(agenticPayload, 'item creation');

      alert('Behälter erstellt. Bitte platzieren!');
      if (createdItem?.BoxID) {
        navigate(`/boxes/${encodeURIComponent(createdItem.BoxID)}`);
      }
    } catch (err) {
      console.error('Failed to create item', err);
      throw err;
    }
  }

  async function handleSubmitDetails(data: Partial<ItemFormData>) {
    console.log('Submitting step 1 item details', data);
    const detailPayload = {
      Artikelbeschreibung: data.Artikelbeschreibung,
      Artikel_Nummer: data.Artikel_Nummer,
      Auf_Lager: data.Auf_Lager,
      BoxID: data.BoxID || boxId || undefined,
      agenticStatus: 'queued' as const,
      agenticSearch: data.Artikelbeschreibung
    } satisfies Partial<ItemFormData>;

    const p = new URLSearchParams();
    Object.entries({ ...detailPayload, actor: getUser() }).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        p.append(k, String(v));
      }
    });

    try {
      const res = await fetch('/api/import/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: p.toString()
      });

      if (!res.ok) {
        console.error('Failed to create item during step 1', res.status);
        throw new Error(`Failed to create item. Status: ${res.status}`);
      }

      const j = await res.json();
      const createdItem: Item | undefined = j?.item;

      setDraft((prev) => ({
        ...prev,
        ...detailPayload,
        BoxID: createdItem?.BoxID || detailPayload.BoxID,
        ItemUUID: createdItem?.ItemUUID || prev.ItemUUID,
        agenticStatus: 'queued',
        agenticSearch: detailPayload.agenticSearch
      }));
      setItemUUID(createdItem?.ItemUUID || itemUUID);

      const searchText = createdItem?.Artikelbeschreibung || detailPayload.Artikelbeschreibung || '';
      const agenticPayload = {
        id: createdItem?.ItemUUID,
        search: searchText
      };

      setStep(2);

      void triggerAgenticRun(agenticPayload, 'step one submission');
    } catch (err) {
      console.error('Failed to submit step 1 item details', err);
      throw err;
    }
  }

  async function handleSubmitPhotos(data: Partial<ItemFormData>) {
    console.log('Submitting step 2 item photos', data);
    const mergedData: Partial<ItemFormData> = {
      ...baseDraft,
      ...data,
      BoxID: data.BoxID || baseDraft.BoxID,
      ItemUUID: itemUUID || baseDraft.ItemUUID,
      agenticStatus: 'running',
      agenticSearch: baseDraft.agenticSearch || baseDraft.Artikelbeschreibung
    };

    await handleSubmit(mergedData);
  }

  if (agenticHealth === 'healthy') {
    return (
      <ItemForm_Agentic
        draft={baseDraft}
        step={step}
        onSubmitDetails={handleSubmitDetails}
        onSubmitPhotos={handleSubmitPhotos}
        submitLabel="Speichern"
        isNew
      />
    );
  }

  return (
    <ItemForm
      item={baseDraft}
      onSubmit={handleSubmit}
      submitLabel="Speichern"
      isNew
    />
  );
}
