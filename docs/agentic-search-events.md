# Agentic Search Event Review

This fixture helps analysts review the cadence of `AgenticSearchQueued` events that are persisted in the mediator SQLite database. It relies on the same database location that the backend uses (`DB_PATH` in `backend/config.ts`) and **never mutates** the database — it opens the file in read-only mode.

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
=== AgenticSearchQueued events ===
2024-05-01T08:15:30Z    ITEM-UUID-1234    {"Status":"queued","QueuedLocally":true,"RemoteTriggerDispatched":false}
2024-05-02T09:45:10Z    ITEM-UUID-5678    {"Status":"queued","QueuedLocally":true,"RemoteTriggerDispatched":true}

=== Duplicate ItemUUID occurrences ===
ITEM-UUID-1234    3
```

- **AgenticSearchQueued events**: Each line shows `CreatedAt`, the `ItemUUID` (sourced from `EntityId`), and the parsed `Meta` payload if it is valid JSON. Any sensitive fields should be redacted manually before sharing the output externally.
- **Duplicate ItemUUID occurrences**: Lists items with more than one queued event along with the number of occurrences so that analysts can spot unexpected retries.

If no duplicates exist, the script prints `No duplicate ItemUUID entries detected.` instead of the duplicate section.

## Troubleshooting

- If the database path is incorrect, the script exits with an error similar to `Failed to open database`. Double-check the `DB_PATH` environment variable.
- When the `Meta` column contains malformed JSON, the fixture continues and logs a warning while omitting the meta payload for the affected row.

## Data Hygiene

The fixture does **not** ship with production data. Sample values above are anonymised, and analysts should review the generated output before distribution to ensure no sensitive context is shared.
