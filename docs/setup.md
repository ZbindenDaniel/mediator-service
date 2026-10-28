# Setup & Operations

Local development, the Docker stacks, deployment, and the one-off operational tasks. Every
environment variable is described in [ENVIRONMENT.md](ENVIRONMENT.md).

## Local development

```bash
npm install
cp .env.example .env            # set DATABASE_URL, e.g. postgres://mediator:mediator@127.0.0.1:5432/mediator
docker compose up -d postgres   # Postgres on 127.0.0.1:5432
npm start                       # build + run on http://localhost:8080
```

- The schema is created on first start; there is no separate migration step.
- PDF labels need a headless Chromium on the host (`sudo apt-get install -y chromium`, `PRINT_RENDERER=chromium`).
  The Docker image already includes it.
- For a local model, run Ollama on the host. Inside Compose the container reaches it at
  `http://host.docker.internal:11434`.

## Compose stacks

| File | Use | Services |
|---|---|---|
| `docker-compose.yml` | Dev / single host | `postgres`, `cups`, `mediator`, `proxy` (nginx: TLS + Basic Auth + rate limit), `authentik-*` |
| `docker-compose.prod.yaml` | Production VM | `postgres`, `cups`, `mediator` behind an external Traefik (`erfassung.${VM_IP}.nip.io`) |
| `docker-compose.usb.yml` | Overlay | USB printer passthrough to `cups`; add with `-f` to either stack |

Mounts that matter on the `mediator` service:

- `cups-socket:/run/cups` — CUPS Unix socket shared with the `cups` service. `lpinfo`/`lpadmin` need the
  socket (CUPS 2.4 dropped device/PPD listing over TCP). If printer checks fail after a CUPS restart, check
  `docker compose exec mediator ls -l /run/cups` before restarting anything.
- `/mnt:/app/dist/backend/webDav` with `MEDIA_ROOT_DIR=/app/dist/backend/webDav` — WebDAV media root
  (photos in `shopbilder/`, ERP mirror in `shopbilder-import/`).
- `./config/alt-doc-dirs.json` — external document mounts (`ALT_DOC_DIRS_FILE`).

Printer setup (Raspberry Pi or the bundled `cups` service): [printer-server-setup](detailed/printer-server-setup.md).

### Ingress proxy (dev stack)

The `proxy` service is the only exposed entry point; don't publish the mediator directly.

1. `htpasswd -c ./secrets/htpasswd mediator` (keep it out of git). To rotate: replace the file, `docker compose restart proxy`.
2. TLS material at `./secrets/tls/tls.crt` and `tls.key`. Self-signed for a LAN IP:
   `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout secrets/tls/tls.key -out secrets/tls/tls.crt -subj "/CN=<ip>"`
3. Open the port if a firewall is on (`sudo ufw allow 443`). Logs: `docker compose logs proxy`.

### Authentik (forward-auth, opt-in)

The dev stack runs Authentik with its own Postgres and Redis. With the Authentik override active, a
reverse-proxy forward-auth injects `X-authentik-*` headers that the app resolves into
`{ user, tenant, role }` — logins, the real event-log actor, role-gated admin, and tenant stamping +
scoping all follow. Without the override the stack stays on Basic Auth, with `ADMIN_SECRET` and
`INTAKE_TOKEN` as the gates (nothing changes for the existing deployment).

The full ordered setup, the clicks in Authentik, verification (`/api/whoami`, the spoof test) and
troubleshooting live in the runbook: [`docs/detailed/identity-provider.md`](detailed/identity-provider.md).
In short:

1. In `.env`: `AUTHENTIK_SECRET_KEY` (`openssl rand -base64 60`), `AUTHENTIK_PG_PASSWORD`,
   `AUTHENTIK_BOOTSTRAP_PASSWORD`, and `TENANT_GROUP_MAP` (group → tenant/role, see the runbook).
2. Start **with the override**: `docker compose -f docker-compose.yml -f docker-compose.authentik.yml up -d --build`
   (prod: `AUTHENTIK_ENABLED=true` + `docker-compose.prod.authentik.yaml`). Check all `authentik-*`
   containers are healthy. Authentik's admin UI: `http://<host>:${AUTHENTIK_PORT:-9000}/if/admin/`, login `akadmin`.
3. Open the app through the proxy (`https://<host>`), log in, and confirm `GET /api/whoami` shows your
   user, tenant and role. Drop Basic Auth only once this is verified on the host.

## CI/CD (Gitea Actions)

- **Build** — `.gitea/workflows/docker-publish.yaml` builds the root `Dockerfile` on every push to `main`,
  on `v*.*.*` tags and on manual dispatch, and pushes to the Gitea container registry
  (`<gitea-host>/zbindendaniel/mediator-service`, tags `latest`, `main`, `sha-<commit>`, semver). Auth uses
  the run's built-in token; no PAT needed. Requires an `act_runner` with label `ubuntu-latest` and Docker.
- **Deploy** — `.gitea/workflows/deploy.yaml`, manual only. Inputs: `tag` (default `latest`), `deploy_dir`
  (default `/opt/mediator`), `ssh_port`. It copies `docker-compose.prod.yaml` to the host, then
  `MEDIATOR_IMAGE=<gitea>/…:<tag> docker compose -f docker-compose.prod.yaml pull mediator && up -d mediator`.
  Only `mediator` is rolled; postgres and cups stay up. `.env` must already exist in `deploy_dir`.
  Secrets: `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER` (in the `docker` group), `DEPLOY_SSH_KEY`. The runner must
  reach the host on `ssh_port`.
- Without `MEDIATOR_IMAGE`, `docker-compose.prod.yaml` falls back to the old
  `ghcr.io/zbindendaniel/mediator-service:3.0` image. Pulling from ghcr needs a PAT:
  `echo <PAT> | sudo docker login ghcr.io -u ZbindenDaniel --password-stdin`.

## One-off operations

- **SQLite → Postgres** (only when upgrading a pre-Postgres deployment; tables must be empty):
  ```bash
  docker cp /path/to/mediator.sqlite mediator:/tmp/mediator.sqlite
  docker compose exec -e DB_PATH=/tmp/mediator.sqlite mediator node scripts/migrate-sqlite-to-postgres.js
  ```
  Compare the row-count summary it prints with the source.
- **Category value normalization**: `scripts/normalize-category-values.js` (see [scripts/](../scripts/README.md)).
- **Backup**: Admin page → Backup downloads a ZIP of items, boxes, agentic runs and events that
  `/api/import` can restore. Raw volume copy:
  `sudo cp -r /var/lib/docker/volumes/mediator-data/_data <dest>/`.

## Troubleshooting

- **Startup fails / crash-loops**: read the first error from `initDb()` in the container log. Postgres
  health: `docker compose ps`, `docker compose logs postgres`.
- **ERP sync returns 503 `credentials_missing`**: `ERP_IMPORT_URL`, `ERP_IMPORT_USERNAME` and
  `ERP_IMPORT_PASSWORD` must all be set. Media mirror success shows as `[erp-sync] media_copy_result status=success`.
- **Agentic runs stall or return empty JSON**: see `MODEL_NUM_CTX` and the model timeouts in
  [ENVIRONMENT.md](ENVIRONMENT.md#agentic-model-configuration), and [agentic-basics](detailed/agentic-basics.md).
