# Project setup

## Environment configuration

<!-- TODO(agent): Re-run onboarding instructions after the Postgres container naming shifts. -->

1. Copy `.env.example` to `.env` for local development.
2. Populate the Shopware **search** variables before enabling read-only lookups. Leaving any required value blank keeps the integration disabled automatically:
   - `SHOPWARE_BASE_URL` must include the protocol (e.g. `https://shopware.example.com`).
   - Provide either `SHOPWARE_CLIENT_ID` and `SHOPWARE_CLIENT_SECRET`, or set a `SHOPWARE_ACCESS_TOKEN` (API key). Both auth modes are supported.
   - Set `SHOPWARE_SALES_CHANNEL_ACCESS_KEY` to the sales-channel API access key (the `sw-access-key`, not the UUID). Legacy `SHOPWARE_SALES_CHANNEL_ID` / `SHOPWARE_SALES_CHANNEL` are still accepted.
   - Adjust `SHOPWARE_REQUEST_TIMEOUT_MS` if the default 10s window is too short for your environment.
   - Use the Admin **Shopware-Verbindung** card ("Verbindung testen") to confirm the credentials reach the instance.
3. Flip `SHOPWARE_ENABLED=true` only after all required values are in place. Leaving it as `false` keeps Shopware search disabled even if credentials are present.
4. Leave `SHOPWARE_SYNC_ENABLED` at its default `false`. It gates sync-queue enqueue; the dispatcher that would send jobs to Shopware is not yet implemented, so enabling it only accumulates jobs. (The dead `SHOPWARE_API_BASE_URL` / `SHOPWARE_QUEUE_POLL_INTERVAL_MS` flags were removed.)
5. Set `IMPORTER_FORCE_ZERO_STOCK=true` to automatically override all CSV row quantities to zero during ingestion. When this flag is omitted or left `false`, operators can trigger a single zero-stock upload by calling `/api/import?zeroStock=true`.
6. Media storage defaults to local for development (`MEDIA_STORAGE_MODE=local`) with a fixed local path `dist/media`; container deployments should set `MEDIA_STORAGE_MODE=webdav` with `MEDIA_ROOT_DIR` as an absolute mounted filesystem root so fixed paths resolve to `<root>/shopbilder` and `<root>/shopbilder-import` (URLs are rejected).
7. `/api/sync/erp` image mirroring uses `<MEDIA_ROOT_DIR>/shopbilder-import` by default (derived `ERP_MEDIA_MIRROR_DIR`). Confirm backend logs include `[sync-erp] script_finished` with `mediaCopyStatus: 'success'` plus script output line `[erp-sync] media_copy_result status=success ... source_count=<n> destination_count=<n>`.
8. Keep cleanup minimal in runtime flows: avoid broad recursive cleanup in mounted media roots; use dedicated maintenance scripts when cleanup is required.

## printing 
the print job need to renderPDFs from the html templates. This need to happen headless --> chromium
> sudo apt-get install -y chromium
> 
The Compose mount now binds `/run/cups` into the mediator container, so CUPS socket updates are usually visible without forcing container recreation.
For WebDAV media roots, Compose should mount the host parent media root (for example `/mnt`) into `/app/dist/backend/webDav` and set `MEDIA_ROOT_DIR=/app/dist/backend/webDav` so runtime-derived fixed paths resolve to `/app/dist/backend/webDav/shopbilder` and `/app/dist/backend/webDav/shopbilder-import`.
If printer checks fail after a CUPS restart, first verify `/run/cups` is visible inside the mediator container (for example `docker compose exec mediator ls -l /run/cups`) before restarting the container.

## Provisioning services

1. Start the local dependencies with Docker Compose: `docker compose up -d`. The bundled configuration launches Postgres alongside the mediator so the backend can connect via the Compose network aliases.
2. **SQLite → PostgreSQL data migration (one-time, only when upgrading from a SQLite deployment):**

   Runs inside the already-running mediator container — no separate service or network config needed.

   ```bash
   # 1. Copy the SQLite file into the running container
   docker cp /path/to/mediator.sqlite mediator:/tmp/mediator.sqlite

   # 2. Run the migration script inside the container
   docker compose exec -e DB_PATH=/tmp/mediator.sqlite mediator node scripts/migrate-sqlite-to-postgres.js
   ```

   The script prints a row-count summary at the end — verify the numbers match your SQLite source.
   **Skip this step for fresh installations** — the backend creates all tables automatically on first start.
   > Note: the script is safe to re-run only when the Postgres tables are empty. If you need to re-run it, truncate the target tables first.
3. If you swap in an external Postgres instance, update the `.env` variables (`DATABASE_URL`, `PGHOST`, etc.) accordingly and document the change so teammates inherit the correct connection string.
4. When running the mediator against the host-installed Ollama daemon, ensure Docker has access to the host gateway. The Compose stack now resolves `host.docker.internal` automatically; confirm the daemon listens on `http://127.0.0.1:11434` (default) so the container can reach `http://host.docker.internal:11434` without extra port publishing.

## Ingress proxy (TLS + Basic Auth)

The public ingress is now handled by the `proxy` service, which terminates TLS, enforces Basic Auth, and rate limits inbound requests before forwarding to the mediator container. The mediator itself should not be exposed directly.

1. Create the auth file (store it outside of source control, e.g. `./secrets/htpasswd`): `htpasswd -c ./secrets/htpasswd mediator`.
2. Provide TLS material at `./secrets/tls/tls.crt` and `./secrets/tls/tls.key` (or adjust the mount paths in `docker-compose.yml`).
3. Start the stack with `docker compose up -d` and verify traffic is served through `https://<host>` only.
4. Review proxy access/error logs in the `nginx-logs` volume (`/var/log/nginx/access.log` and `/var/log/nginx/error.log`) for authentication visibility.

sudo openssl req -x509 -nodes -days 365   -newkey rsa:2048   -keyout secrets/tls/tls.key   -out secrets/tls/tls.crt   -subj "/CN=192.168.10.202"


### Credential rotation

1. Replace `./secrets/htpasswd` with the new credentials.
2. Restart the proxy container: `docker compose restart proxy`.
3. Confirm the new credentials are required and audit the access log for expected logins.

## Authentik (user management)

`docker-compose.yml` bundles [Authentik](https://goauthentik.io/) as the user-management / SSO
provider: `authentik-server`, `authentik-worker`, plus a dedicated `authentik-postgresql` and
`authentik-redis` (separate from the mediator database). This is **Phase 1 — the services are stood
up for an admin to configure, but nothing is enforced yet.** The nginx Basic Auth ingress is
unchanged, and the backend does not yet read any Authentik identity. Wiring forward-auth (nginx
`auth_request` / Traefik `forwardAuth` → the Authentik outpost, with the backend reading
`X-authentik-username` / `X-authentik-groups` for admin-vs-user roles) is the deliberate follow-up
tracked by the `# TODO(ingress-auth)` markers.

1. Set the Authentik variables in `.env` (see `.env.example` / `docs/ENVIRONMENT.md`). At minimum:
   - `AUTHENTIK_SECRET_KEY` — generate with `openssl rand -base64 60`.
   - `AUTHENTIK_PG_PASSWORD` — a strong password for Authentik's own Postgres.
   - `AUTHENTIK_BOOTSTRAP_PASSWORD` (and optionally `AUTHENTIK_BOOTSTRAP_EMAIL`) — the initial
     `akadmin` login, applied only on first boot.
   - Optionally pin `AUTHENTIK_TAG` to the current stable release.
2. Start (or update) the stack: `docker compose up -d`. Confirm all four `authentik-*` containers
   report healthy in `docker compose ps`; check `docker compose logs authentik-server` for a clean
   startup with migrations applied.
3. Open the admin UI at `http://<host>:${AUTHENTIK_PORT:-9000}/if/admin/` and log in as `akadmin`
   with the bootstrap password. From here admins create users and assign groups.
4. **Not yet wired:** the mediator app still authenticates via the existing proxy Basic Auth /
   `ADMIN_SECRET`. Do not remove those until the forward-auth follow-up lands.

> The manual deploy workflow (`.gitea/workflows/deploy.yaml`) only rolls the `mediator` service, so
> it will **not** start these new Authentik services on the host — bring them up once with a manual
> `docker compose up -d` (or extend the workflow) on the deployment host.

## Postgres rollout notes

- These notes reflect the current Compose-driven workflow; managed database guidance has not been documented yet.
- Compose defines the mediator/Postgres network so `DATABASE_URL` and the individual `PG*` variables can follow the `mediator`/`postgres` defaults without leaking secrets.
- After provisioning, run the migration and verification scripts to confirm every table matches the shared interfaces under `models/` and `backend/src/models/`; unresolved diffs risk runtime serialization errors.
- Startup logs surface `DATABASE_URL` warnings and connection retries—treat them as blockers and resolve before layering on new features.
- Healthcheck status from `docker compose ps` (or the container logs) is the quickest indicator of why local development cannot reach Postgres.

> **Tip:** Variables can also be injected directly via your process manager or deployment platform if you prefer not to use a `.env` file.

## Location bootstrap seeding

- During backend startup the `backend/db.ts` initialization seeds the `locations` table from `models/item-categories.ts`. Each category produces a row with ID `S-{code}-0001`, label `Regal {label}`, and current timestamps so rack labels stay consistent with the catalogue.
- The seed runs inside a transaction with `INSERT OR IGNORE` semantics and structured logging; repeated restarts or multiple instances won't throw conflicts and will emit how many rows were inserted.
- After adding or modifying categories, restart at least one backend instance (for example `npm start` after a build) so the seed executes. If a deployment skips the normal startup path, manually invoking the backend entrypoint ensures the bootstrap runs and prevents missing locations in production.
- Default shelf locations now rely on the per-subcategory mapping in `models/default-shelf-locations.ts`; missing mappings are logged and prevent automatic default shelf creation to avoid malformed IDs.

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

If the firewall is enabled on your host, remember to open the HTTPS port used by the proxy service. For example:

```bash
sudo ufw allow 443
```

## Troubleshooting Postgres connectivity

- Watch the mediator startup logs for `DATABASE_URL` warnings. The backend logs a structured message when it falls back to default credentials or encounters malformed connection strings, making it easier to spot typos.
- Confirm the Postgres healthcheck status in Docker Compose (`docker compose ps` or `docker compose logs postgres`) before debugging application code. The included healthcheck reports when the database is still booting or rejecting connections.
- When the service emits repeated connection retries, double-check that migrations have been applied—the tables listed in the log payload should align with the latest definitions under `models/`.

## registry

- If the personal access token expires, regenerate it and login again to the registry: echo THE_NEW_PAT | sudo docker login ghcr.io -u ZbindenDaniel --password-stdin

## CI/CD — automated image builds

A Gitea Actions workflow (`.gitea/workflows/docker-publish.yaml`) builds the root `Dockerfile` and
publishes the app image to **this Gitea instance's built-in container registry** (repo → Packages).
It runs on every push to `main`, on every `v*.*.*` release tag, and via manual dispatch.

- **No PAT needed.** CI authenticates with the token Gitea injects into each run
  (`secrets.GITHUB_TOKEN`), so the manual `docker login` above is only required for the legacy
  ghcr.io images, not for CI builds.
- **Image path:** `<gitea-host>/zbindendaniel/mediator-service`. Tags: `latest` (default branch),
  the semver version (e.g. `3.0.1` and `3.0`) on release tags, `main`, and `sha-<commit>`.
- **Pull on the VM:** `docker login <gitea-host>` (a read token/deploy user is enough), then
  `docker pull <gitea-host>/zbindendaniel/mediator-service:latest`.
- **Requirements:** an `act_runner` registered with an `ubuntu-latest` label, Docker available on the
  runner, and the Packages/registry feature enabled on the instance. If the runner can't fetch the
  `docker/*` actions from GitHub, the workflow ships a commented Docker-CLI-only fallback job.

> The `docker-compose.prod.yaml` image is now `${MEDIATOR_IMAGE:-ghcr.io/zbindendaniel/mediator-service:3.0}`
> — manual `docker compose up` still uses the pinned ghcr image, while the deploy workflow overrides
> `MEDIATOR_IMAGE` to the Gitea image. `docker-compos-V2_2.yaml` and `scripts/reploy.sh` still hardcode
> `ghcr.io`; repoint them when you fully cut over.

### Manual deploy workflow

`.gitea/workflows/deploy.yaml` is a separate, **manually-triggered** (`workflow_dispatch`) deploy. It
SSHes to the Docker host and rolls only the `mediator` service of `docker-compose.prod.yaml` onto a
chosen image tag (postgres/cups are left running). The image must already be published by
`docker-publish.yaml`.

**Trigger** from the repo's Actions tab → *Deploy (manual)* → Run, with inputs:
- `tag` — image tag to deploy (default `latest`; use a release version like `3.0.1` for a pinned deploy)
- `deploy_dir` — host directory holding `docker-compose.prod.yaml` and `.env` (default `/opt/mediator`)
- `ssh_port` — SSH port of the host (default `22`)

**What it does on the host:** `scp`s the current `docker-compose.prod.yaml` into `deploy_dir`, logs in
to the Gitea registry with the run's token, then `MEDIATOR_IMAGE=<gitea>/zbindendaniel/mediator-service:<tag>`
`docker compose -f docker-compose.prod.yaml pull mediator && up -d mediator`.

**Required Actions secrets** (repo → Settings → Actions → Secrets):
- `DEPLOY_SSH_HOST` — host/IP of the Docker VM
- `DEPLOY_SSH_USER` — SSH user (must be in the `docker` group)
- `DEPLOY_SSH_KEY` — private key for that user (the matching public key in the host's `authorized_keys`)

The registry pull uses the automatic `secrets.GITHUB_TOKEN`, so no separate registry credential is needed.
`.env` (with `VM_IP` and runtime config) must already exist in `deploy_dir` — the workflow never touches it.

> **Runner reachability:** the runner must be able to reach the host on `ssh_port`. For a LAN-only VM
> that means running `act_runner` on the LAN (or a jump path). Host-key checking uses `accept-new` on
> the ephemeral runner (trust-on-first-use); pre-seed a known_hosts entry if you need stricter checking.

# Data recovery

user@roti-fabrik ~> sudo cp -r /var/lib/docker/volumes/mediator-data/_data mediator/_data/
