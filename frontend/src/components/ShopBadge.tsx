// TODO(shop-badge-ui): Revisit ShopBadge copy and shape once shared status badge tokens are available.
import React from 'react';
import { logError, logger } from '../utils/logger';

type PublicationBadgeState = 'published' | 'unpublished';
type ShopBadgeState = 'shop' | 'no-shop';

interface Props {
  publishedStatus?: boolean | string | null;
  shopartikel?: number | string | boolean | null;
  compact?: boolean;
  labelPrefix?: string;
}

function resolvePublicationState(value: Props['publishedStatus']): PublicationBadgeState {
  try {
    if (typeof value === 'boolean') {
      return value ? 'published' : 'unpublished';
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return 'unpublished';
      }
      if (['1', 'true', 'yes', 'ja', 'published'].includes(normalized)) {
        return 'published';
      }
      if (['0', 'false', 'no', 'nein', 'unpublished'].includes(normalized)) {
        return 'unpublished';
      }
      logger.warn?.('ShopBadge: Unexpected publication status; using unpublished fallback', { value });
    }
  } catch (error) {
    logError('ShopBadge: Failed to resolve publication status', error, { value });
  }
  return 'unpublished';
}

function resolveShopState(value: Props['shopartikel']): ShopBadgeState {
  try {
    if (typeof value === 'boolean') {
      return value ? 'shop' : 'no-shop';
    }
    if (typeof value === 'number') {
      return value > 0 ? 'shop' : 'no-shop';
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return 'no-shop';
      }
      if (['1', 'true', 'yes', 'ja', 'shop'].includes(normalized)) {
        return 'shop';
      }
      if (['0', 'false', 'no', 'nein', 'no-shop'].includes(normalized)) {
        return 'no-shop';
      }
      const parsed = Number.parseInt(normalized, 10);
      if (Number.isFinite(parsed)) {
        return parsed > 0 ? 'shop' : 'no-shop';
      }
      logger.warn?.('ShopBadge: Unexpected Shopartikel value; using no-shop fallback', { value });
    }
  } catch (error) {
    logError('ShopBadge: Failed to resolve Shopartikel', error, { value });
  }
  return 'no-shop';
}

export default function ShopBadge({ publishedStatus, shopartikel, compact, labelPrefix = '' }: Props) {
  const publicationState = resolvePublicationState(publishedStatus);
  const shopState = resolveShopState(shopartikel);
  const className = compact ? 'shop-badge shop-badge--compact' : 'shop-badge';
  const backgroundColor = shopState === 'shop' ? 'var(--positive)' : 'var(--negative)';
  const borderColor = publicationState === 'published' ? 'var(--positive)' : 'var(--negative)';
  const label = shopState === 'shop' ? 'S' : '–';
  const prefix = labelPrefix ? `${labelPrefix}: ` : '';
  const ariaLabel = `${prefix}Shopartikel ${shopState === 'shop' ? 'aktiv' : 'inaktiv'}, Veröffentlichung ${publicationState === 'published' ? 'aktiv' : 'inaktiv'}`;

  return (
    <span
      aria-label={ariaLabel}
      className={className}
      style={{
        backgroundColor,
        borderColor
      }}
      title={ariaLabel}
    >
      {label}
    </span>
  );
}
