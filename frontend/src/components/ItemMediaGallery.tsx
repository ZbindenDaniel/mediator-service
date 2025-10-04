import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// TODO: Evaluate extracting the lightbox modal into a shared component if additional consumers emerge.

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
  const [selectedAsset, setSelectedAsset] = useState<GalleryAsset | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFailedSources(new Set(defaultFailures));
  }, [defaultFailures]);

  useEffect(() => {
    if (!selectedAsset) {
      return undefined;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedAsset(null);
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [selectedAsset]);

  useEffect(() => {
    if (selectedAsset && modalContainerRef.current) {
      modalContainerRef.current.focus();
    }
  }, [selectedAsset]);

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

  const handleModalClose = useCallback(() => {
    setSelectedAsset(null);
  }, []);

  const handleImageSelect = useCallback(
    (asset: GalleryAsset) => () => {
      setSelectedAsset(asset);
    },
    []
  );

  const modalContent = useMemo(() => {
    if (!selectedAsset) {
      return null;
    }

    try {
      const isBroken = failedSources.has(selectedAsset.src);

      return (
        <div
          className="item-media-gallery__modal"
          role="dialog"
          aria-modal="true"
          aria-label={selectedAsset.label}
          tabIndex={-1}
          ref={modalContainerRef}
        >
          <div className="item-media-gallery__modal-content" role="document">
            <button type="button" className="item-media-gallery__modal-close" onClick={handleModalClose}>
              Schließen
            </button>
            {!isBroken ? (
              <img
                src={selectedAsset.src}
                alt={`${selectedAsset.label} für Artikel ${itemId}`}
                onError={handleImageError(selectedAsset.src)}
              />
            ) : (
              <div className="item-media-gallery__fallback" role="status">
                <span>Medieninhalt konnte nicht geladen werden.</span>
                <small className="muted">{selectedAsset.src}</small>
              </div>
            )}
            <figcaption>{selectedAsset.label}</figcaption>
          </div>
        </div>
      );
    } catch (error) {
      console.error('Error rendering media modal', { error, itemId, selectedAsset });
      return (
        <div
          className="item-media-gallery__modal item-media-gallery__modal--error"
          role="alertdialog"
          aria-modal="true"
          aria-live="assertive"
          tabIndex={-1}
          ref={modalContainerRef}
        >
          <div className="item-media-gallery__modal-content" role="document">
            <p>Beim Anzeigen des Mediums ist ein Fehler aufgetreten.</p>
            <button type="button" className="item-media-gallery__modal-close" onClick={handleModalClose}>
              Schließen
            </button>
          </div>
        </div>
      );
    }
  }, [failedSources, handleImageError, handleModalClose, itemId, selectedAsset]);

  if (assets.length === 0) {
    return <p className="muted">Keine Medien verfügbar.</p>;
  }

  return (
    <>
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
                  onClick={handleImageSelect(asset)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleImageSelect(asset)();
                    }
                  }}
                  role="button"
                  tabIndex={0}
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
      {selectedAsset && (
        <div
          className="item-media-gallery__modal-backdrop"
          role="presentation"
          onClick={handleModalClose}
        >
          <div
            className="item-media-gallery__modal-wrapper"
            onClick={(event) => event.stopPropagation()}
          >
            {modalContent}
          </div>
        </div>
      )}
    </>
  );
}
