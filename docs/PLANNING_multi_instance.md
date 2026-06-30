# Multi-instance / multi-location deployment — current state

Implemented per `docs/changelogs/printing.md` entries 858–866. This doc reflects
the shipped architecture; see those changelog entries for the why/deferred
detail on each piece.

## Database layer

A single cloud app instance connects to one shared Postgres database via
`DATABASE_URL`. There is no SQLite fallback. All persistent state — items,
boxes, events, agentic runs, print jobs, Shopware sync jobs, printer queue
registry — lives in the shared database.

Because there is exactly one app instance, there is no leader-election,
double-claim, or cross-instance coordination problem for the agentic loop,
Shopware sync, or any other background worker. Those concerns only existed
under a multi-app-instance model, which this design replaced.

## Job queues

Three background job queues exist, all backed by Postgres tables:

| Queue | Table | Claim function | Protection |
|---|---|---|---|
| Agentic enrichment | `agentic_runs` | `claimQueuedAgenticRuns()` | `FOR UPDATE SKIP LOCKED` |
| Shopware sync | `shopware_sync_queue` | `claimShopwareSyncJobs()` | `FOR UPDATE SKIP LOCKED` |
| Label printing | `label_queue` | `claimNextLabelJob()` | `FOR UPDATE SKIP LOCKED` |

The label queue is additionally routable: `label_queue."TargetQueue"` names a
specific CUPS queue, set by `resolvePrinterQueue()` (`backend/print.ts`) at
enqueue time based on the operator's `site` (`frontend/src/lib/user.ts`) and
the `printer_queues` registry (`Site`, `LabelTypes` columns). Untargeted jobs
(`TargetQueue IS NULL`) are still claimed by the app's own local
`runPrintWorker()` loop for backward compatibility with non-agent setups.

## Print agents (per physical location)

Printing is no longer "whichever instance polls the queue first" — each
physical location runs a standalone `backend/print-agent.ts` process
(shipped as `print-agent/Dockerfile`, deployed via `docker-compose.worker.yml`)
that:

- Holds **no DB credentials.** It talks to the cloud app only over a
  persistent WebSocket (`/agent` endpoint, `backend/agentServer.ts`),
  authenticated with a shared `AGENT_TOKEN` (`backend/utils/agent-auth.ts`).
- Sends a `hello` message on connect (and on demand) listing its locally
  discovered CUPS queues (`lpstat -p`); the app upserts these into
  `printer_queues` with `InstanceId` set, visible live in the admin
  "Worker nodes" view — no manual registration step.
- Wakes on a `job_available` push (sent by the app when it enqueues a job
  targeting this agent's connected socket — see `connectedAgents` map in
  `backend/agentConnections.ts`), claims via a lightweight authenticated HTTP
  call, and prints locally via `lp -h <CUPS_HOST>`. A 30 s local fallback
  poll covers a missed/dropped push.
- Reuses the existing CUPS diagnostics/scan/cancel tooling: those admin
  actions are now routed over the same WebSocket instead of calling CUPS
  directly, since the app and CUPS are no longer co-located.

`CUPS_HOST` is a plain `lp -h` target, so a location can either run the
bundled `cups` service from `docker-compose.worker.yml` or point at any
already-reachable CUPS server (e.g. an existing Pi-hosted setup).

## Printer configuration

Routing is now a registry, not per-instance env vars:

| Mechanism | Purpose |
|---|---|
| `printer_queues.Site` / `LabelTypes` (admin-editable, "Worker nodes" view) | Per-queue routing intent — "this queue, at this site, prints these label types" |
| `frontend/src/lib/user.ts` `site` value | Operator-set location (same pattern as `username`), sent with print requests |
| `PRINTER_QUEUE*` env vars | Fallback only — used when no `site`/registry match exists (single-site / no-agent deployments) |

`resolvePrinterQueue(labelType, site)` (`backend/print.ts`) checks the
registry first (only considering queues whose owning agent is currently
connected — `isAgentConnected()`), then falls back to the env-var lookup.

CUPS itself remains local to each worker. The cloud app's own `cups`
service (in `docker-compose.yml`) still exists for any jobs handled by the
in-process fallback worker; its web UI (port 631) is bound to loopback only
— see printing changelog 866 for why a wider bind would be unsafe given
`cupsd.conf`'s IP-range trust model.

## What changed from the original (rejected) design

The original draft considered running multiple full app instances (one per
location) sharing one DB, with no routing — any instance could claim and
print any job to its own local printer, which was unpredictable for the
operator and required solving leader-election/concurrency-cap coordination
for every background loop. That model is **not** what was built. The shipped
design keeps exactly one app instance and pushes only the printing
concern out to lightweight per-location agents, which avoids that whole
class of coordination problems entirely (see printing changelog 860 "What
disappears from the old multi-instance plan").

## Known follow-ups (not yet done)

- `backend/utils/sync-printer-queues.ts` (the old push-to-CUPS-via-lpadmin
  mechanism) is still present; retiring it is deferred until a worker/agent
  is actually deployed in production, since `PrinterQueuesCard.tsx`'s admin
  CRUD still depends on it (see printing changelog 863 Deferred).
- No registry/CI pipeline publishes `print-agent`/`cups` images; the worker
  stack currently builds locally only (see printing changelog 865 Deferred).
- Auth at the proxy layer (nginx + Authelia + LDAP) for the cloud deployment
  is infra configuration, not app code, and is out of scope here.
