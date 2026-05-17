import React from 'react';
import AttachmentsCard, { AttachmentIdentifiers } from '../AttachmentsCard';

interface Props extends AttachmentIdentifiers {
  itemUUID: string;
  attachments: any[];
  onChanged: (next: any[]) => void;
}

export default function ItemAttachmentsTab({ itemUUID, attachments, onChanged, ...ids }: Props) {
  return (
    <AttachmentsCard
      itemUUID={itemUUID}
      attachments={attachments}
      onChanged={onChanged}
      {...ids}
    />
  );
}
