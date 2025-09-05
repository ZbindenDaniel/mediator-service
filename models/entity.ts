import { Box } from './box';
import { Item } from './item';

export type Entity =
  | { type: 'Box'; id: string; data?: Box }
  | { type: 'Item'; id: string; data?: Item };
