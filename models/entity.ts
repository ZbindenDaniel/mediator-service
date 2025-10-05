import { Box } from './box';
import type { ItemQuant } from './item-quant';
import type { ItemRef } from './item-ref';

type ItemData = ItemRef & Partial<ItemQuant>;

export type Entity =
  | { type: 'Box'; id: string; data?: Box }
  | { type: 'Item'; id: string; data?: ItemData };
