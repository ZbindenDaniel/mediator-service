// TODO(agent): Confirm instance timestamp expectations once API consumers validate date formatting.
// TODO(item-detail-reference): Align reference payload documentation with item_refs usage.
// TODO(agent): Revalidate item detail response fields after UI card splits to avoid missing instance metadata.
// TODO(agent): Verify ItemDetailResponse instances always return ItemUUID and timestamps in production payloads.
import type { AgenticRun } from './agentic-run';
import type { AgenticRunStatus } from './agentic-statuses';
import type { Box } from './box';
import type { EventLog } from './event-log';
import type { Item, ItemRef } from './item';
import type { QualityValue } from './quality';

export interface ItemInstanceSummary {
  ItemUUID: string;
  AgenticStatus?: AgenticRunStatus | null;
  // Nullable when no quality has been assigned yet.
  Quality?: QualityValue;
  // TODO(agent): Verify Auf_Lager stays present in instance summaries after backend schema changes.
  Auf_Lager?: number | null;
  Location?: string | null;
  BoxID?: string | null;
  UpdatedAt: string | null;
  Datum_erfasst: string | null;
}

export interface ItemDetailResponse {
  item: Item;
  reference: ItemRef | null;
  box: Box | null;
  events: EventLog[];
  agentic: AgenticRun | null;
  media: string[];
  instances: ItemInstanceSummary[];
}
