# Agentic Queue Event Review

This fixture helps analysts review the cadence of agentic queue events (`AgenticRunQueued`, `AgenticRunRequeued`) that are persisted in the mediator SQLite database. Even though the orchestrator now dispatches runs immediately after enqueueing, these events still capture when a run was queued or retried so operators can audit retries. The script automatically includes historical `AgenticSearchQueued` records so long as they remain in the database. It relies on the same database location that the backend uses (`DB_PATH` in `backend/config.ts`) and **never mutates** the database — it opens the file in read-only mode.

## Prerequisites

- Node.js environment with the repository dependencies installed (`npm install`).
- Access to the mediator SQLite database file. Set `DB_PATH` in your shell or `.env` file if it lives outside the default location.

## Usage

Run the fixture with `ts-node` so that no build step is required:

```bash
npx ts-node --transpile-only scripts/dump-agentic-search-events.ts
```

The script prints every matching event as tab-separated values using anonymised placeholders in the example below:

```
=== Agentic queue events ===
[AgenticRunQueued] 2024-05-01T08:15:30Z    ITEM-UUID-1234    {"Status":"queued","QueuedLocally":true,"RemoteTriggerDispatched":false}
[AgenticSearchQueued (legacy)] 2024-05-02T09:45:10Z    ITEM-UUID-5678    {"Status":"queued","QueuedLocally":true,"RemoteTriggerDispatched":true}

=== Duplicate ItemUUID occurrences by event ===
[AgenticRunQueued] ITEM-UUID-1234    3
```

- **Agentic queue events**: Each line starts with the originating event name. Legacy entries are annotated with `(legacy)` for clarity, and each row shows `CreatedAt`, the `ItemUUID` (sourced from `EntityId`), and the parsed `Meta` payload if it is valid JSON. Any sensitive fields should be redacted manually before sharing the output externally.
- **Duplicate ItemUUID occurrences by event**: Lists items with more than one queued event, grouped by event type, so analysts can spot unexpected retries while still differentiating between legacy and current pipelines.

If no duplicates exist, the script prints `No duplicate ItemUUID entries detected.` instead of the duplicate section.

## Troubleshooting

- If the database path is incorrect, the script exits with an error similar to `Failed to open database`. Double-check the `DB_PATH` environment variable.
- When the `Meta` column contains malformed JSON, the fixture continues and logs a warning while omitting the meta payload for the affected row.

## Data Hygiene

The fixture does **not** ship with production data. Sample values above are anonymised, and analysts should review the generated output before distribution to ensure no sensitive context is shared.
