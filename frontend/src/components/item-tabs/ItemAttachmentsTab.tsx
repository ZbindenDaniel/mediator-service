import React from 'react';
import AttachmentsCard from '../AttachmentsCard';

interface Props {
  itemUUID: string;
  attachments: any[];
  onChanged: (next: any[]) => void;
}

export default function ItemAttachmentsTab({ itemUUID, attachments, onChanged }: Props) {
  return <AttachmentsCard itemUUID={itemUUID} attachments={attachments} onChanged={onChanged} />;
}
