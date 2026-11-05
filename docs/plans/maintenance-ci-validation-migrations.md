# Preventive maintenance: CI/CD, fail-loud validation, versioned migrations

Status: **Plan, not started.** Five work packages, each shippable on its own, in the order below.
Open decisions are at the end. Tick a package off by moving what is still true into
[`detailed/deployment.md`](../detailed/deployment.md) / the folder READMEs and deleting it here.

## Where we are (2026-11)

| Area | Today | Gap |
|---|---|---|
| Tests | ~250 test files, ~1229 passing under `npx jest -c jest.config.cjs`; coding agents run them on every change | `npm test` goes through a custom harness (`scripts/run-tests.js` + `test/harness.js`) that lacks `it.each` → aborts (todo 0z5). Nothing runs the tests on push. |
| Build | `.gitea/workflows/docker-publish.yaml` builds + pushes an image on every push to `main` / `v*` tag | No `tsc`/test/contract gate: a red tree still becomes `latest`. |
| Deploy | `.gitea/workflows/deploy.yaml`, manual, SSH → `compose pull` + `up -d mediator` | No pre-deploy backup, no health check, no rollback step. |
| Backup | none in the repo | No `pg_dump` script, no restore procedure, never test-restored. |
| Contracts | `npm run contracts:check` exists and exits 1 on problems | Not run anywhere automatically. `backend/contracts/registry.ts` `loadJsonFile` swallows parse errors → a broken file silently becomes "no contract" (intake #914). |
| Schema | `initDb()` in `backend/db.ts` runs ~50 idempotent `CREATE … IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / guarded `DO $do$` blocks on every boot | No record of what ran; renames/backfills/data fixes need hand-run scripts (`normalize-category-values`, `fix-integer-columns`, the pending "additive-migration batch"). |

---

## WP1 — CI gate (≈ ½–1 day)

Goal: nothing reaches the registry unless it compiles and the suite is green.

1. **Make `npm test` = Jest.** Point the script at `jest -c jest.config.cjs` (keep `prebuild`), delete
   `scripts/run-tests.js` + `test/harness.js` once the full suite passes under plain Jest. Resolves todo 0z5.
   *Why not extend the harness:* Jest already runs the whole suite; a second runner is a second thing to keep in sync.
2. **New `.gitea/workflows/ci.yaml`** on every push and PR:
   `npm ci` → `npx tsc -p tsconfig.json --noEmit` → `npm test` → `npm run contracts:check` → `npm run bundle`.
   Cache `~/.npm` keyed on `package-lock.json`.
3. **Gate the publish.** Move the build-and-push job into the same workflow as `publish`, `needs: test`,
   `if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')`; delete `docker-publish.yaml`.
   (`needs` only works within one workflow; Gitea's `workflow_run` support is too thin to rely on.)
   Drop the "Debug token presence" step while at it.
4. **Contract JSON lint** comes for free via `contracts:check` (resolves todo 0z7) — verify it fails on a
   deliberately broken file before calling it done.

**Done when:** a commit with a failing test on `main` produces a red run and no new image tag.

## WP2 — Backup + safer deploy (≈ 1–1½ days)

Goal: every deploy is preceded by a restorable snapshot, and a bad deploy is noticed and reversible.

1. **`scripts/ops/backup-db.sh`** (runs on the host, in the deploy dir):
   `docker compose … exec -T postgres pg_dump -U mediator -Fc mediator > backups/mediator-<UTC timestamp>-<label>.dump`,
   verify with `pg_restore --list` (non-empty), prune to the retention policy. Exit non-zero on any failure.
2. **`scripts/ops/restore-db.sh <dump>`**: restore into a **scratch** Postgres container by default
   (`--into-prod` must be explicit), then run a row-count sanity query. This is also the restore test.
3. **Nightly backup** on the host (systemd timer or cron calling `backup-db.sh nightly`). Documented, not
   installed by CI.
4. **`deploy.yaml` gets three steps around the existing `pull` / `up -d`:**
   - before: record the running image (`docker inspect`) and run `backup-db.sh pre-deploy-<tag>`; abort the deploy if it fails;
   - after: poll `GET /api/health` (already exists, `backend/actions/health.ts`) for up to ~90 s;
   - on failure: `up -d` the recorded previous image and fail the run. Schema is still forward-only
     (see WP4), so a rollback is safe as long as migrations stay additive — the dump is the fallback for the rest.
5. **Monthly restore drill** (documented checklist in `detailed/deployment.md`): restore the latest
   nightly dump into a scratch container, start the app against it, open one item. A backup that was never restored is a hope, not a backup.

**Done when:** a deploy run shows a dump file in its log, a forced-unhealthy deploy rolls back by itself,
and one restore drill has been done and noted.

## WP3 — Fail loudly on bad configuration (≈ 1 day)

Goal: a broken contract or config stops the app at boot with a precise message, instead of degrading silently.

1. **Validate contracts at startup.** Call the same `loadContractSetFromDisk` + `validateContractSet` as
   `contracts:check` from `server.ts` before `initDb`. Errors → log every problem and exit 1 (same pattern
   as the existing fatal "Failed to load category taxonomy seed" path).
2. **Stop swallowing in `registry.ts`.** `loadJsonFile` keeps returning `null` for a *missing* file
   (legitimate: no contract for that code) but logs + rethrows a *parse* error. With (1) in place this can
   only fire if a file changes at runtime (overlay dir / admin upload), so make the admin upload path
   validate before writing.
3. **Env config check.** One zod schema (zod is already a dependency) for the env vars `config.js` reads;
   on boot fail on missing required ones, warn on unknown values (today `EVENT_LOG_LEVELS` already warns
   — extend that pattern instead of inventing a new one).

**Done when:** a deliberately broken `contracts/quality/*.json` or a missing `DATABASE_URL` makes the
container exit with a one-line reason, and CI (WP1) catches the contract case before it is ever built.

## WP4 — Versioned migrations (≈ 1½–2 days)

Goal: every schema/data change after today is recorded, ordered, runs once, and is safe with several instances.

1. **Freeze the baseline.** The current `initDb()` DDL stays exactly as is — it is the baseline and already
   idempotent on every existing database. No rewrite. A comment marks it "frozen — new changes go to migrations/".
2. **Runner** (`backend/db/migrate.ts`, called at the end of `initDb()`):
   - table `schema_migrations (id INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TIMESTAMPTZ)`;
   - files `backend/db/migrations/NNNN_short_name.sql` (plain SQL first; `.ts` only when a data fix needs code);
   - takes `pg_advisory_lock(<constant>)` for the whole run — multi-instance boots must not race
     (see the multi-instance decision in `todo.md`);
   - each migration in its own transaction; on error: rollback, log the file name, **exit 1** (no half-booted app);
   - checksum mismatch on an already-applied file → refuse to boot (someone edited history).
3. **Forward-only + additive by default.** Destructive steps (drop/rename) go in a *later* release than the
   code that stops using them (expand → migrate → contract), so the WP2 image rollback keeps working.
4. **First real migrations** to prove it: move the pending one-off scripts in —
   `normalize-category-values` (todo 0v2) and the `items."Location"` cleanup (todo P1 "stale device name").
5. **CI:** a job that boots Postgres, runs `initDb()` on an **empty** DB and on a **baseline snapshot**
   (schema-only dump of today's prod shape, committed under `test/fixtures/`), and runs all migrations twice
   (second run must be a no-op).

**Done when:** `0v2` runs itself on the next deploy and `SELECT * FROM schema_migrations` on prod shows it.

## WP5 — Postgres integration tier (≈ 1–2 days, after WP4)

Goal: test what mocks can't — locking, constraints, real SQL.

- CI job with a Postgres service container; a `test/integration/` Jest project (separate config, excluded
  from the default fast run so agents keep their quick loop; `npm run test:integration` to opt in).
- First ~10 tests, chosen by risk: queue claiming with `FOR UPDATE SKIP LOCKED` (two concurrent claimers
  never get the same run), stale-run recovery, ERP export approval gate (`stageItemsExport`), graduation
  UUID swap cascading through FKs, migrations on empty + baseline DB (from WP4).

**Done when:** the integration job is green in CI and a reintroduced double-claim bug turns it red.

---

## Explicitly not in this plan

- **Structured logging** (~915 `console.*` calls) — worth doing, but separate; WP3 covers the loudest silent failures.
- **Splitting `db.ts` / `agentic/index.ts`** — do it opportunistically per domain once WP1/WP5 give a safety net.
- **Automatic deploy on push** — deploy stays manual (one click, now with backup/health/rollback). Revisit after a few clean releases.
- **Dependency upgrades** (React 19, router 7, …) — easier once CI exists; add Renovate after WP1.

## Open decisions

1. **Runner capability:** can the Gitea runner start a Postgres service container (`services:` or host
   `docker run`)? `docker-publish.yaml` uses the host Docker CLI, so probably yes — needed for WP4 step 5 and WP5.
2. **Backup destination & retention:** local `backups/` on the host only, or also off-host (NAS / second
   server)? Suggested default: 14 nightly + 8 weekly + every pre-deploy dump for 30 days, with an off-host copy.
3. **Backup scope:** DB only, or also the `mediator-data` volume (inbox/archive) and media? Media on WebDAV
   presumably has its own backup — confirm.
4. **Strictness at boot (WP3):** hard-fail on any contract problem, or hard-fail only on parse errors and
   warn on semantic ones (unknown subcategory etc.)? Suggested: parse/shape = fail, unused codes = warn
   (matches `contracts:check` today).
