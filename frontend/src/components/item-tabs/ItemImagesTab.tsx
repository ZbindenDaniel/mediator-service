import React from 'react';
import ItemMediaGallery, { type GalleryAsset } from '../ItemMediaGallery';
import type { Item } from '../../../../models';

interface Props {
  item: Item;
  mediaAssets: string[];
  mediaFileInputRef: React.RefObject<HTMLInputElement>;
  onAdd: () => void;
  onRemove: (asset: GalleryAsset) => void | Promise<void>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ItemImagesTab({
  item,
  mediaAssets,
  mediaFileInputRef,
  onAdd,
  onRemove,
  onFileChange
}: Props) {
  return (
    <div className="card grid-span-row-2">
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
        <ItemMediaGallery
          itemId={item.ItemUUID}
          grafikname={item.Grafikname}
          mediaAssets={mediaAssets}
          className="item-media-gallery--stacked"
          onAdd={onAdd}
          onRemove={onRemove}
        />
      </section>
    </div>
  );
}
