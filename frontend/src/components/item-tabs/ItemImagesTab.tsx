import React, { useCallback, useMemo, useState } from 'react';
import ItemMediaGallery, { type GalleryAsset } from '../ItemMediaGallery';
import PhotoCaptureModal from '../PhotoCaptureModal';
import type { Item } from '../../../../models';

interface Props {
  item: Item;
  mediaAssets: string[];
  mediaFileInputRef: React.RefObject<HTMLInputElement>;
  onAdd: () => void;
  onCapture?: (dataUrl: string) => void | Promise<void>;
  onRemove: (asset: GalleryAsset) => void | Promise<void>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ItemImagesTab({
  item,
  mediaAssets,
  mediaFileInputRef,
  onAdd,
  onCapture,
  onRemove,
  onFileChange
}: Props) {
  const [captureOpen, setCaptureOpen] = useState(false);
  // Same availability check as ItemCreate: no camera API → no button rather than a dead modal.
  const isCameraAvailable = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    []
  );

  const handleCapture = useCallback(
    (dataUrl: string) => {
      if (!onCapture) {
        return;
      }
      void onCapture(dataUrl);
    },
    [onCapture]
  );

  return (
    <div className="card">
      <h3>Fotos</h3>
      <section className="item-media-section">
        <input
          ref={mediaFileInputRef}
          type="file"
          accept="image/*"
          className="item-media-gallery__input"
          onChange={onFileChange}
          aria-hidden="true"
          tabIndex={-1}
          style={{ display: 'none' }}
        />
        {isCameraAvailable && onCapture ? (
          <div className="item-media-gallery__capture">
            <button type="button" onClick={() => setCaptureOpen(true)}>
              Foto aufnehmen
            </button>
          </div>
        ) : null}
        <ItemMediaGallery
          itemId={item.ItemUUID}
          grafikname={item.Grafikname}
          mediaAssets={mediaAssets}
          className="item-media-gallery--stacked"
          onAdd={onAdd}
          onRemove={onRemove}
        />
        <PhotoCaptureModal
          isOpen={captureOpen}
          onClose={() => setCaptureOpen(false)}
          onCapture={handleCapture}
          title="Foto aufnehmen"
        />
      </section>
    </div>
  );
}
