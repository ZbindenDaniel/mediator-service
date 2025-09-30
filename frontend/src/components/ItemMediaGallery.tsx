import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ItemMediaGalleryProps {
  itemId: string;
  grafikname?: string | null;
  mediaAssets?: string[] | null;
  className?: string;
  initialFailedSources?: string[] | null;
}

interface GalleryAsset {
  src: string;
  label: string;
  isPrimary: boolean;
}

function createFailureSet(seed: string[] | null | undefined): Set<string> {
  const failures = new Set<string>();
  if (!Array.isArray(seed)) {
    return failures;
  }
  for (const candidate of seed) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    failures.add(trimmed);
  }
  return failures;
}

function normaliseAssets(itemId: string, grafikname?: string | null, mediaAssets?: string[] | null): GalleryAsset[] {
  const entries: GalleryAsset[] = [];
  const seen = new Set<string>();

  function addAsset(src: string | null | undefined, isPrimary: boolean) {
    if (!src) return;
    const trimmed = src.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    const fileName = trimmed.split('/').pop() || trimmed;
    entries.push({
      src: trimmed,
      isPrimary,
      label: isPrimary ? 'Hauptbild' : fileName
    });
  }

  addAsset(grafikname || null, true);

  if (Array.isArray(mediaAssets)) {
    mediaAssets.forEach((asset) => addAsset(typeof asset === 'string' ? asset : null, false));
  }

  // Ensure deterministic order: keep primary first, others alphabetically
  const primary: GalleryAsset[] = [];
  const secondary: GalleryAsset[] = [];
  for (const asset of entries) {
    if (asset.isPrimary) {
      primary.push(asset);
    } else {
      secondary.push(asset);
    }
  }
  secondary.sort((a, b) => a.src.localeCompare(b.src));
  return [...primary, ...secondary];
}

export default function ItemMediaGallery({
  itemId,
  grafikname,
  mediaAssets,
  className,
  initialFailedSources
}: ItemMediaGalleryProps) {
  const defaultFailures = useMemo(
    () => createFailureSet(initialFailedSources),
    [initialFailedSources, itemId]
  );

  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set(defaultFailures));

  useEffect(() => {
    setFailedSources(new Set(defaultFailures));
  }, [defaultFailures]);

  const hasLoggedInitialFailures = useRef(false);
  if (!hasLoggedInitialFailures.current && defaultFailures.size > 0) {
    defaultFailures.forEach((src) => {
      console.error('Failed to load media asset', { itemId, src });
    });
    hasLoggedInitialFailures.current = true;
  }

  const assets = useMemo(() => normaliseAssets(itemId, grafikname, mediaAssets), [
    itemId,
    grafikname,
    mediaAssets
  ]);

  const handleImageError = useCallback(
    (src: string) => () => {
      setFailedSources((prev) => {
        if (prev.has(src)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(src);
        return next;
      });
      console.warn('Media asset failed to load', { itemId, src });
    },
    [itemId]
  );

  const effectiveClassName = ['item-media-gallery', className].filter(Boolean).join(' ');

  if (assets.length === 0) {
    return <p className="muted">Keine Medien verfügbar.</p>;
  }

  return (
    <div className={effectiveClassName}>
      {assets.map((asset) => {
        const isBroken = failedSources.has(asset.src);
        const fallbackLabel = asset.isPrimary ? 'Primäres Bild' : 'Zusätzliches Bild';
        return (
          <figure className="item-media-gallery__item" key={asset.src}>
            {!isBroken ? (
              <img
                src={asset.src}
                alt={`${fallbackLabel} für Artikel ${itemId}`}
                loading="lazy"
                onError={handleImageError(asset.src)}
              />
            ) : (
              <div className="item-media-gallery__fallback" role="status">
                <span>Medieninhalt konnte nicht geladen werden.</span>
                <small className="muted">{asset.src}</small>
              </div>
            )}
            <figcaption>{asset.label}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}
