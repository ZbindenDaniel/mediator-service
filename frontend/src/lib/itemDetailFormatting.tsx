import React from 'react';
import { ItemEinheit, isItemEinheit, normalizeItemEinheit } from '../../../models';
import { logger, logError } from '../utils/logger';

export interface NormalizedDetailValue {
  content: React.ReactNode;
  isPlaceholder: boolean;
}

export const DETAIL_PLACEHOLDER_TEXT = '-';

export function buildPlaceholder(): NormalizedDetailValue {
  return {
    content: <span className="details-placeholder">{DETAIL_PLACEHOLDER_TEXT}</span>,
    isPlaceholder: true
  };
}

export function normalizeDetailValue(value: React.ReactNode): NormalizedDetailValue {
  if (value === null || value === undefined) {
    return buildPlaceholder();
  }
  if (typeof value === 'boolean') {
    return { content: value ? 'Ja' : 'Nein', isPlaceholder: false };
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return buildPlaceholder();
    return { content: value, isPlaceholder: false };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return buildPlaceholder();
    return { content: trimmed, isPlaceholder: false };
  }
  if (Array.isArray(value)) {
    return { content: value, isPlaceholder: false };
  }
  if (React.isValidElement(value)) {
    return { content: value, isPlaceholder: false };
  }
  return { content: value, isPlaceholder: false };
}

export function humanizeCategoryLabel(label: string): string {
  try {
    return label.replace(/_/g, ' ');
  } catch (error) {
    console.error('Failed to humanize category label', { label }, error);
    return label;
  }
}

export function renderLangtextInlineSegments(
  text: string,
  counters: { bold: number },
  keyBase: string
): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    counters.bold += 1;
    nodes.push(<strong key={`${keyBase}-bold-${counters.bold}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length === 0 ? text : nodes;
}

export function buildLangtextMarkdown(raw: string): React.ReactNode | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let normalizedText = trimmed.replace(/\r\n/g, '\n');
  if (normalizedText.trim().startsWith('- ') && normalizedText.includes(' - **')) {
    normalizedText = normalizedText.replace(/\s+-\s+(?=\*\*)/g, '\n- ');
  }

  const lines = normalizedText.split('\n');
  if (lines.length === 0) return trimmed;

  const blocks: React.ReactNode[] = [];
  const counters = { bold: 0 };
  let pendingList: React.ReactNode[] = [];

  const flushList = () => {
    if (pendingList.length > 0) {
      const listKey = `langtext-ul-${blocks.length}`;
      blocks.push(<ul key={listKey}>{pendingList}</ul>);
      pendingList = [];
    }
  };

  lines.forEach((line, index) => {
    const value = line.trim();
    if (!value) { flushList(); return; }

    if (value.startsWith('- ')) {
      const itemContent = value.slice(2).trim();
      const inline = renderLangtextInlineSegments(itemContent, counters, `li-${index}`);
      pendingList.push(<li key={`langtext-li-${index}`}>{inline}</li>);
      return;
    }

    flushList();
    const inline = renderLangtextInlineSegments(value, counters, `p-${index}`);
    blocks.push(<p key={`langtext-p-${index}`}>{inline}</p>);
  });

  flushList();

  if (blocks.length === 0) return trimmed;
  return <div className="item-detail__langtext">{blocks}</div>;
}

export function resolveActorName(actor?: string | null): string {
  return actor && actor.trim() ? actor : 'System';
}

const DEFAULT_DETAIL_EINHEIT: ItemEinheit = ItemEinheit.Stk;

export function resolveDetailEinheit(value: unknown): ItemEinheit {
  try {
    if (isItemEinheit(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (isItemEinheit(trimmed)) return trimmed;
      if (trimmed.length > 0) {
        console.warn('ItemDetail: Invalid Einheit encountered, reverting to default.', { provided: trimmed });
      }
    } else if (value !== null && value !== undefined) {
      console.warn('ItemDetail: Unexpected Einheit type encountered, reverting to default.', { providedType: typeof value });
    }
  } catch (error) {
    console.error('ItemDetail: Failed to resolve Einheit value, using default.', error);
  }
  return DEFAULT_DETAIL_EINHEIT;
}

export function resolveQuantityEinheit(value: unknown, itemId: string): ItemEinheit | null {
  try {
    const normalized = normalizeItemEinheit(value);
    if (!normalized) {
      logger.warn?.('ItemDetail: Einheit missing or invalid; hiding quantity row.', { itemId, provided: value });
      return null;
    }
    return normalized;
  } catch (error) {
    logError('ItemDetail: Failed to normalize Einheit for quantity row', error, { itemId, provided: value });
    return null;
  }
}
