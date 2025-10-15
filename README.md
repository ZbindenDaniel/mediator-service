a small service to map items to the boxes their stored in and the location they're placed.
the workflow is very basic: items are created according to a predefined scheme. items are either placed on a new or existing box. boxes are linked to a location.
when creating a box a label with key values and a qr code is printed to allow for inspection of a boxes content.

## QR scanning

Generated QR codes encode a JSON payload that always contains the Behälter identifier under the `id` key and may include extra
metadata (e.g., `label`, `location`, or `items`). The new `/scan` route in the React application uses the browser camera via the
`BarcodeDetector` API to read the QR code, validate the JSON, and route to `/boxes/{id}` after a successful scan. Every scan is
POSTed to `/api/qr-scan/log` so the backend can audit activity and correlate payload metadata with existing Behälterdaten.

## Development notes

- The server serves frontend static files from `dist/frontend/public` when running the compiled build. During development, if `dist/frontend/public/index.html` is missing the server will fall back to the workspace `frontend/public` directory.

- The `prebuild` script compiles `frontend/public/styles.scss` to CSS (or creates an empty placeholder if `sass` is unavailable) so the browser never loads a missing stylesheet during tests or CI runs.

- The `build` script (see `package.json`) runs the Sass prebuild step, compiles TypeScript, bundles the frontend, and copies `frontend/public` into `dist/frontend/public` so the compiled server can run without requiring manual copying.

- Runtime configuration is sourced from environment variables. Create a `.env` file in the repository root to override defaults (e.g., ports or paths); the server automatically loads it on startup for both TypeScript and compiled builds.

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
  -e AGENTIC_API_BASE=https://agentic.example/api \
  -e TLS_CERT_PATH=/etc/mediator/tls/server.crt \
  -e TLS_KEY_PATH=/etc/mediator/tls/server.key \
  -v mediator-data:/var/lib/mediator \
  -v mediator-media:/app/dist/backend/media \
  -v /etc/mediator/tls:/etc/mediator/tls:ro \
  mediator-service
```

The provided [`docker-compose.yml`](./docker-compose.yml) offers the same defaults and can be started with:

```bash
docker-compose up --build
```

Override values by editing the `environment` block, supplying a Compose `env_file`, or creating a repository-level `.env` file that the runtime automatically reads.

### Critical runtime environment

- `HTTP_PORT` – HTTP listener inside the container (default `8080`). Update published ports when changing this value.
- `PUBLIC_HOSTNAME` – externally reachable hostname or IP embedded into generated links and QR codes.
- `DB_PATH` – filesystem path to the SQLite database; map it onto persistent storage so data survives container restarts.
- `INBOX_DIR` – directory where imported CSV files are staged; persist or share this path with automation that drops new files.
- `ARCHIVE_DIR` – directory that receives processed CSV files; persist alongside the inbox for auditing.
- `AGENTIC_API_BASE` – base URL for the external agent integration; expose the network so the container can reach the service.
- `TLS_CERT_PATH` / `TLS_KEY_PATH` – PEM-encoded certificate and key that enable the optional HTTPS listener when both are present.

### Recommended volumes

- SQLite database and CSV state: mount a host path or Docker volume at `/var/lib/mediator` (or the directories referenced by `DB_PATH`, `INBOX_DIR`, and `ARCHIVE_DIR`).
- Media assets: mount persistent storage at `/app/dist/backend/media` to retain uploaded files and generated label PDFs.
- TLS material: mount certificate and key files read-only at the paths supplied via `TLS_CERT_PATH` and `TLS_KEY_PATH`.

### Optional dependencies

- **Printing:** The runtime image includes `cups-client` so the `lp` command is available. Provide printer access by configuring `PRINTER_HOST`/`PRINTER_PORT` and ensuring the container can reach the target CUPS server or USB-forwarded device. Mount any additional printer profiles under a directory of your choice and reference it in the Compose file if needed.
- **TLS certificates:** Mount certificate and key files (see volume recommendations above) and set `TLS_CERT_PATH`/`TLS_KEY_PATH` to their in-container locations.
- **Additional automation:** Any process that feeds the inbox or consumes exports should use bind mounts or shared volumes pointed at `INBOX_DIR`, `ARCHIVE_DIR`, and the media directory.

### TLS and public URL configuration

- `PUBLIC_HOSTNAME` controls the hostname used in generated URLs and log messages. It defaults to the historical `192.168.10.196` value when not provided.
- `PUBLIC_PROTOCOL` and `PUBLIC_PORT` allow overriding the protocol/port pair that appears in generated QR codes and links. When unset the server will automatically prefer `https` whenever both `TLS_CERT_PATH` and `TLS_KEY_PATH` are supplied; otherwise it falls back to `http` on the configured `HTTP_PORT`.
- `PUBLIC_ORIGIN` can be used to override the entire origin (protocol + hostname + port) if finer control is required. When absent the origin is derived from the protocol/host/port variables above.
- `TLS_CERT_PATH` and `TLS_KEY_PATH` should point to PEM-encoded certificate and key files. When both are provided the server launches an HTTPS listener on `HTTPS_PORT` (default `8443`) in addition to the HTTP listener. Missing or unreadable files are logged and HTTPS is skipped.
- `BASE_QR_URL` and `BASE_UI_URL` still accept explicit overrides, but now default to `${PUBLIC_ORIGIN}/qr` and `${PUBLIC_ORIGIN}/ui` respectively so generated QR codes and labels remain consistent with the configured public endpoint.

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

<!-- TODO: Document CLI flags once watch/filter support lands in the harness. -->

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
