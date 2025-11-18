# Project setup

## Environment configuration

<!-- TODO(agent): Re-run onboarding instructions after the Postgres container naming shifts. -->
<!-- TODO(agent): Validate the documented SQLite-to-Postgres migration steps after the next data refresh. -->

1. Copy `.env.example` to `.env` for local development.
2. Populate the Shopware **search** variables before enabling read-only lookups. Leaving any required value blank keeps the integration disabled automatically:
   - `SHOPWARE_BASE_URL` must include the protocol (e.g. `https://shopware.example.com`).
   - Provide either `SHOPWARE_CLIENT_ID` and `SHOPWARE_CLIENT_SECRET`, or set a pre-generated `SHOPWARE_ACCESS_TOKEN` / `SHOPWARE_API_TOKEN`.
   - Set `SHOPWARE_SALES_CHANNEL_ID` (or `SHOPWARE_SALES_CHANNEL`) to the channel that should receive mediator updates.
   - Adjust `SHOPWARE_REQUEST_TIMEOUT_MS` if the default 10s window is too short for your environment.
3. Flip `SHOPWARE_ENABLED=true` only after all required values are in place. Leaving it as `false` keeps Shopware search disabled even if credentials are present.
4. Leave the queue-related flags (`SHOPWARE_SYNC_ENABLED`, `SHOPWARE_API_BASE_URL`, `SHOPWARE_QUEUE_POLL_INTERVAL_MS`) at their defaults. The background worker is intentionally disabled until the HTTP dispatch client is implemented.
5. Set `IMPORTER_FORCE_ZERO_STOCK=true` to automatically override all CSV row quantities to zero during ingestion. When this flag is omitted or left `false`, operators can trigger a single zero-stock upload by calling `/api/import?zeroStock=true`.
6. Keep `DATABASE_URL` pointed at the bundled Postgres service (`postgres://mediator:mediator@postgres:5432/mediator`). Only remove it when you explicitly want the SQLite fallback, and remember to set `DB_PATH` in that scenario so the backend knows which file to open.

## Provisioning services

1. Start the local dependencies with Docker Compose: `docker compose up -d`. The bundled configuration launches Postgres alongside the mediator so the backend can connect via the Compose network aliases. With this wiring, Postgres is always used because `DATABASE_URL` is defined in `docker-compose.yml`.
2. After the containers stabilise, run your migration/verification scripts (for example `npm run migrate` when available or `node scripts/verify-agentic-migration.js` for schema checks) to confirm the Postgres schema matches the latest models before exercising new features.
3. If you swap in an external Postgres instance, update the `.env` variables (`DATABASE_URL`, `PGHOST`, etc.) accordingly and document the change so teammates inherit the correct connection string. The service emits `[persistence] Postgres connectivity verified.` after a healthy connection check, so you can confirm the new host is reachable without attaching a debugger.
4. When running the mediator against the host-installed Ollama daemon, ensure Docker has access to the host gateway. The Compose stack now resolves `host.docker.internal` automatically; confirm the daemon listens on `http://127.0.0.1:11434` (default) so the container can reach `http://host.docker.internal:11434` without extra port publishing.

> **Tip:** Variables can also be injected directly via your process manager or deployment platform if you prefer not to use a `.env` file.

## Agentic run dispatch lifecycle

- Triggering `startAgenticRun`/`restartAgenticRun` records the queued run and returns immediately; the Node.js event loop schedules the model invocation with `setImmediate`, so no dedicated worker loop needs to be enabled for this hop.
- After restarts the orchestrator scans the `agentic_runs` table for any rows still marked `queued` or `running` and resubmits them automatically, so in-flight work survives process crashes without manual intervention.
- Request logs capture both stages automatically: the queue handoff is stored as `queued`, and a background transition updates the row to `running` (or `failed`) using `recordAgenticRequestLogUpdate` if the asynchronous invocation encounters an error.
- Monitor the `agentic_runs` table or the request log endpoints to confirm progress; the UI will reflect the `running` state as soon as the asynchronous dispatcher updates the row.

## Handling credentials securely

- Never commit populated `.env` files or plaintext credentials to the repository.
- Prefer secret managers (e.g. Doppler, Vault, AWS/GCP/Azure Secrets Manager) or your container orchestration platform to store Shopware credentials.
- When sharing credentials with teammates, use encrypted channels or password managers instead of chat or email.
- Rotate Shopware API keys periodically and immediately after personnel changes.

## Networking note

If the firewall is enabled on your host, remember to open the HTTP port used by the mediator service. For example:

```bash
sudo ufw allow 3000
```

## Troubleshooting Postgres connectivity

- Watch the mediator startup logs for `[persistence] DATABASE_URL` warnings. `backend/persistence/connection.ts` logs when the `pg` dependency cannot be loaded, when pool creation throws, or when the backend falls back to SQLite because the variable is missing.
- Confirm the Postgres healthcheck status in Docker Compose (`docker compose ps` or `docker compose logs postgres`) before debugging application code. The included healthcheck reports when the database is still booting or rejecting connections.
- Investigate `[persistence] Postgres connectivity check failed` entries when authentication or networking is misconfigured; the attached stack trace includes the root cause from the `pg` client.
- When the service emits repeated connection retries, double-check that migrations have been applied—the tables listed in the log payload should align with the latest definitions under `models/`.

## SQLite fallback and migrations

- Only define `DB_PATH` when you intentionally run the SQLite fallback (for example, during quick CLI-driven tests). Leave the variable unset in `.env` and Compose when Postgres is available so the connection pool is used by default.
- To migrate historical SQLite data into Postgres, follow the [step-by-step guide in `README.md`](../README.md#migrating-sqlite-data-to-postgres). It covers exporting the `.sqlite` file, importing via `pgloader` or `psql`, and verifying logs so operators know when it is safe to delete the file.

## registry

- If the personal access token expires, regenerate it and login again to the registry: echo THE_NEW_PAT | docker login ghcr.io -u ZbindenDaniel --password-stdin
