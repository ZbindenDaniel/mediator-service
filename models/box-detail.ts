import type { Box } from './box';
import type { EventLog } from './event-log';
import type { GroupedItemSummary, Item } from './item';

// TODO(grouped-items): Remove legacy flat items response once frontend consumes groupedItems.
export interface BoxDetailResponse {
  box: Box | null;
  items: Item[];
  groupedItems?: GroupedItemSummary[];
  events: EventLog[];
  containedBoxes?: Box[];
}
