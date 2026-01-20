// TODO(agent): Confirm instance timestamp expectations once API consumers validate date formatting.
// TODO(agent): Revalidate item detail response fields after UI card splits to avoid missing instance metadata.
import type { AgenticRun } from './agentic-run';
import type { AgenticRunStatus } from './agentic-statuses';
import type { Box } from './box';
import type { EventLog } from './event-log';
import type { Item } from './item';

export interface ItemInstanceSummary {
  ItemUUID: string;
  AgenticStatus?: AgenticRunStatus | null;
  Quality?: number | null;
  Location?: string | null;
  BoxID?: string | null;
  UpdatedAt?: string | null;
  Datum_erfasst?: string | null;
}

export interface ItemDetailResponse {
  item: Item;
  box: Box | null;
  events: EventLog[];
  agentic: AgenticRun | null;
  media: string[];
  instances: ItemInstanceSummary[];
}
