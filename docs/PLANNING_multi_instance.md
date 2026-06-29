# Multi-instance deployment — current situation

## Database layer

All instances connect to the same Postgres database via `DATABASE_URL`.
There is no SQLite fallback. All persistent state — items, boxes, events, agentic runs,
print jobs, Shopware sync jobs — lives in the shared database.

No instance-local state is persisted to disk except for temporary label render artifacts
(`PREVIEW_DIR`), which are ephemeral and not shared.

## Job queues

Three background job queues exist, all backed by Postgres tables:

| Queue | Table | Claim function | Protection |
|---|---|---|---|
| Agentic enrichment | `agentic_runs` | `claimQueuedAgenticRuns()` | `FOR UPDATE SKIP LOCKED` |
| Shopware sync | `shopware_sync_queue` | `claimShopwareSyncJobs()` | `FOR UPDATE SKIP LOCKED` |
| Label printing | `label_queue` | `claimNextLabelJob()` | `FOR UPDATE SKIP LOCKED` |

All three use the same pattern: a single atomic SQL statement that locks candidate rows
with `FOR UPDATE SKIP LOCKED` and immediately updates their status in the same CTE, returning
the claimed rows. Competing instances skip already-locked rows and get a disjoint set — no
double-claiming.

Status lifecycles:

- **Agentic:** `queued` → `running` → `succeeded | failed | cancelled | review`
- **Shopware:** `queued` → `processing` → `succeeded | failed` (retry reschedules to `queued`)
- **Label:** `Queued` → `Processing` → `Done | Error` (stale `Processing` rows older than 5 min reset to `Queued`)

## What each instance does independently

Each running instance:

- Polls `label_queue` every 750 ms (`setInterval(runPrintWorker, 750)` in `server.ts`)
- Runs the agentic dispatch loop (interval-based, `backend/agentic/index.ts`)
- Runs the Shopware sync worker (`backend/workers/processShopwareQueue.ts`)
- Serves all HTTP API and frontend requests

There is no instance identity in the system — no instance ID column in any queue table,
no registration, no leader election.

## Printer configuration

Printer queues are configured per-instance via environment variables:

| Variable | Purpose |
|---|---|
| `PRINTER_QUEUE` | Default CUPS queue name (item labels, box labels) |
| `PRINTER_QUEUE_MARKETING` | A4 marketing sheet queue (falls back to `PRINTER_QUEUE` if unset) |

CUPS itself is also per-instance — each instance connects to whatever CUPS socket/host
is reachable from its container. There is no shared CUPS daemon and no printer registry
in the database.

## Consequence: implicit cross-instance printing

Because the label queue is now shared and all instances poll it, a print job enqueued
by any instance will be claimed and printed by whichever instance's worker picks it up
first. That instance prints to its own locally configured CUPS printer.

In practice this means:

- A user on the shop UI queues a label → the warehouse instance (if running) may claim
  it and print to the warehouse printer.
- There is no way to direct a job to a specific printer today. The outcome depends
  entirely on which instance claims the row first.

## What is not yet addressed

- **Instance identity / routing:** No mechanism exists to say "print this label on the
  printer at location X". A `TargetPrinter` or `TargetInstance` column would be needed.
- **Printer registry in DB:** Printer names and their locations are not stored anywhere
  accessible to other instances. Each instance only knows its own `PRINTER_QUEUE`.
- **Concurrency cap coordination:** The agentic concurrency cap (`MAX_CONCURRENT_RUNS`)
  is enforced per-instance only. Two instances can each run up to the cap independently,
  so the effective global cap is `N × MAX_CONCURRENT_RUNS`.
- **Health / presence:** No instance announces itself or tracks liveness. There is no way
  to know how many instances are running or where they are.
