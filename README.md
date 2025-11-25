a small service to map items to the boxes they're stored in and the location they're placed.

## What the mediator does
- Catalogues IT equipment (`ItemRef` + `itemInstances`) and tracks stock over time.
- Groups inventory into colour-coded boxes (Behälter) that link to warehouse sections for easy retrieval.
- Imports seed data from CSV (mirroring the ERP export) and supports future integrations such as Shopware.
- Offers an AI-assisted (agentic) enrichment workflow so partially known items can be completed via web research before human approval.
- Prints QR labels for boxes and larger items so warehouse staff can scan and inspect contents quickly.

See the refreshed [project overview](docs/OVERVIEW.md) and [architecture outline](docs/ARCHITECTURE.md) for the complete domain map, guiding principles, and current priorities.

<!-- TODO(agent): Keep dependency notices refreshed whenever `package-lock.json` changes. -->

<!-- TODO(agent): Reconfirm onboarding flow once the Postgres service splits into read/write nodes. -->

## QR scanning

Generated QR codes encode a JSON payload that always contains the Behälter identifier under the `id` key and may include extra
metadata (e.g., `label`, `location`, or `items`). The new `/scan` route in the React application uses the browser camera via the
`BarcodeDetector` API to read the QR code, validate the JSON, and route to `/boxes/{id}` after a successful scan. Every scan is
POSTed to `/api/qr-scan/log` so the backend can audit activity and correlate payload metadata with existing Behälterdaten.

## Documentation quick links
- [Project overview & roadmap](docs/OVERVIEW.md)
- [Architecture principles](docs/ARCHITECTURE.md)
- [Shopware integration plan](docs/Shopware\ integration.md)
- [Third-party licenses and notices](THIRD_PARTY_NOTICES.md)

## Development notes

- The server serves frontend static files from `dist/frontend/public` when running the compiled build. During development, if `dist/frontend/public/index.html` is missing the server will fall back to the workspace `frontend/public` directory.

- The `prebuild` script compiles `frontend/public/styles.scss` to CSS (or creates an empty placeholder if `sass` is unavailable) so the browser never loads a missing stylesheet during tests or CI runs.

- The `build` script (see `package.json`) runs the Sass prebuild step, compiles TypeScript, bundles the frontend, and copies `frontend/public` into `dist/frontend/public` so the compiled server can run without requiring manual copying.

- Runtime configuration is sourced from environment variables. Create a `.env` file in the repository root to override defaults (e.g., ports or paths); the server automatically loads it on startup for both TypeScript and compiled builds. Database settings follow the Docker Compose defaults (`DATABASE_URL`, `PGHOST`, etc.) so the backend connects to the bundled Postgres instance unless you override them.
- Start the local stack with `docker compose up -d` to launch Postgres and the mediator together. After the containers report healthy, run your migration or schema verification scripts to validate that the database matches the latest definitions.

## Container deployment

### Build the image

```bash
docker build -t mediator-service .
```

### Run the container

Use `docker run` to launch the service with explicit environment and volume mappings:

```bash
docker run --rm \
  -p 8080:8080 \
  -e HTTP_PORT=8080 \
  -e PUBLIC_HOSTNAME=mediator.local \
  -e DB_PATH=/var/lib/mediator/mediator.sqlite \
  -e INBOX_DIR=/var/lib/mediator/inbox \
  -e ARCHIVE_DIR=/var/lib/mediator/archive \
  -e TLS_CERT_PATH=/etc/mediator/tls/server.crt \
  -e TLS_KEY_PATH=/etc/mediator/tls/server.key \
  -v mediator-data:/var/lib/mediator \
  -v mediator-media:/app/dist/backend/media \
  -v /etc/mediator/tls:/etc/mediator/tls:ro \
  mediator-service
```

The provided [`docker-compose.yml`](./docker-compose.yml) offers the same defaults and can be started with:

```bash
docker compose up --build
```

Override values by editing the `environment` block, supplying a Compose `env_file`, or creating a repository-level `.env` file that the runtime automatically reads.

### Critical runtime environment

- `HTTP_PORT` – HTTP listener inside the container (default `8080`). Update published ports when changing this value.
- `PUBLIC_HOSTNAME` – externally reachable hostname or IP embedded into generated links and QR codes.
- `DB_PATH` – filesystem path to the SQLite database; map it onto persistent storage so data survives container restarts.
- `INBOX_DIR` – directory where imported CSV files are staged; persist or share this path with automation that drops new files.
- `ARCHIVE_DIR` – directory that receives processed CSV files; persist alongside the inbox for auditing.
- `TLS_CERT_PATH` / `TLS_KEY_PATH` – PEM-encoded certificate and key that enable the optional HTTPS listener when both are present.

### Agentic orchestrator configuration

- `AGENTIC_MODEL_PROVIDER` – selects the in-process agentic model backend (`ollama`, `openai`, etc.).
- `AGENTIC_OLLAMA_BASE_URL` / `AGENTIC_OLLAMA_MODEL` – host URL and model name when using Ollama.
- `AGENTIC_OPENAI_BASE_URL` / `AGENTIC_OPENAI_MODEL` / `AGENTIC_OPENAI_API_KEY` – OpenAI-compatible endpoint, model, and credentials.
- `AGENTIC_SEARCH_BASE_URL` / `AGENTIC_SEARCH_PORT` / `AGENTIC_SEARCH_PATH` – optional HTTP endpoint for delegated search enrichment.
- `AGENTIC_QUEUE_POLL_INTERVAL_MS` – interval (milliseconds) between in-process queue dispatch cycles.
- `TAVILY_API_KEY` / `SEARCH_WEB_ALLOWED_ENGINES` – API key and safelist for external web search fallbacks.
- `AGENT_API_BASE_URL` / `AGENT_SHARED_SECRET` – optional external callback for result notifications. Leave unset to default to the in-process persistence path; when configured, the service posts results to the external URL and relies on that callback to acknowledge completion.

### Recommended volumes

- SQLite database and CSV state: mount a host path or Docker volume at `/var/lib/mediator` (or the directories referenced by `DB_PATH`, `INBOX_DIR`, and `ARCHIVE_DIR`).
- Media assets: mount persistent storage at `/app/dist/backend/media` to retain uploaded files and generated label PDFs.
- TLS material: mount certificate and key files read-only at the paths supplied via `TLS_CERT_PATH` and `TLS_KEY_PATH`.

### Optional dependencies

- **Printing:** The runtime image includes `cups-client` so the `lp` command is available. Provide printer access by configuring `PRINTER_QUEUE` (optionally overriding `LP_COMMAND`, `LPSTAT_COMMAND`, and `PRINT_TIMEOUT_MS`) and ensuring the container can reach the target CUPS server or USB-forwarded device. Mount any additional printer profiles under a directory of your choice and reference it in the Compose file if needed.
- **TLS certificates:** Mount certificate and key files (see volume recommendations above) and set `TLS_CERT_PATH`/`TLS_KEY_PATH` to their in-container locations.
- **Additional automation:** Any process that feeds the inbox or consumes exports should use bind mounts or shared volumes pointed at `INBOX_DIR`, `ARCHIVE_DIR`, and the media directory.

### TLS and public URL configuration

- `PUBLIC_HOSTNAME` controls the hostname used in generated URLs and log messages. It defaults to the historical `192.168.10.196` value when not provided.
- `PUBLIC_PROTOCOL` and `PUBLIC_PORT` allow overriding the protocol/port pair that appears in generated QR codes and links. When unset the server will automatically prefer `https` whenever both `TLS_CERT_PATH` and `TLS_KEY_PATH` are supplied; otherwise it falls back to `http` on the configured `HTTP_PORT`.
- `PUBLIC_ORIGIN` can be used to override the entire origin (protocol + hostname + port) if finer control is required. When absent the origin is derived from the protocol/host/port variables above.
- `TLS_CERT_PATH` and `TLS_KEY_PATH` should point to PEM-encoded certificate and key files. When both are provided the server launches an HTTPS listener on `HTTPS_PORT` (default `8443`) in addition to the HTTP listener. Missing or unreadable files are logged and HTTPS is skipped.
- `BASE_QR_URL` and `BASE_UI_URL` still accept explicit overrides, but now default to `${PUBLIC_ORIGIN}/qr` and `${PUBLIC_ORIGIN}/ui` respectively so generated QR codes and labels remain consistent with the configured public endpoint.

### Deployment notes (agentic orchestrator)

1. Decommission the standalone `ai-flow-service` container or process; the mediator now embeds the orchestrator and queue worker.
2. After deploying a new version, run `node scripts/verify-agentic-migration.js /path/to/mediator.sqlite` (or the packaged equivalent) to confirm the `agentic_request_logs` schema exists before enabling traffic. _TODO:_ add this verification to the CI/CD pipeline so the check runs automatically.
3. Update your secrets manager or deployment environment to supply the `AGENTIC_*` variables above directly to the mediator container, including any provider credentials and the optional queue interval override.

### Troubleshooting Postgres connectivity

- Review mediator startup logs for any `DATABASE_URL` warnings; the backend emits them when falling back to default credentials or rejecting malformed connection strings.
- Check the Postgres container status via `docker compose ps` or `docker compose logs postgres` to confirm the healthcheck succeeded before debugging application code.
- When you encounter persistent connection retries, confirm that migrations have run—the table list in the log payload should match the schema under `models/` and `backend/src/models/`.

Quick commands:

```bash
# build (compiles TS, bundles frontend, copies public into dist)
npm run build

# start
npm start

# run tests (prebuild + node-based harness)
npm test

# run HTTP/HTTPS smoke checks (requires `npm run build` first)
npm run smoke
```

## Testing

_Follow-up:_ Document CLI flags once watch/filter support lands in the harness (Testing:owner@mediator, align with harness improvements milestone).

The custom harness in `scripts/run-tests.js` exposes Jest-style matchers and async helpers so `test/*.test.ts` specs can run without the full Jest runtime. Execute the suite with:

```bash
node scripts/run-tests.js
```

The script eagerly loads every `.test.ts` file, runs them through the in-process harness, and, when the optional Jest dependency is available, hands off to Jest using the project configuration for any suites that rely on its runtime. There is currently no built-in watch or name filtering support; rerun the command (or `npm test`) after making changes.

## Bulk inventory endpoints

The backend exposes JSON APIs for multi-item adjustments that mirror the single-item move and remove flows:

- `POST /api/items/bulk/move` – moves the provided `itemIds` into the target Behälter. The request requires `{ itemIds: string[], toBoxId: string, actor: string, confirm: true }`. The response reports the item identifiers that moved, the destination box, and the resolved location when available.
- `POST /api/items/bulk/delete` – decrements stock for each `itemIds` entry while logging events per item. The request requires `{ itemIds: string[], actor: string, confirm: true }`. The response lists the pre- and post-adjustment quantities along with `clearedBox` markers when the last unit was removed.

Both endpoints validate payloads, wrap database writes in transactions, and emit the same event log metadata as their single-item counterparts, keeping `Auf_Lager` counts accurate when removing stock.

## Agentic migration verification

Use the verification script to ensure the agentic run schema exists and that `backend/db.ts` can be loaded without TypeScript module errors:

```bash
node scripts/verify-agentic-migration.js path/to/mediator.sqlite
```

The script registers a TypeScript loader (falling back to a lightweight transpiler) before requiring the database module, so it should no longer throw `MODULE_NOT_FOUND` for `backend/db.ts`. If the script reports missing build artifacts or schema issues, rebuild the project before retrying.
