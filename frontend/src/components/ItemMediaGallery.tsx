import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

// TODO: Evaluate extracting the lightbox modal into a shared component if additional consumers emerge.
// TODO(media-controls): Validate add/remove copy and button placement once UX feedback lands.

interface ItemMediaGalleryProps {
  itemId: string;
  grafikname?: string | null;
  mediaAssets?: string[] | null;
  className?: string;
  initialFailedSources?: string[] | null;
  onAdd?: () => void | Promise<void>;
  onRemove?: (asset: GalleryAsset) => void | Promise<void>;
}

export interface GalleryAsset {
  src: string;
  label: string;
  isPrimary: boolean;
  slotIndex: number;
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

export function buildMediaGalleryAssets(
  itemId: string,
  grafikname?: string | null,
  mediaAssets?: string[] | null
): GalleryAsset[] {
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
      label: isPrimary ? 'Hauptbild' : fileName,
      slotIndex: -1
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
  return [...primary, ...secondary].map((asset, index) => ({
    ...asset,
    slotIndex: index
  }));
}

export default function ItemMediaGallery({
  itemId,
  grafikname,
  mediaAssets,
  className,
  initialFailedSources,
  onAdd,
  onRemove
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

  const assets = useMemo(() => buildMediaGalleryAssets(itemId, grafikname, mediaAssets), [
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

  const dialogTitleId = useId();

  const modalContent = useMemo(() => {
    if (!selectedAsset) {
      return null;
    }

    try {
      const isBroken = failedSources.has(selectedAsset.src);

      return (
        <div
          className="dialog-overlay item-media-gallery__overlay"
          role="presentation"
          onClick={handleModalClose}
        >
          <div
            className="dialog-content item-media-gallery__dialog"
            role={isBroken ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            tabIndex={-1}
            ref={modalContainerRef}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="item-media-gallery__dialog-header">
              <h2 id={dialogTitleId} className="dialog-title">
                {selectedAsset.label}
              </h2>
              {onRemove ? (
                <button
                  type="button"
                  className="item-media-gallery__dialog-remove"
                  onClick={() => {
                    try {
                      void Promise.resolve(onRemove(selectedAsset)).catch((error) => {
                        console.error('Failed to trigger media removal', {
                          error,
                          itemId,
                          src: selectedAsset.src
                        });
                      });
                    } catch (error) {
                      console.error('Failed to trigger media removal', {
                        error,
                        itemId,
                        src: selectedAsset.src
                      });
                    }
                  }}
                >
                  Remove
                </button>
              ) : null}
              <button
                type="button"
                className="item-media-gallery__dialog-close"
                onClick={handleModalClose}
              >
                Schließen
              </button>
            </header>
            <div className="item-media-gallery__dialog-body">
              {!isBroken ? (
                <img
                  className="item-media-gallery__dialog-image"
                  src={selectedAsset.src}
                  alt={`${selectedAsset.label} für Artikel ${itemId}`}
                  onError={handleImageError(selectedAsset.src)}
                />
              ) : (
                <div className="item-media-gallery__fallback" role="status">
                  <span>Medieninhalt konnte nicht geladen werden.</span>
                  {/* <small className="muted">{selectedAsset.src}</small> */}
                </div>
              )}
              <figcaption className="item-media-gallery__dialog-caption">{selectedAsset.label}</figcaption>
            </div>
          </div>
        </div>
      );
    } catch (error) {
      console.error('Error rendering media modal', { error, itemId, selectedAsset });
      return (
        <div className="dialog-overlay item-media-gallery__overlay" role="presentation" onClick={handleModalClose}>
          <div
            className="dialog-content item-media-gallery__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-live="assertive"
            tabIndex={-1}
            ref={modalContainerRef}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="item-media-gallery__dialog-header">
              <h2 id={dialogTitleId} className="dialog-title">
                Medienfehler
              </h2>
              <button
                type="button"
                className="item-media-gallery__dialog-close"
                onClick={handleModalClose}
              >
                Schließen
              </button>
            </header>
            <div className="item-media-gallery__dialog-body">
              <p>Beim Anzeigen des Mediums ist ein Fehler aufgetreten.</p>
            </div>
          </div>
        </div>
      );
    }
  }, [dialogTitleId, failedSources, handleImageError, handleModalClose, itemId, onRemove, selectedAsset]);

  const addAction = onAdd ? (
    <div className="item-media-gallery__actions">
      <button
        type="button"
        className="btn item-media-gallery__add"
        onClick={() => {
          try {
            void Promise.resolve(onAdd()).catch((error) => {
              console.error('Failed to trigger media add', { error, itemId });
            });
          } catch (error) {
            console.error('Failed to trigger media add', { error, itemId });
          }
        }}
      >
        +
      </button>
    </div>
  ) : null;

  if (assets.length === 0) {
    return (
      <>
        {addAction}
        <p className="muted">Keine Medien verfügbar.</p>
      </>
    );
  }

  return (
    <>
      {addAction}
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
                  {/* <small className="muted">{asset.src}</small> */}
                </div>
              )}
              {/* <figcaption>{asset.label}</figcaption> */}
            </figure>
          );
        })}
      </div>
      {modalContent}
    </>
  );
}
