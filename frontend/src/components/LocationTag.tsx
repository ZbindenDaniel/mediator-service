import React, { useEffect, useMemo, useState } from 'react';
import type { Box, Item } from '../../../models';
import { formatShelfLabel } from '../lib/shelfLabel';
import { logError, logger } from '../utils/logger';

// TODO(agent): Validate LocationTag fetch resolution once shelf labels are updated in production data.

type ItemLocationSource = Pick<Item, 'ItemUUID' | 'BoxID' | 'Location' | 'ShelfLabel'>;

interface LocationTagProps {
  item?: ItemLocationSource | null;
  itemId?: string | null;
  locationKey?: string | null;
  labelOverride?: string | null;
  className?: string;
  showId?: boolean;
}

interface ResolvedLocation {
  displayLabel: string | null;
  secondaryLabel: string | null;
  rawLocation: string | null;
  status: 'loading' | 'resolved' | 'missing';
}

function normalizeTagValue(
  value: string | null | undefined,
  context: string,
  itemId?: string | null
): string {
  if (value == null) {
    return '';
  }

  try {
    return value.trim();
  } catch (error) {
    logError(`Failed to normalize ${context} for location tag`, error, { value, itemId });
    return '';
  }
}

function resolveFallbackLabel(locationKey: string, context: string, itemId?: string | null): string | null {
  if (!locationKey) {
    return null;
  }

  try {
    return formatShelfLabel(locationKey);
  } catch (error) {
    logError(`Failed to format fallback shelf label for ${context}`, error, { locationKey, itemId });
    return null;
  }
}

function buildLocationDisplay(
  locationKey: string | null,
  labelOverride: string | null,
  context: string,
  itemId?: string | null
): ResolvedLocation {
  const normalizedLocation = normalizeTagValue(locationKey, context, itemId);
  const normalizedLabel = normalizeTagValue(labelOverride, `${context} label override`, itemId);
  const fallbackLabel = resolveFallbackLabel(normalizedLocation, context, itemId);
  const displayLabel = normalizedLabel || fallbackLabel || normalizedLocation || null;
  const secondaryLabel = fallbackLabel;

  if (normalizedLocation && !fallbackLabel) {
    logger.warn('Shelf label formatter returned empty label for location tag', {
      locationKey: normalizedLocation,
      itemId: itemId ?? null,
      context
    });
  }

  if (!displayLabel) {
    logger.warn('Missing location for location tag', {
      locationKey,
      itemId: itemId ?? null,
      context
    });
    return {
      displayLabel: null,
      secondaryLabel: null,
      rawLocation: normalizedLocation || null,
      status: 'missing'
    };
  }

  return {
    displayLabel,
    secondaryLabel,
    rawLocation: normalizedLocation || null,
    status: 'resolved'
  };
}

async function fetchJson<T>(
  path: string,
  context: string,
  itemId: string | null,
  signal?: AbortSignal
): Promise<T | null> {
  try {
    const response = await fetch(path, { signal });
    if (!response.ok) {
      logger.warn('LocationTag fetch failed', { context, status: response.status, itemId, path });
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    logError('LocationTag fetch failed', error, { context, itemId, path });
    return null;
  }
}

async function fetchItemById(itemId: string, signal?: AbortSignal): Promise<ItemLocationSource | null> {
  const data = await fetchJson<{ item?: Item }>(
    `/api/items/${encodeURIComponent(itemId)}`,
    'item',
    itemId,
    signal
  );
  if (!data?.item) {
    logger.warn('LocationTag failed to load item payload', { itemId });
    return null;
  }
  return data.item;
}

async function fetchBoxById(boxId: string, itemId: string | null, signal?: AbortSignal): Promise<Box | null> {
  const data = await fetchJson<{ box?: Box }>(
    `/api/boxes/${encodeURIComponent(boxId)}`,
    'box',
    itemId,
    signal
  );
  if (!data?.box) {
    logger.warn('LocationTag failed to load box payload', { itemId, boxId });
    return null;
  }
  return data.box;
}

async function resolveLocationForItem(
  itemData: ItemLocationSource | null,
  itemId: string | null,
  signal?: AbortSignal
): Promise<ResolvedLocation> {
  const resolvedItemId = itemId ?? itemData?.ItemUUID ?? null;
  if (!itemData) {
    logger.warn('LocationTag missing item payload for location resolution', { itemId: resolvedItemId });
    return {
      displayLabel: null,
      secondaryLabel: null,
      rawLocation: null,
      status: 'missing'
    };
  }

  const directLocation = normalizeTagValue(itemData.Location, 'item location', resolvedItemId);
  const directShelfLabel = normalizeTagValue(itemData.ShelfLabel, 'item shelf label', resolvedItemId);
  if (directLocation) {
    return buildLocationDisplay(directLocation, directShelfLabel || null, 'item location', resolvedItemId);
  }

  const normalizedBoxId = normalizeTagValue(itemData.BoxID, 'item box id', resolvedItemId);
  if (!normalizedBoxId) {
    logger.warn('LocationTag missing item shelf and box placement', { itemId: resolvedItemId });
    return {
      displayLabel: null,
      secondaryLabel: null,
      rawLocation: null,
      status: 'missing'
    };
  }

  const box = await fetchBoxById(normalizedBoxId, resolvedItemId, signal);
  if (!box) {
    logger.warn('LocationTag failed to resolve box for item', { itemId: resolvedItemId, boxId: normalizedBoxId });
    return {
      displayLabel: null,
      secondaryLabel: null,
      rawLocation: null,
      status: 'missing'
    };
  }

  const shelfId = normalizeTagValue(box.LocationId, 'box location', resolvedItemId);
  if (!shelfId) {
    logger.warn('LocationTag missing shelf location for box', { itemId: resolvedItemId, boxId: normalizedBoxId });
    return {
      displayLabel: null,
      secondaryLabel: null,
      rawLocation: null,
      status: 'missing'
    };
  }

  const shelfBox = await fetchBoxById(shelfId, resolvedItemId, signal);
  const shelfLabel = normalizeTagValue(
    shelfBox?.Label ?? shelfBox?.ShelfLabel,
    'shelf label',
    resolvedItemId
  );
  if (!shelfLabel) {
    logger.warn('LocationTag missing shelf label for resolved location', { itemId: resolvedItemId, shelfId });
  }

  return buildLocationDisplay(shelfId, shelfLabel || null, 'shelf location', resolvedItemId);
}

export default function LocationTag({
  item,
  itemId,
  locationKey,
  labelOverride,
  className,
  showId = false
}: LocationTagProps) {
  const resolvedItemId = useMemo(() => itemId ?? item?.ItemUUID ?? null, [itemId, item?.ItemUUID]);
  const hasDirectLocation = locationKey !== undefined || labelOverride !== undefined;
  const [resolved, setResolved] = useState<ResolvedLocation>({
    displayLabel: null,
    secondaryLabel: null,
    rawLocation: null,
    status: 'loading'
  });

  useEffect(() => {
    if (hasDirectLocation) {
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    const resolve = async () => {
      setResolved({
        displayLabel: null,
        secondaryLabel: null,
        rawLocation: null,
        status: 'loading'
      });

      const baseItem = item ?? (resolvedItemId ? await fetchItemById(resolvedItemId, controller.signal) : null);
      if (!isActive) {
        return;
      }
      const resolvedLocation = await resolveLocationForItem(baseItem, resolvedItemId, controller.signal);
      if (!isActive) {
        return;
      }
      setResolved(resolvedLocation);
    };

    void resolve();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [hasDirectLocation, item, resolvedItemId]);

  const directDisplay = useMemo(() => {
    if (!hasDirectLocation) {
      return null;
    }
    return buildLocationDisplay(locationKey ?? null, labelOverride ?? null, 'direct location', resolvedItemId);
  }, [hasDirectLocation, locationKey, labelOverride, resolvedItemId]);

  const displayState = directDisplay ?? resolved;
  const showRawId = Boolean(
    showId &&
      displayState.rawLocation &&
      displayState.displayLabel &&
      displayState.displayLabel !== displayState.rawLocation
  );

  if (displayState.status === 'loading' && !displayState.displayLabel) {
    return <span className={className}>…</span>;
  }

  if (!displayState.displayLabel) {
    return <span className={className}>(nicht gesetzt)</span>;
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: '0.125rem'
      }}
    >
      <span>{displayState.displayLabel}</span>
      {displayState.secondaryLabel ? <span className="muted">{displayState.secondaryLabel}</span> : null}
      {showRawId ? <span className="mono">{displayState.rawLocation}</span> : null}
    </span>
  );
}
