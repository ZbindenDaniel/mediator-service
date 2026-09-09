// Versioned history of an item's AI-enriched state. A snapshot is captured just before a run/rework
// mutates the item (snapshot-before-run model), so the newest live item is the current state and each
// snapshot is a rollback point + a diff anchor. Restore is non-destructive: it writes a chosen
// snapshot's fields back to the item AND records a new `restore` snapshot, so history is never lost.

export const AGENTIC_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type AgenticRunSnapshotReason = 'pre-run' | 'pre-rework' | 'restore';

// The AI-written ("pipeline-owned") fields the snapshot captures — the diff surface and what restore
// writes back. Instance/intake fields (InstanceSpecs, serial/MAC) are intentionally out of scope for
// now and will get their own history later.
export interface AgenticSnapshotFields {
  Artikelbeschreibung?: string | null;
  Kurzbeschreibung?: string | null;
  Langtext?: unknown; // spec object or string
  Hersteller?: string | null;
  Länge_mm?: number | null;
  Breite_mm?: number | null;
  Höhe_mm?: number | null;
  Gewicht_kg?: number | null;
  Verkaufspreis?: number | null;
  Hauptkategorien_A?: number | string | null;
  Unterkategorien_A?: number | string | null;
  Hauptkategorien_B?: number | string | null;
  Unterkategorien_B?: number | string | null;
}

export interface AgenticRunSnapshot {
  Id: number;
  Artikel_Nummer: string;
  RunId: number | null;
  CreatedAt: string;
  Reason: AgenticRunSnapshotReason;
  // The item's review state at capture time — lets retention "always keep the last approved" state.
  CapturedReviewState: string | null;
  Actor: string | null;
  TriggerReason: string | null;
  SchemaVersion: number;
  Fields: AgenticSnapshotFields;
}
