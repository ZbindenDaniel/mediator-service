# Environment Settings

Every environment variable the service reads, grouped by area. Most are parsed in `backend/config.ts`;
when you add one there, add it here too. `.env.example` holds a minimal local starting point.

## Core service configuration

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | Node runtime mode used by the agentic config parser. |
| `HTTP_PORT` | `8080` | Primary HTTP listener for the backend server. |
| `HTTPS_PORT` | `8443` | TLS listener when certificate/key paths are provided. |
| `TLS_CERT_PATH` | (unset) | Path to TLS certificate file to enable HTTPS. |
| `TLS_KEY_PATH` | (unset) | Path to TLS key file to enable HTTPS. |
| `PUBLIC_HOSTNAME` | `localhost` | Hostname used when building public URLs. |
| `PUBLIC_PROTOCOL` | `http` or `https` | Overrides scheme used for public links. |
| `PUBLIC_PORT` | `HTTP_PORT` or `HTTPS_PORT` | Overrides the port used in public URLs. |
| `PUBLIC_ORIGIN` | Derived | Full origin override for public URLs. |
| `BASE_QR_URL` | `${PUBLIC_ORIGIN}/qr` | Base URL used to build QR links. |
| `BASE_UI_URL` | `${PUBLIC_ORIGIN}/ui` | Base URL used for UI links from QR codes. |
| `ADMIN_SECRET` | (unset) | When set, `/api/admin/*` requires `Authorization: Bearer <secret>`. Unset = admin API open. |
| `CONFIG_STRICT` | `false` | Fail startup on unsupported legacy settings (e.g. `MEDIA_DIR`, `MEDIA_DIR_OVERRIDE`) instead of logging an error. |

## Authentication and user management (Authentik)

Read by **`docker-compose.yml` only** (the bundled Authentik stack with its own Postgres/Redis).
The backend does not read them — forward-auth is not wired yet (todo 33c).

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `AUTHENTIK_TAG` | `2024.12.3` | Authentik image tag. Pin to the current stable release (see https://goauthentik.io/docker-compose.yml). |
| `AUTHENTIK_IMAGE` | `ghcr.io/goauthentik/server` | Image repository for both server and worker. |
| `AUTHENTIK_PG_USER` | `authentik` | Postgres user for Authentik's dedicated database. |
| `AUTHENTIK_PG_DB` | `authentik` | Postgres database name for Authentik. |
| `AUTHENTIK_PG_PASSWORD` | (required to start) | Password for Authentik's Postgres. Compose fails fast if unset. |
| `AUTHENTIK_SECRET_KEY` | (required to start) | Django secret key. Generate with `openssl rand -base64 60`. Compose fails fast if unset. |
| `AUTHENTIK_PORT` | `9000` | Host port publishing the Authentik admin/login UI (`http://<host>:<port>/if/admin/`). |
| `AUTHENTIK_BOOTSTRAP_PASSWORD` | (unset) | First-boot password for the initial `akadmin` account. Ignored once the account exists. |
| `AUTHENTIK_BOOTSTRAP_EMAIL` | (unset) | First-boot email for `akadmin`. |
| `AUTHENTIK_BOOTSTRAP_TOKEN` | (unset) | First-boot API token for `akadmin` (optional). |

## Database and file storage

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | (required) | Postgres connection string. No SQLite fallback — the service refuses to start without this. |
| `INBOX_DIR` | `backend/data/inbox` | Directory watched for CSV imports. |
| `ARCHIVE_DIR` | `backend/data/archive` | Directory used to archive processed CSVs. |
| `MEDIA_STORAGE_MODE` | `local` | `local` or `webdav` media storage backend. |
| `MEDIA_ROOT_DIR` | (unset) | Absolute mounted media root directory used to derive fixed paths: `<root>/shopbilder` (WebDAV) and `<root>/shopbilder-import` (ERP mirror). URLs are rejected. |
| `ALT_DOC_DIRS_FILE` | (unset) | Absolute path to a JSON file containing alternative document directory configurations. Each entry links a filesystem/WebDAV mount to a per-item identifier for retrieving documents (wipe reports, test results, certificates, datasheets). See [Alternative document directories](#alternative-document-directories) below. |
| `INTAKE_TOKEN` | (unset) | Shared secret for the device intake station API. Sent as `X-Intake-Token` header by intake scripts. When unset, intake endpoints accept all requests (development mode). |
| `AUTH_REQUIRED` | `false` | When true, `/api/`, `/media/`, `/prints/` and `/external-docs/` answer 401 unless the request carries a forward-auth identity (`X-authentik-username`); `/api/admin/` also accepts the `ADMIN_SECRET` bearer and `/api/intake/` the `INTAKE_TOKEN`. Set by the Authentik compose overrides. See `docs/detailed/identity-provider.md`. |
| `FEATURES` / `FEATURES_FILE` | (unset = all on) | Deployment feature flags as a JSON object (`{"agentic": false}`), inline or as a file path. Disabled features are blocked (API 404, jobs off) and hidden. Unknown keys or invalid JSON abort startup. See `docs/detailed/feature-flags.md`. |
| `AUTHENTIK_ENABLED` | (unset) | Production host only: `true` makes the deploy workflow include `docker-compose.prod.authentik.yaml`. Not read by the backend. |
| `MEDIATOR_DOMAIN` / `AUTHENTIK_DOMAIN` | `erfassung.<VM_IP>.nip.io` / `auth.<VM_IP>.nip.io` | Public hostnames for the app and the Authentik login in `docker-compose.prod.authentik.yaml`. |

Example mounted media root path: `/mnt` (Linux) or `/Volumes` (macOS). The service derives WebDAV at `<root>/shopbilder` and ERP mirror at `<root>/shopbilder-import`. `davs://` URLs are not accepted; only local filesystem mount paths are supported.

## Alternative document directories

`ALT_DOC_DIRS_FILE` points to a JSON file that configures additional document mounts. Each entry links a filesystem path (local or mounted WebDAV/NFS/SMB) to a per-item identifier so the service can locate documents without knowing the storage topology.

### Configuration file format

The file must contain a JSON array. Example `/etc/mediator/alt-doc-dirs.json`:

```json
[
  {
    "name": "wipe-reports",
    "mountPath": "/mnt/wipe-reports",
    "identifierType": "serialNumber",
    "docType": "Löschprotokoll"
  },
  {
    "name": "test-results",
    "mountPath": "/mnt/test-results",
    "identifierType": "serialNumber",
    "docType": "Prüfprotokoll"
  },
  {
    "name": "datasheets",
    "mountPath": "/mnt/datasheets",
    "identifierType": "ean",
    "normalize": "uppercase",
    "docType": "Datenblatt"
  },
  {
    "name": "service-manuals",
    "mountPath": "/mnt/service-manuals",
    "identifierType": "artikelNummer",
    "docType": "Servicehandbuch",
    "writable": true
  }
]
```

Reference it from `.env`:
```
ALT_DOC_DIRS_FILE=/etc/mediator/alt-doc-dirs.json
```

### Entry schema

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Unique alphanumeric key (hyphens and underscores allowed). Used in API URLs: `/external-docs/<name>/…` |
| `mountPath` | Yes | Absolute filesystem path to the mounted root (must not be a URL). |
| `identifierType` | Yes | `ean`, `serialNumber`, `macAddress`, or `artikelNummer` — see scope table below. |
| `normalize` | No | Optional transformation applied to the identifier before use as a path segment: `uppercase`, `lowercase`, or `strip-colons`. |
| `docType` | No | Human-readable label shown in the UI and API (e.g. `Löschprotokoll`, `Datenblatt`). |
| `writable` | No | `true` to allow uploading new files via the UI (default: `false`). |
| `deletable` | No | `true` to allow deleting individual files via the UI (default: `false`). Both flags are independent — a dir can be append-only (`writable: true, deletable: false`). |

### Identifier scope

| `identifierType` | Source field | Scope | Typical use |
| --- | --- | --- | --- |
| `ean` | `item_refs.EAN` | Product-level — shared across all units of a model | Datasheets, EU declarations, model-level certifications |
| `serialNumber` | `items.SerialNumber` | Per physical unit | Wipe/erasure reports, test results per unit |
| `macAddress` | `items.MacAddress` | Per physical unit (network devices) | Per-unit config exports, network registration docs |
| `artikelNummer` | `items.Artikel_Nummer` | Product-level — internal catalog number | Service manuals, supplier documents, repair guides |

### API endpoints

- `GET /api/items/:itemUUID/external-docs` — lists available files for all configured directories. Each entry includes `writable` and `deletable` flags reflecting the dir config. Returns `available: false, reason: "identifier_not_set"` when the item is missing the required identifier.
- `GET /external-docs/:name/:itemUUID/:fileName` — serves a single file (allowed extensions: `.pdf`, `.txt`, `.csv`, `.xml`, `.json`).
- `POST /api/items/:itemUUID/external-docs/:dirName` — uploads a file to an external mount. Requires `writable: true` on the dir config; returns `403` otherwise. Body: raw file bytes. Headers: `X-Filename` (required), `Content-Type`.
- `DELETE /api/items/:itemUUID/external-docs/:dirName/:fileName` — deletes a single file from an external mount. Requires `deletable: true`; returns `403` otherwise. No files are deleted automatically on item deletion.

### Security

Identifier values are validated against allowlist regexes (EAN: alphanumeric; serial: alphanumeric + `-_`; MAC: hex + `:-`; artikelNummer: alphanumeric + `._-`) and then checked with `resolvePathWithinRoot` to prevent path traversal.

## Printing

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `PRINTER_QUEUE` | (unset) | Default printer queue for labels. |
| `PRINTER_HOST` | (unset) | Legacy alias used as a fallback for `PRINTER_QUEUE`. |
| `PRINTER_QUEUE_BOX` | (unset) | Overrides printer queue for box labels. |
| `PRINTER_QUEUE_ITEM` | (unset) | Overrides printer queue for item labels. |
| `PRINTER_QUEUE_ITEM_SMALL` | (unset) | Overrides printer queue for small item labels. |
| `PRINTER_QUEUE_SHELF` | (unset) | Overrides printer queue for shelf labels. |
| `PRINTER_QUEUE_MARKETING` | (unset) | Queue for A4 marketing sheets; falls back to `PRINTER_QUEUE` (warning at startup). |
| `PRINTER_SERVER` | (unset) | Optional CUPS host override passed to `lp -h` (e.g., `localhost:631`). |
| `CUPS_HOST` | (unset) | Explicit CUPS TCP host (e.g. `cups:631`) for admin printer setup. Leave unset in Compose: `CUPS_SERVER` points at the Unix socket, which `lpinfo` needs since CUPS 2.4. |
| `LP_COMMAND` | `lp` | Print command used for dispatching jobs. |
| `LPSTAT_COMMAND` | `lpstat` | Command used to query printer status. |
| `PRINT_TIMEOUT_MS` | `15000` | Print job timeout for spooled labels. |
| `PRINT_PREVIEW_DIR` | (unset) | Absolute path override for storing HTML/PDF label previews (defaults to `${PUBLIC_DIR}/prints`). |
| `PRINT_RENDERER` | (unset) | HTML-to-PDF renderer override (e.g., `chromium`). The Docker runtime installs `chromium`, so set this to `chromium` when running inside the container. |
| `PRINT_RENDER_TIMEOUT_MS` | `10000` | Timeout for HTML-to-PDF rendering. |

## Event logging

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `EVENT_LOG_LEVELS` | All levels | Comma-separated allow list of event log levels. |
| `EVENT_LOG_TOPICS` | All topics | Comma-separated allow list of event topics. |

## Importer and ERP integration

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `IMPORTER_FORCE_ZERO_STOCK` | `false` | Force incoming imports to zero stock values. |
| `LANGTEXT_EXPORT_FORMAT` | `html` (ERP) | Langtext format at the ERP export boundary: `json`, `markdown` or `html`. Backups always use JSON so they stay restorable. |
| `ERP_SYNC_REQUIRE_APPROVAL` | `true` | When true (default), only approved items are exported/synced to the ERP; unapproved items are excluded from `/api/sync/erp` and all ERP-mode exports (`/api/export/items?mode=erp`, `/api/export/data?mode=erp`). Backup-mode exports are unaffected. Set false only for controlled backfills. |
| `ERP_SYNC_ENABLED` | `true` | Gates the **nightly automated** sync only; manual `/api/sync/erp` and ERP-mode exports ignore it. Not a full "master switch". |
| `ERP_IMPORT_INCLUDE_MEDIA` | `false` | Includes media files in ERP import flows. |
| `ERP_IMPORT_URL` | (unset) | **Required** for ERP sync — the kivitendo import endpoint (`.../controller.pl`) the sync script POSTs to. When unset, `/api/sync/erp` returns `503 credentials_missing`. |
| `ERP_IMPORT_USERNAME` | (unset) | **Required** for ERP sync — login for the import (and the media-mirror WebDAV). Consumed by `backend/scripts/erp-sync.sh`; no longer hardcoded. |
| `ERP_IMPORT_PASSWORD` | (unset) | **Required** for ERP sync — password for the import (and the media-mirror WebDAV). No longer hardcoded. |
| `ERP_IMPORT_FORM_FIELD` | `file` | Form field name used to upload the import file. |
| `ERP_IMPORT_TIMEOUT_MS` | `30000` | Timeout for ERP import requests. |
| `ERP_IMPORT_CLIENT_ID` | `1` | kivitendo client id passed to the import; optional. |
| `ERP_WEBDAV_SHOPBILDER_URL` | (unset) | Optional WebDAV endpoint for the ERP media-mirror stage (reuses `ERP_IMPORT_USERNAME`/`ERP_IMPORT_PASSWORD`). When unset, the mirror step skips gracefully and the CSV import still runs. |
| `ERP_MEDIA_MIRROR_DIR` | Derived from `MEDIA_ROOT_DIR` | Mirror destination for `/api/sync/erp` media copy stage (`<root>/shopbilder-import`). Override only for controlled maintenance windows; keep runtime configuration aligned with the fixed root contract. |
| `ERP_NIGHTLY_SYNC_ENABLED` | `false` | Sets the initial value of the nightly sync toggle in the database on first startup. After first run, the toggle is controlled from the admin page and this variable is ignored. |
| `ERP_NIGHTLY_SYNC_HOUR` | `2` | UTC hour at which the nightly sync scheduler fires (0–23). The scheduler polls every 60 seconds and runs at most once per UTC day. |

**Nightly sync opt-in model:** Only refs where `item_refs.LastSyncedAt IS NOT NULL` are considered by the nightly scheduler. An item enters the cycle only after its first manual sync (via the admin export UI), which sets `LastSyncedAt`. This prevents unexpected items from being synced before an operator has reviewed them. The runtime toggle (admin page → "Nächtliche ERP-Synchronisation") is stored in the `system_settings` database table so it persists across server restarts.

Operator check: look for `[erp-sync] media_copy_result status=success` in script output and `[sync-erp] script_finished` with `mediaCopyStatus: 'success'` in backend logs to confirm images were mirrored.

## Agentic model configuration

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `AGENTIC_MODEL_PROVIDER` | `ollama` | Preferred model provider for agentic runs. |
| `AGENTIC_OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama host for agentic runs. |
| `AGENTIC_OLLAMA_MODEL` | `qwen3:0.6b` | Ollama model name for agentic runs. |
| `AGENTIC_OPENAI_API_KEY` | (unset) | OpenAI-compatible API key for agentic runs. |
| `AGENTIC_OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL for agentic runs. |
| `AGENTIC_OPENAI_MODEL` | `gpt-4o-mini` | OpenAI-compatible model name for agentic runs. |
| `AGENTIC_MODEL_BASE_URL` | (unset) | Generic model base URL override. |
| `AGENTIC_MODEL_NAME` | (unset) | Generic model name override. |
| `AGENTIC_MODEL_API_KEY` | (unset) | Generic model API key override. |
| `MODEL_NUM_CTX` | `8192` | Ollama context window (`num_ctx`, tokens). Ollama's own default (2048) is far below the extraction prompt (~6-7k tokens), so the prompt is silently left-truncated and the model returns an empty completion (the `json match missing` / `EXTRACTION_FAILED` loop). Raise for larger prompts (costs VRAM), lower if the GPU can't hold it. Ollama provider only. |
| `MODEL_FORMAT_JSON` | (off) | Force Ollama responses to valid JSON (`format: "json"`). Strong guard against empty/prose output, but suppresses a reasoning model's `<think>` phase — leave off for reasoning models. Truthy = `1`/`true`/`yes`/`on`. |
| `MODEL_HTTP_HEADERS_TIMEOUT_MS` | `600000` | undici fetch header timeout (ms) for model calls. Raise if a cold/large local model is slow to first token and runs fail with `UND_ERR_HEADERS_TIMEOUT`; `0` disables. Applied as a global fetch dispatcher. |
| `MODEL_HTTP_BODY_TIMEOUT_MS` | `600000` | undici fetch body timeout (ms) for model calls (inter-chunk while streaming); `0` disables. |
| `TAVILY_API_KEY` | (unset) | Tavily API key for search enrichment. |
| `SEARCH_RATE_LIMIT_DELAY_MS` | (unset) | Delay between search requests (ms). |
| `SEARCH_MAX_PLANS` | `3` | Max agentic search plans per request. |
| `SEARCH_MAX_AGENT_QUERIES_PER_REQUEST` | `1` | Max agentic search queries per request. |
| `AGENT_ACTOR_ID` | `item-flow-service` | Overrides the actor ID used in agentic logs. |
| `AUTO_APPROVE` | `false` | When true, a run whose output is **clean** — no review finding of severity `block` (missing-required) or `warn` (banned phrase / intake conflict); info-level style hints tolerated — is finalized as `auto_approved` instead of waiting for manual review. `auto_approved` items are ERP-eligible; operators sort by state and decide what to sync, and `Abschliessen` promotes them to full `approved`. (The findings-clean gate replaced the old confidence threshold.) |
| `AUTO_APPROVE_MIN_CONFIDENCE` | `0.8` | **Deprecated / no longer gates.** Retained for back-compat; auto-approval now uses the findings-clean gate above, not extraction confidence. |
| `AUTO_REWORK` | `false` | When true, an idle-time sweeper re-applies the current spec contract to the oldest item enriched against an older contract version (deterministic, no LLM): it re-stamps items already complete, or enqueues a targeted rework for a now-missing required field. Runs only while the pipeline is otherwise idle, one enqueue per tick. Detection relies on the `agentic_runs.SpecContractVersion` stamp. |

Legacy aliases still accepted: `MODEL_PROVIDER`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `MODEL_BASE_URL`, `MODEL_NAME`, `MODEL_API_KEY` (each maps to the `AGENTIC_`-prefixed variable).

## Shopware integration

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `SHOPWARE_ENABLED` | `false` | Enables the Shopware read/search integration. |
| `SHOPWARE_BASE_URL` | (unset) | Shopware base URL. |
| `SHOPWARE_SALES_CHANNEL_ACCESS_KEY` | (unset) | Sales-channel API access key (`sw-access-key`, not the UUID). |
| `SHOPWARE_SALES_CHANNEL_ID` / `SHOPWARE_SALES_CHANNEL` | (unset) | Deprecated aliases for `SHOPWARE_SALES_CHANNEL_ACCESS_KEY`. |
| `SHOPWARE_CLIENT_ID` | (unset) | OAuth client ID (client-credentials auth). |
| `SHOPWARE_CLIENT_SECRET` | (unset) | OAuth client secret (client-credentials auth). |
| `SHOPWARE_ACCESS_TOKEN` | (unset) | Static admin API access token (API-key auth) — alternative to client credentials. |
| `SHOPWARE_API_TOKEN` | (unset) | Deprecated alias for `SHOPWARE_ACCESS_TOKEN`. |
| `SHOPWARE_REQUEST_TIMEOUT_MS` | `10000` | Request timeout for Shopware API calls. |
| `SHOPWARE_SYNC_ENABLED` | `false` | Enables the write path: enqueue on inventory changes **and** the background worker that pushes products, variants, stock, images and categories to the Admin API. See [shopware runbook](detailed/shopware.md). |

## Frontend runtime flags

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `AUTO_PRINT_ITEM_LABEL` | `false` | Toggles auto-printing after item creation in the UI. Frontend resolution order is: esbuild `define` value, then optional `window.__APP_CONFIG__.AUTO_PRINT_ITEM_LABEL`, then legacy `process.env` fallback. |

`AUTO_PRINT_ITEM_LABEL` is a **build-time** flag: set it when running `npm run build`
(e.g. `AUTO_PRINT_ITEM_LABEL=true npm run build`). If the build can't take env, set
`window.__APP_CONFIG__ = { AUTO_PRINT_ITEM_LABEL: 'true' }` in `frontend/public/index.html` before `bundle.js`.
