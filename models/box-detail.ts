import type { Box } from './box';
import type { EventLog } from './event-log';
import type { Item } from './item';

export interface BoxDetailResponse {
  box: Box | null;
  items: Item[];
  events: EventLog[];
  containedBoxes?: Box[];
}
