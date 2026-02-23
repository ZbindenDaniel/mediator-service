# Environment Settings

<!-- TODO(agent): Keep this list aligned with live environment parsing whenever new settings are introduced. -->

This document enumerates all environment variables consumed by the mediator service runtime. Use it alongside
`.env.example` for local setup and to verify production deployments.

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

## Database and file storage

<!-- TODO(media-root-contract): Document only root-level media mount env and fixed subfolder names. -->

<!-- TODO(webdav-docs): Confirm WebDAV mount path examples with operations before finalizing guidance. -->

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | (unset) | Postgres connection string. When set, `DB_PATH` is ignored. |
| `DB_PATH` | `backend/data/mediator.sqlite` | Legacy SQLite database path when `DATABASE_URL` is unset. |
| `INBOX_DIR` | `backend/data/inbox` | Directory watched for CSV imports. |
| `ARCHIVE_DIR` | `backend/data/archive` | Directory used to archive processed CSVs. |
| `MEDIA_STORAGE_MODE` | `local` | `local` or `webdav` media storage backend. |
| `MEDIA_DIR` | (unset) | Base media directory used for local storage. |
| `MEDIA_DIR_OVERRIDE` | (unset) | Overrides `MEDIA_DIR` if provided. |
| `MEDIA_ROOT_DIR` | (unset) | Absolute mounted media root directory used to derive fixed paths: `<root>/shopbilder` (WebDAV) and `<root>/shopbilder-import` (ERP mirror). URLs are rejected. |

Example mounted media root path: `/mnt` (Linux) or `/Volumes` (macOS). The service derives WebDAV at `<root>/shopbilder` and ERP mirror at `<root>/shopbilder-import`. `davs://` URLs are not accepted; only local filesystem mount paths are supported.

## Printing

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `PRINTER_QUEUE` | (unset) | Default printer queue for labels. |
| `PRINTER_HOST` | (unset) | Legacy alias used as a fallback for `PRINTER_QUEUE`. |
| `PRINTER_QUEUE_BOX` | (unset) | Overrides printer queue for box labels. |
| `PRINTER_QUEUE_ITEM` | (unset) | Overrides printer queue for item labels. |
| `PRINTER_QUEUE_ITEM_SMALL` | (unset) | Overrides printer queue for small item labels. |
| `PRINTER_QUEUE_SHELF` | (unset) | Overrides printer queue for shelf labels. |
| `PRINTER_SERVER` | (unset) | Optional CUPS host override passed to `lp -h` (e.g., `localhost:631`). |
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
| `ERP_IMPORT_INCLUDE_MEDIA` | `false` | Includes media files in ERP import flows. |
| `ERP_IMPORT_URL` | (unset) | URL for ERP import POST requests. |
| `ERP_IMPORT_USERNAME` | (unset) | HTTP basic auth username for ERP imports. |
| `ERP_IMPORT_PASSWORD` | (unset) | HTTP basic auth password for ERP imports. |
| `ERP_IMPORT_FORM_FIELD` | `file` | Form field name used to upload the import file. |
| `ERP_IMPORT_TIMEOUT_MS` | `30000` | Timeout for ERP import requests. |
| `ERP_IMPORT_CLIENT_ID` | (unset) | Optional client identifier for ERP imports. |
| `ERP_MEDIA_MIRROR_DIR` | (unset) | Optional destination directory for `/api/sync/erp` media mirror copy stage. When set, `docs/erp-sync.sh` copies media from `ERP_MEDIA_SOURCE_DIR` (injected by backend) or `MEDIA_DIR`; failures exit non-zero and surface in API stdout/stderr. |


Operator check: look for `[erp-sync] media_copy_result status=success` in script output and `[sync-erp] script_finished` with `mediaCopyStatus: 'success'` in backend logs to confirm images were mirrored.

## Agentic model configuration

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `AGENTIC_MODEL_PROVIDER` | `ollama` | Preferred model provider for agentic runs. |
| `MODEL_PROVIDER` | (unset) | Legacy alias for `AGENTIC_MODEL_PROVIDER`. |
| `AGENTIC_OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama host for agentic runs. |
| `AGENTIC_OLLAMA_MODEL` | `qwen3:0.6b` | Ollama model name for agentic runs. |
| `OLLAMA_BASE_URL` | (unset) | Legacy alias for `AGENTIC_OLLAMA_BASE_URL`. |
| `OLLAMA_MODEL` | (unset) | Legacy alias for `AGENTIC_OLLAMA_MODEL`. |
| `AGENTIC_OPENAI_API_KEY` | (unset) | OpenAI-compatible API key for agentic runs. |
| `AGENTIC_OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL for agentic runs. |
| `AGENTIC_OPENAI_MODEL` | `gpt-4o-mini` | OpenAI-compatible model name for agentic runs. |
| `OPENAI_API_KEY` | (unset) | Legacy alias for `AGENTIC_OPENAI_API_KEY`. |
| `OPENAI_BASE_URL` | (unset) | Legacy alias for `AGENTIC_OPENAI_BASE_URL`. |
| `OPENAI_MODEL` | (unset) | Legacy alias for `AGENTIC_OPENAI_MODEL`. |
| `AGENTIC_MODEL_BASE_URL` | (unset) | Generic model base URL override. |
| `AGENTIC_MODEL_NAME` | (unset) | Generic model name override. |
| `AGENTIC_MODEL_API_KEY` | (unset) | Generic model API key override. |
| `MODEL_BASE_URL` | (unset) | Legacy alias for `AGENTIC_MODEL_BASE_URL`. |
| `MODEL_NAME` | (unset) | Legacy alias for `AGENTIC_MODEL_NAME`. |
| `MODEL_API_KEY` | (unset) | Legacy alias for `AGENTIC_MODEL_API_KEY`. |
| `TAVILY_API_KEY` | (unset) | Tavily API key for search enrichment. |
| `SEARCH_RATE_LIMIT_DELAY_MS` | (unset) | Delay between search requests (ms). |
| `SEARCH_MAX_PLANS` | `3` | Max agentic search plans per request. |
| `SEARCH_MAX_AGENT_QUERIES_PER_REQUEST` | `1` | Max agentic search queries per request. |
| `SEARCH_WEB_ALLOWED_ENGINES` | `google,duckduckgo,brave` | Allowed search engines for agentic search adapters. |
| `AGENT_ACTOR_ID` | `item-flow-service` | Overrides the actor ID used in agentic logs. |

## Shopware integration

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `SHOPWARE_ENABLED` | `false` | Enables Shopware search integration. |
| `SHOPWARE_BASE_URL` | (unset) | Shopware base URL. |
| `SHOPWARE_SALES_CHANNEL_ID` | (unset) | Sales channel ID for Shopware search. |
| `SHOPWARE_SALES_CHANNEL` | (unset) | Legacy alias for `SHOPWARE_SALES_CHANNEL_ID`. |
| `SHOPWARE_CLIENT_ID` | (unset) | OAuth client ID. |
| `SHOPWARE_CLIENT_SECRET` | (unset) | OAuth client secret. |
| `SHOPWARE_ACCESS_TOKEN` | (unset) | Pre-generated API token for Shopware search. |
| `SHOPWARE_API_TOKEN` | (unset) | Alias for `SHOPWARE_ACCESS_TOKEN` used by agentic config. |
| `SHOPWARE_REQUEST_TIMEOUT_MS` | `10000` | Request timeout for Shopware API calls. |

## Shopware sync queue

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `SHOPWARE_SYNC_ENABLED` | `false` | Enables Shopware sync queue worker. |
| `SHOPWARE_QUEUE_ENABLED` | (unset) | Legacy alias for `SHOPWARE_SYNC_ENABLED`. |
| `SHOPWARE_API_BASE_URL` | (unset) | Base URL for Shopware sync API. |
| `SHOPWARE_QUEUE_POLL_INTERVAL_MS` | `5000` | Poll interval for the sync queue worker. |

## Frontend runtime flags

| Variable | Default / Example | Notes |
| --- | --- | --- |
| `AUTO_PRINT_ITEM_LABEL` | `false` | Toggles auto-printing after item creation in the UI. |
