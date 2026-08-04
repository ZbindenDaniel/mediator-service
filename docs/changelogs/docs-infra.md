# Changelog: Docs, Config & Infrastructure

Covers: documentation updates, CLAUDE.md/OVERVIEW.md changes, environment configuration, Docker, deployment scripts, DB migrations, cross-cutting refactors.

---

## 899. ✅ New-use-case readiness inventory (`docs/PLANNING_NEW_USE_CASE.md`)
   - **Why:** A new business use case is coming, which the request framed as "change the config, categories, and contracts." Before touching anything, produced a discovery/readiness inventory of every touchpoint coupled to the current IT‑refurbishment use case so the new use case's requirements can be compared against a concrete list and gaps identified. Key findings: **contracts** (`contracts/quality|specs|assembly|impact/*.json`) are the one ready layer — runtime‑loaded, operator‑editable, auto‑discovered by `<subcode>.json` filename; **categories** are the coupling hotspot — the taxonomy lives in **four** hand‑synced representations (`models/item-categories.ts` source of truth, `frontend/src/data/itemCategories.ts` re‑export, `docs/data_struct.md` LLM reference copied to dist by `scripts/build.js` and read by the categorizer, and the hardcoded `INTAKE_CATEGORIES` list) with no generator enforcing consistency, plus ~16 downstream consumers; **config** has **no use‑case/domain/tenant dimension at all**, so "change the config for a use case" is greenfield. Verdict: not ready to cleanly switch on a new use case — the pivotal open decision is coexist‑vs‑replace (edits vs. new scoping architecture). No code changed; documentation only. Registered the doc in `docs/PLANS.md`.
   - **Deferred:** The actual gap‑closure plan — it needs two answers the request didn't supply: (1) what the new use case is (its taxonomy + quality/spec requirements), and (2) whether it coexists with or replaces IT refurbishment. Also noted but not fixed: a taxonomy→`data_struct.md`/intake generator to stop the 4‑copy drift (G‑C1), and the `contracts/README.md` `disassembly/` vs on‑disk `assembly/` doc drift (G‑K3).

## 898. ✅ Add Authentik (user management / SSO) to the docker-compose stack — Phase 1
   - **Why:** The app has no real user identity — auth is three shared secrets (nginx Basic Auth, `ADMIN_SECRET`, `INTAKE_TOKEN`) and "users" are a free-text name typed into the browser. We want normal-user + admin roles, extensible later. Chose **forward-auth with Authentik** over building in-app OIDC: the backend is raw Node `http` with a single `handleRequest` and no middleware/session/cookie machinery, and it already sits behind a proxy that injects `X-Forwarded-*`, so letting Authentik own login and inject trusted `X-authentik-username`/`X-authentik-groups` headers keeps the backend change tiny and avoids hand-rolling an OIDC client on a frameworkless server. Authentik is also the user-management surface (admins create users/assign groups there) rather than duplicating an identity provider in-app. This change is deliberately **stack-only**: added `authentik-server`, `authentik-worker`, and a **dedicated** `authentik-postgresql` + `authentik-redis` (Authentik requires its own DB/cache — not the mediator database) to `docker-compose.yml`, with a shared-env YAML anchor (`x-authentik-env`), fail-fast interpolation on the required `AUTHENTIK_SECRET_KEY`/`AUTHENTIK_PG_PASSWORD`, `ak healthcheck` healthchecks, and the admin UI published on `${AUTHENTIK_PORT:-9000}` so an admin can configure it before any routing exists. Documented the new env vars in `.env.example` + `docs/ENVIRONMENT.md` and a bring-up/first-login runbook in `docs/setup.md`. Validated with `docker compose config` (anchor merge + interpolation render correctly). No `backend/config.ts` change — the backend reads none of these yet.
   - **Deferred:** Enforcement is a separate follow-up (todo P3): proxy forward-auth wiring (nginx `auth_request` in `mediator.conf`, Traefik `forwardAuth` label in `docker-compose.prod.yaml`) + removal of Basic Auth; a backend helper generalizing `requireAdminAuth` to resolve `{username, groups, role}` from Authentik headers into `ActionContext`, with a config-driven **group→capability map** (start `mediator-admin` + user; extend to `intake`/`erp`/`readonly` later) and `ADMIN_SECRET` kept as break-glass; populating the `Actor` field from the authenticated user. Also deferred: Authentik added to `docker-compose.prod.yaml`; the Proxy Provider/outpost/group config inside Authentik; and the deploy workflow only rolls `mediator`, so the Authentik services need a one-time manual `docker compose up -d` on the host.

## 896. ✅ Add a separate manually-triggered Gitea deploy workflow
   - **Why:** The build workflow (#895) only publishes the image; deploy was still manual. Added `.gitea/workflows/deploy.yaml` as a **`workflow_dispatch`-only** action (kept separate from the build so a push never deploys) that SSHes to the Docker host and rolls just the `mediator` service of the prod compose stack onto a chosen tag. Drove it through `docker compose -f docker-compose.prod.yaml pull/up -d mediator` rather than the existing `scripts/reploy.sh`, because prod actually runs as a multi-service Traefik compose stack (postgres + cups + mediator) and `reploy.sh` starts a single `--network=host` container that ignores those services. To let the deploy target the CI-built Gitea image without editing the file on the host, parametrized the prod compose image to `${MEDIATOR_IMAGE:-ghcr.io/zbindendaniel/mediator-service:3.0}` (same pattern the dev compose already uses) and the workflow exports `MEDIATOR_IMAGE` before `up`. Registry pull uses the run's auto-injected `secrets.GITHUB_TOKEN`; only SSH secrets (`DEPLOY_SSH_HOST/USER/KEY`) are operator-supplied, passed via an unquoted heredoc so the token travels over the encrypted channel and never lands in the host's process args. Inputs (`tag`, `deploy_dir`, `ssh_port`) are surfaced at trigger time. Documented in `docs/setup.md`.
   - **Deferred:** (1) Only the `mediator` service is rolled; postgres/cups are assumed already provisioned on the host. (2) Runner must reach the host on `ssh_port` — a LAN-only VM needs a LAN-resident `act_runner`; not solved here. (3) Host-key checking is `accept-new` (TOFU) rather than a pinned known_hosts. (4) `.env`/`VM_IP` must already exist in `deploy_dir`; the workflow never writes it. (5) `docker-compos-V2_2.yaml` and `scripts/reploy.sh` still hardcode `ghcr.io` — full registry cutover still pending.

## 895. ✅ Add Gitea Actions workflow to build & publish the Docker image
   - **Why:** There was no CI/CD — publishing the app image was fully manual (`docker build` + `docker login ghcr.io` with a personal access token, per `docs/setup.md`). Added `.gitea/workflows/docker-publish.yaml` that builds the multi-stage root `Dockerfile` (buildx, since line 1 pins `# syntax=docker/dockerfile:1`) and pushes to **Gitea's own built-in container registry** on push to `main`, on `v*.*.*` tags, and via manual dispatch. Chose the Gitea registry over ghcr.io because the project is hosted on Gitea: it needs **zero external secrets** — auth uses the `secrets.GITHUB_TOKEN` Gitea injects into every run — whereas keeping ghcr.io would require storing a PAT. The registry host is derived from `github.server_url` at runtime (the Gitea domain isn't committed anywhere), and `docker/metadata-action` lowercases the image path so the `ZbindenDaniel` → `zbindendaniel` case mismatch can't break the push. Documented the pipeline in `docs/setup.md`.
   - **Deferred:** (1) **Auto-deploy** — researched (SSH push-deploy reusing `scripts/reploy.sh`, or pull-based Watchtower on the Docker-only LAN VM) but not wired up; recommended a follow-up with a manual-approval gate. (2) **cups sidecar image** — still built locally in compose; not published. (3) **ghcr.io cutover** — `docker-compose.prod.yaml`, `docker-compos-V2_2.yaml`, and `scripts/reploy.sh` still point at `ghcr.io/zbindendaniel/mediator-service`; repoint them at the Gitea registry when migrating off the manual publish. (4) **`AUTO_PRINT_ITEM_LABEL`** compile-time esbuild flag is not exposed as a build-arg — CI bakes the current default; add an `ARG`/`--build-arg` if CI needs to flip it. (5) Included a commented Docker-CLI-only fallback job for runners that can't fetch the `docker/*` marketplace actions.

## 881. ✅ Fix production initDb crash: move item_attachments Artikel_Nummer index after the ALTER that adds the column
   - **Why:** `initDb()` runs two batches — first a big `CREATE TABLE IF NOT EXISTS … / CREATE INDEX …` batch, then an additive `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` batch. Commit `bae16a3` (#877) added the `Scope`/`Artikel_Nummer` columns to `item_attachments`: they live in the `CREATE TABLE` body (fine on a fresh DB) **and** are added via `ALTER` in the second batch (for pre-existing DBs). But an index `idx_item_attachments_artikel ON item_attachments("Artikel_Nummer")` was also placed in the **first** batch. On production the `item_attachments` table predates the column, so `CREATE TABLE IF NOT EXISTS` is a no-op, the column is still missing when the first batch reaches the index, and Postgres aborts the whole batch with `column "Artikel_Nummer" does not exist` (routine `ComputeIndexAttrs`). `initDb()` rejects → `server.ts` `process.exit(1)` → crash-loop. Because the second batch never runs, the `Confidence` column is also never added, producing the secondary `column "Confidence" does not exist` error from agentic-service. Removed the premature index from the first batch — the identical index is already (correctly) created in the second batch right after `ALTER TABLE item_attachments ADD COLUMN … "Artikel_Nummer"`, so it now only runs once the column is guaranteed to exist.
   - **Deferred:** No broader reordering of the schema batches — the only first-batch index referencing an additively-added column was this one; every other additive column (LastSyncedAt, ClosedAt/ClosedBy, Confidence, Scope) has no first-batch index. Left a WHY comment at the removal site so the ordering constraint isn't reintroduced.

## 878. ✅ Fix unhealthy container: guard the events.Meta jsonb migration against legacy data
   - **Why:** `initDb()` ran `ALTER TABLE events ALTER COLUMN "Meta" TYPE jsonb USING ..."Meta"::jsonb` unconditionally on every boot. On a fresh DB the table is empty so the cast trivially succeeds (CI/first-run pass), but on any pre-existing database a single legacy non-JSON `Meta` value (or an empty string) makes the cast throw `invalid input syntax for type json`. That rejects the whole schema batch → `initDb()` rejects → `server.ts` calls `process.exit(1)` → the HTTP listener dies → the Docker healthcheck (`curl -fs localhost:8080/`) never passes → `container mediator is unhealthy` and the proxy dependency fails to start. Reproduced against a seeded legacy `events` table and verified the fix. The migration is now guarded (only runs while the column is still non-jsonb, so no per-boot full-table rewrite) and sanitizes non-JSON legacy values to NULL before the cast so one malformed row can no longer abort startup. Added an `IMMUTABLE` `mediator_is_valid_json(text)` helper for the sanitize step (version-independent; avoids relying on the PG16-only `IS JSON` predicate).
   - **Deferred:** Legacy non-JSON `Meta` values are coerced to NULL rather than preserved as JSON strings — they were never valid structured metadata and the `@>` containment queries expect objects, so dropping them is the correct outcome. No change to `server.ts`'s hard `process.exit(1)` on init failure (fail-fast on a genuinely broken schema is still the right behavior).

## 854. ✅ Documentation restructure: filesystem-aligned READMEs + topic changelogs
   - **Why:** OVERVIEW.md had grown to 682 lines / 849 entries — too expensive to read at every session start. Restructured: OVERVIEW.md is now a ~70-line navigation hub; 18 folder READMEs (purpose, contents, relations, scope, rules, decisions) live alongside the code; 11 topic changelogs in docs/changelogs/ hold the full history distributed by domain. CLAUDE.md updated to direct new entries to topic changelogs with a one-liner summary in OVERVIEW.md.
   - **Deferred:** docs/changelogs/ entries from main (850–853) added post-rebase. Folder READMEs for leaf folders (agentic/flow/, agentic/prompts/, agentic/tools/) are stubs.

## 852. ✅ Harden nginx headers, dockerignore secrets, restrict Postgres bind address
   - **Why:** (1) Nginx was missing four standard browser security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) — pure client-side defence-in-depth. Camera kept enabled in Permissions-Policy because the app uses it for QR scanning. (2) `.dockerignore` didn't exclude `.env` or `secrets/` — both are present on real hosts. (3) Postgres `ports: 5432:5432` bound to 0.0.0.0 — changed to `127.0.0.1:5432:5432`.
   - **Deferred:** Remaining audit items (chmod 777 on /run/cups, resource limits, erp-sync credentials, read-only filesystem) tracked in backlog.

## 851. ✅ Harden Docker pipeline: entrypoint fail-fast, clean shutdown, log rotation
   - **Why:** (1) CUPS entrypoint looped silently if the socket never appeared — added fail-fast exit after 15s. (2) Background discovery loop was orphaned on SIGTERM — now tracked via DISCOVERY_PID and killed in the trap. (3) All containers had no log size limit — added 10 MB × 3 file cap in both compose files.
   - **Deferred:** chmod 777 on /run/cups left unchanged — tightening requires aligning UIDs/GIDs across images.
## 799. ✅ Add migrate service to docker-compose so migration runs on VM without the repo
   - **Why:** VM only runs Docker; operators need to migrate without cloning the repo or installing Node. The script is already in the image — adding a profiles:[migrate] service + SQLITE_PATH bind-mount makes it a single docker compose run command.
   - **Deferred:** Nothing.

## 798. ✅ Fix remaining unsafe CAST in listItemReferencesWithFilters (missed by earlier replace_all)
   - **Why:** The earlier fix replaced CAST→ROUND in itemSelectColumns and the agentic WHERE clause but listItemReferencesWithFilters has an independent SELECT block with different indentation that was missed. Same "30.0" crash risk.
   - **Deferred:** Nothing.

## 797. ✅ Fix migration: coerce SQLite float strings to integer for PG integer columns
   - **Why:** SQLite stored dimension values like `"362.2"` in INTEGER columns (Länge_mm etc.); PostgreSQL rejects these. Now queries `information_schema.columns` for each table's integer/bigint columns and rounds values before insert.
   - **Deferred:** Nothing.

## 796. ✅ Fix migrate-sqlite-to-postgres: wrong table name `item_references` → `item_refs` and wrong insert order
   - **Why:** `item_references` doesn't exist in SQLite so item_refs was never populated, then `items` FK violation fired because the parent table was empty. Also renamed `agentic_request_log` → `agentic_request_logs` to match the schema.
   - **Deferred:** Nothing.

## 794. ✅ Fix migration script usability: add `npm run migrate`, pre-flight checks, and concrete docs
   - **Why:** `docs/setup.md` step 2 referenced `npm run migrate` but the script didn't exist in package.json; operators had no working path to run the migration. Added the npm script, fs.existsSync guard with actionable error messages, and replaced the vague setup.md mention with exact commands and env var examples.
   - **Deferred:** Nothing.

## 793. ✅ Fix PostgreSQL column case-sensitivity: quote all column names in action SQL; fix nginx admin auth
   - **Why:** `initDb()` creates all tables with double-quoted (case-sensitive) identifiers (`"ItemUUID"`, `"BoxID"`, etc.). PostgreSQL folds unquoted identifiers to lowercase, so queries in 7 action files using bare `ItemUUID`, `BoxID`, etc. failed with `column "itemuuid" does not exist`. Fixed by adding double-quotes around every column name in SQL strings in `move-item.ts`, `edit-item-instance.ts`, `item-attachments.ts`, `item-relations.ts`, `import-item.ts`, `save-item.ts`, and `move-box.ts`. Admin login was always rejected because nginx's `auth_basic` directive (server-level Basic Auth) intercepts any `Authorization` header that isn't `Basic <base64>` and returns 401 before the Bearer token reaches the backend. Fixed by adding an `auth_basic off` location block for `/api/admin/` in nginx config.
   - **Deferred:** A broader audit of other SQL in `backend/` beyond action files (e.g. agentic flow queries) — those were migrated in earlier passes and appear to already use quoted identifiers.

## 792. ✅ Fix docker-compose: htpasswd volume mount pointed at non-existent path, causing Docker to create a directory
   - **Why:** `./mediator_htpasswd` didn't exist; Docker silently creates a directory for missing bind-mount sources. Changed to `./secrets/htpasswd` which is where the file is actually stored (and already declared in the `secrets:` block). Removed the empty directory Docker had created.
   - **Deferred:** `secrets/htpasswd` is currently empty (0 bytes) — needs `htpasswd -c secrets/htpasswd <user>` before auth works.

## 791. ✅ Fix Dockerfile: copy pruned node_modules from builder instead of re-running npm ci
   - **Why:** The runtime stage ran `npm ci --omit=dev` which requires network access and fails on flaky connections (ECONNRESET). Builder already has all deps installed; pruning devDeps there and copying `node_modules` across eliminates the second network call entirely.
   - **Deferred:** Nothing.

## 790. ✅ Fix nginx "host not found in upstream" — use resolver + variable for deferred DNS
   - **Why:** `depends_on: service_healthy` only controls container start order; nginx still resolves `proxy_pass` hostnames at config-parse time. Even with mediator healthy, Docker DNS can fail at that exact moment. Using `resolver 127.0.0.11` (Docker's embedded DNS) with `set $upstream` moves resolution to request time, which is the standard fix for nginx + Docker Compose setups.
   - **Deferred:** Nothing.

## 789. ✅ Fix docker-compose: build from source, healthcheck, proxy depends_on
   - **Why:** Two blockers after the Postgres migration: (1) mediator still used the pre-migration image `2.2` which ignores `DATABASE_URL` and opens SQLite — fixed by switching to `build: .`; (2) nginx proxy crashed with "host not found in upstream mediator" because nginx resolves DNS at config-parse time and the old `depends_on: - mediator` only waits for container start, not network readiness — fixed by adding a healthcheck to mediator and upgrading proxy's `depends_on` to `condition: service_healthy`.
   - **Deferred:** Nothing.

## 788. ✅ Add postgres service to docker-compose.yml; uncomment depends_on
   - **Why:** The Postgres migration required the service but the compose file only had the volume declared — the postgres container itself and health-check dependency were missing, so `docker compose up` would fail to provide a database.
   - **Deferred:** Nothing.

## 779. ✅ Migrate database layer from SQLite to PostgreSQL for multi-instance/multi-location support
   - **Why:** Multiple mediator instances (shop, warehouse 1, warehouse 2) need to share a single data store. SQLite is file-local; Postgres supports concurrent connections over the network. The entire `backend/db.ts` (3640 lines of synchronous `better-sqlite3`) was rewritten as an async `pg`-based layer. A new `backend/db-client.ts` wraps `pg.Pool` with composable helpers (`query`, `queryOne`, `execute`, `insert`, `withTransaction`, `namedToPositional`). All 8 caller files were updated to `await` the new async API. Multi-instance agentic job safety uses `FOR UPDATE SKIP LOCKED`. A one-time SQLite→Postgres data migration script is at `scripts/migrate-sqlite-to-postgres.ts`.
   - **Deferred:** ORM adoption (raw SQL kept). JSONB column type optimisation (TEXT columns remain TEXT). `better-sqlite3` dependency removal (kept for migration script). Agentic run dispatch loop (polling interval for multi-instance) — still uses `setImmediate` single-process model; Phase 2 distributed claim SQL is documented in the plan but not yet wired. `docker-compose.yml` Postgres service enablement (currently commented out).

## 785. ✅ Fix 10 backend/actions files: replace .get()/.run()/.all() calls on ctx functions with await async calls
   - **Why:** ctx helpers are now plain async functions (not objects with .get/.run/.all methods) after the Postgres migration; calling them the old way throws at runtime. Also fixed list-stubs.ts where missing await on ctx.listStubs.active()/all() would cause .filter() to be called on a Promise.
   - **Deferred:** Nothing.

## 783. ✅ Wire initDb() at server startup; fix findByMaterial stub in agentic dependencies
   - **Why:** `initDb()` was written during the Postgres migration but never called — tables would never be created. Also `createAgenticServiceDependencies` passed `findByMaterial: { all: () => [] }` (always empty) instead of the real async function, silently breaking material-lookup in agentic runs. Fixed both in `server.ts`.
   - **Deferred:** Nothing.

## 781. ✅ Convert remaining 5 backend/actions files from ctx.db.prepare()/ctx.db.transaction() to async db-client helpers
   - **Why:** `create-box.ts`, `bulk-delete-items.ts`, `admin-label-queue.ts`, `export-data.ts`, and `export-items.ts` still called the synchronous SQLite API directly (`ctx.db.transaction`, `ctx.db.prepare().all/get`). These would crash at runtime. Replaced with `withTransaction`/`query`/`queryOne` from `../db-client`; converted named SQLite params (`@param`) to Postgres positional params (`$1, $2, ...`).
   - **Deferred:** nothing deferred.

## 780. ✅ Migrate remaining backend/actions files from synchronous SQLite API to async pg db-client helpers
   - **Why:** `ctx.db.prepare()`, `ctx.db.transaction()`, `ctx.getItem.get()`, etc. were removed from ActionContext when the DB layer was rewritten for PostgreSQL (step 779). Seven files still used the old synchronous API and would crash at runtime. Replaced all `ctx.db.*` calls with `query`/`queryOne`/`execute`/`insert`/`withTransaction` from `../db-client`; updated SQL `?` placeholders to Postgres `$N` positional params; replaced `datetime('now')` with `new Date().toISOString()` params; fixed `.get()`/`.all()`/`.run()` calls on ctx methods to use proper `await ctx.method()` async pattern.
   - **Deferred:** nothing deferred.

## 798. ✅ Fix search 500: quote all column names in refTokenPresenceTerms, refExactMatchExpr, itemSql, boxSql
   - **Why:** All `r.Artikel_Nummer`, `r.Artikelbeschreibung`, `i.ItemUUID`, `i.BoxID`, `b.BoxID`, `b.Label` etc. in the dynamically-built SQL expressions were unquoted — folded to lowercase by Postgres, causing "column does not exist" on every search request. Fixed by quoting all `item_refs`, `items`, and `boxes` column references throughout both the ref-search and item-search paths including the shared `suchbegriffFallbackExpr`.
   - **Deferred:** Nothing.

## 797. ✅ Preemptive SQLite→Postgres audit: fix all remaining unquoted column names across backend
   - **Why:** Full sweep of all backend/*.ts files (excluding tests) found 8 more action files with unquoted mixed-case SQL identifiers that would fail with "column does not exist": `admin-label-queue.ts`, `add-item.ts`, `spec-gap.ts`, `import-item.ts` (EAN lookup), `agentic-bulk-restart-failed.ts`, `save-item.ts` (4 large relations queries), `item-external-docs.ts`, `item-external-docs-write.ts`, `search.ts` (exemplar subqueries). Also confirmed: `quality_assessments` columns are all-lowercase so unquoted access is fine; `substr()` is valid in Postgres; search.ts `?` placeholders are converted by `toPositional()`. No `.changes` checks, `datetime()`, `json_extract()`, or `PRAGMA` usages remain.
   - **Deferred:** Nothing — sweep was exhaustive across all action and agentic files.

## 758. ✅ Created v3.0 release notes in `docs/RECENT_HIGHLIGHTS.md` and bumped version from 2.2.0 to 3.0.0
   - **Why:** 100 PRs merged since the last formal release; v3.0 marks the maturity of the agentic system (Artikel_Nummer migration, example injection, phase attribution), spec contracts, box stubs, QR scan workflows, media overhaul, and UI shell redesign.
   - **Deferred:** Per-PR GitHub links in release notes — not in existing format convention. GitHub release/tag creation — deferred to a manual publish step.

## 754. ✅ Documentation: sync qr_codes.md, ARCHITECTURE.md, items.md, boxes.md + new stubs.md with shipped features
   - **Why:** QR search-scan mode (step 751), box stubs, and quality contracts shipped without doc updates. Added `search` intent to QrScanIntent enum and new "Search flow" user-flow description in qr_codes.md. Created docs/detailed/stubs.md (Phase 1 runbook). Added stub + quality-review action mentions to ARCHITECTURE.md. Expanded QualityAssessment field in items.md with the full derived-specs → Langtext flow. Cross-referenced stubs from boxes.md. Added domain runbook table to docs/detailed/README.md.
   - **Deferred:** Traceability matrix not updated (stubs.md not yet mapped); todo 0c tab icon verification still needs a live build.

## 62. ✅ Create `CLAUDE.md` as the mandatory enforcement point for agent documentation; tighten `docs/AGENT.md` to define "done" as requiring OVERVIEW.md/todo.md updates; add a "Documentation is mandatory" callout to `AGENTS.md`.
   - **Why:** Agents were completing implementation work without updating documentation — framing it as guidance rather than a completion requirement meant it was routinely skipped. CLAUDE.md is loaded automatically by Claude Code, making it the most reliable enforcement location.
   - **Deferred:** No changes to OVERVIEW.md or todo.md format themselves — only the requirement to use them was strengthened.

## 60. ✅ Documentation cleanup: split quick-start vs detailed agent guidance by making `AGENTS.md` a concise repository overview, moving detailed execution guardrails to `docs/AGENT.md`, and adding `docs/CODING_GUIDELINES.md` for extended coding standards linked from both entry points.

## 67. ✅ Documentation audit: fix broken `docs/PLANS.md` links, sync `docs/BUGS.md` to v2.3, update stale version references, and clean up architecture placeholder.
   - **Why:** Three files (README.md, AGENTS.md, docs/OVERVIEW.md) linked `docs/PLANS.md` which never existed — planning content had been split into four separate PLANNING_*.md files. BUGS.md was stuck on "v2.2" and listed only 1 of 6 active bugs. docs/OVERVIEW.md still read "v2.2 current; v2.3 planning intake". docs/ARCHITECTURE.md had a `Design:owner@mediator` copy-paste placeholder.
   - **Deferred:** Eight detailed doc candidates listed in `docs/detailed/_candidates.md` (Shopware sync, CSV pipeline, search layer, label/PDF, agentic prompts, observability, bulk ops, config modes) remain unwritten — pre-existing known gaps, tracked in _candidates.md for incremental follow-up.

## 66. ✅ UX story walkthrough: finalize stub→transport flow and transport completion model.
   - **Why:** Story trace revealed that "mark stub for transport" was out of scope but clearly needed. Resolved by treating stub detail as a standard transport creation entry point (pre-fill `SourceId = stub.ShelfId`) — no special logic, no new API. Transport completion via item-scanning rejected as too brittle; item instance view will surface pending transports for completion instead.
   - **Deferred:** Split-destination transports (one target per transport is acceptable in v1); instance view remodel is a separate task.

## 65. ✅ Resolve all open questions across the three planning docs (transport, stub boxes, inventory) and update docs so implementation can begin.
   - **Why:** All Q&A decisions are now locked in the planning docs rather than conversation notes — prevents implementation drift and gives implementors a single authoritative source. Active Inventory Day (UC-1) was explicitly deferred; the passive cycle (UC-2) and `InventoryCheckView` are the implementation focus. Stub auto-resolve was tied to `complete-transport` instead of a separate manual action to reduce operator steps.
   - **Deferred:** UC-1 Active Inventory Day (admin global flag + shelf-level task list); ERP API auth/schema for transport (needs ERP team alignment); per-shelf capacity thresholds for transport target picker.

## 64. ✅ Refine transport boxes planning: target shelf picker with box/item counts, location override at completion (`ActualTargetId`), UC4 (shelf full → scan new location → confirmation dialog), and `list-boxes?counts=1` API extension.
   - **Why:** Completion flow needs explicit override support (transporter may find a better shelf) with a mandatory confirmation step to prevent wrong-shelf accidents. Shelf picker must show capacity context to aid that decision.
   - **Deferred:** Per-shelf capacity threshold (Q8) — global config constant recommended for Phase 1.

## 63. ✅ Research and produce transport boxes (T-) planning document at `docs/PLANNING_transport_boxes.md`.
   - **Why:** User requested a planning doc covering use cases, data model, flows, UI placement, and open questions before any implementation. New separate `transports` table recommended over extending `boxes` — transport semantics (dual location, state machine, reference) do not map onto the Box interface without polluting existing print/relocation flows.
   - **Deferred:** No implementation started. Todo item #18 ("Transport/Temporary box alias") is superseded by this broader plan and should be replaced when Phase 1 work begins.

## 48. ✅ Add `docs/detailed/diagrams/README.md` placeholder backlog (item lifecycle, box relocation, import/export, agentic item-flow, review-flow) and link it from `docs/detailed/README.md` for text-first diagram planning without tooling overhead.

## 47. ✅ Add standalone `docs/detailed/glossary.md` with canonical terminology (items/instances, boxes/shelves, printing, QR events, agentic states/review outcomes), explicit Use/Avoid pairs, and contract-sensitive model-field mapping; link glossary in `docs/detailed/_template.md` for reuse.

## 47. ✅ Add `docs/detailed/traceability-matrix.md` with domain-to-code mappings (backend/frontend/models + data-structure checks), and link it from `docs/detailed/README.md` as the canonical path index.

## 47. ✅ Expand `docs/detailed/review-flow.md` from template into a current-state reviewer lifecycle reference covering statuses/transitions, reviewer actions, restart/retrigger paths, contract-verified artifact fields, UI/backend action mappings, audit logging, and explicit open questions for unresolved policy behavior.

## 47. ✅ Expand `docs/detailed/item-flow.md` from template into a current-state implementation safety reference documenting stage transitions, policy gates, field-level contracts, validation behavior, and stage logging/error maps for extraction/categorization/pricing/review handoffs.

## 46. ✅ Expand `docs/detailed/agentic-basics.md` from template into an operator/developer orchestration reference covering lifecycle stages, backend module map, persisted run/request/review contracts, observability/failure surfacing, guardrails, and links to specialized item/review deep-dives.

## 45. ✅ Expand `docs/detailed/import_export.md` from template into a concrete contract reference covering API surfaces, CSV/ZIP structure requirements, alias mapping, validation/error reporting behavior, logging points, and backend/shared-model sync checklist.

## 45. ✅ Expand `docs/detailed/printing.md` into an operational print reference covering label concepts, preview-vs-dispatch flow, template/route mappings, config dependencies, retry/error diagnostics, and operator troubleshooting checklist.

## 45. ✅ Expand `docs/detailed/qr_codes.md` from template into a current-state QR reference covering generation, scanner lifecycle, route/action mapping, payload contracts, and scan observability/error handling expectations.

## 45. ✅ Expand `docs/detailed/boxes.md` from template into a current-state reference covering hierarchy/identifiers, contracts, relocation flows, UI mappings, and logging-backed failure modes for move/print/import behavior consistency.

## 44. ✅ Apply doc-context efficiency follow-up: remove detailed-doc changelog sections and add explicit Agent prompt guidance to avoid bloated documentation context.

## 43. ✅ Refine `docs/detailed/items.md` summary to explicitly describe item centrality/relations (refs vs instances, ERP/shop sync context) and clarify `Langtext` as enrichment-flow core output.

## 42. ✅ Address item-doc review feedback: rename intro section to "In short", clarify `Einheit` semantics (`Stk` vs `Menge`), and add one-line purpose glossary for key fields.

## 41. ✅ Expand `docs/detailed/items.md` from template into a complete item-domain reference covering identity, contracts, backend/frontend maps, and mutation/import logging expectations.

## 40. ✅ Add `docs/detailed/_candidates.md` listing additional high-value doc split targets (Shopware queue, ingestion pipeline, search, label rendering, prompt contracts, observability, bulk ops, runtime config) for small parallel follow-ups.

## 40. ✅ Simplify `docs/detailed/README.md` by removing ownership/status/TODO sections and keep only concise audience + canonical navigation links per review feedback.

## 39. ✅ Scaffold `docs/detailed/` domain docs (`items`, `boxes`, `printing`, `import_export`, `qr_codes`, `agentic-basics`, `item-flow`, `review-flow`) from template with draft status, single-owner fields, core concepts, and likely code pointers for parallel authoring.

## 39. ✅ Add `docs/detailed/README.md` as the detailed-docs navigation root with purpose/audience, ownership metadata, planned-doc status table, and canonical links to architecture/agent/overview docs.

## 34. ✅ Clean documentation inputs for v2.3: move stale plan/input docs to `docs/archive/plans`, add `docs/PLANNING_V_2_3.md`, and keep current bugs scoped in `docs/BUGS.md` for actionable release work.

## 33. ✅ Introduce versioned highlights process: split `docs/RECENT_HIGHLIGHTS.md` into v2.2 historical notes and a v2.3 upcoming section so release history stays auditable between versions.

## 32. ✅ Re-baseline planning documentation: clear active plan backlog in `docs/PLANS.md` (no current plans) and centralize implementation change logs in `docs/RECENT_HIGHLIGHTS.md` to keep release docs concise and auditable.

## 31. ✅ Build a release-documentation audit map and complete the `docs/ARCHITECTURE.md` release-alignment pass (backend/frontend layout, export mode naming, and Langtext contract wording) so doc refresh can proceed in small, reviewable batches with minimal structural churn.

## 30. ✅ Expand `README.md` with an aligned functionality overview (inventory, CSV/ERP, agentic, QR/print), keeping quick-start concise while restoring enough depth for onboarding context.

## 29. ✅ Refresh `README.md` so onboarding highlights current mediator goals (inventory + ERP + agentic review), links canonical docs, and removes stale deep-dive runtime guidance that drifts from maintained setup documentation.

## 26. ✅ Tighten `backend/ops/10-validate.ts` validation telemetry: resolve `itemUUID`/`ItemUUID` aliases before warning, guard alias extraction with try/catch, and include `rowNumber` + `Artikel-Nummer` + key-variant metadata in missing-UUID warnings without changing persistence behavior.

## 15. ✅ Refresh `.env.example` coverage for backend/agentic ERP config keys (including mirror destination + browser-parity import toggles) to reduce hidden runtime defaults.
