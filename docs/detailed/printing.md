# Printing

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Explicitly call out where data structures must stay synchronized across `models/`, `backend/src/models/`, and frontend types/usages.

## In short
- Business goal: provide one operational reference for label printing behavior so operators and developers can resolve failures quickly with fewer ad-hoc checks.
- User value: predictable print outcomes (preview + dispatch), clear actor attribution, and faster troubleshooting for queue/template/payload issues.

## Scope
- In scope:
  - End-to-end flow from frontend print request to backend preview generation and printer dispatch.
  - Label types, template mapping, and canonical template asset locations.
  - Environment/configuration knobs required for CUPS/printer integrations.
  - Logging/error signals and retry behavior for transient failures.
  - Operator troubleshooting checklist.
- Out of scope:
  - Structural backend/frontend refactors.
  - Template redesign or visual calibration changes.
  - Legacy queue worker behavior outside `/api/print/*` paths.

## Core concepts
- Terms:
  - **Preview**: generated HTML artifact under `/prints/...` returned as `previewUrl` before/alongside printer dispatch.
  - **Print dispatch**: `lp` submission (optionally after HTML→PDF rendering) executed by backend print helpers.
  - **Actor attribution**: required `actor` in request payload, persisted into events (`PrintPreviewSaved`, `PrintSent`, `PrintFailed`).
- Label types:
  - `box`, `item`, `smallitem`, `shelf`.
- Relationships:
  - Frontend/legacy actions send typed print requests.
  - Unified backend action validates label type + actor, builds payload, renders template, then dispatches print.
  - Print helper selects queue by label type and applies transient retry behavior.

## Data contracts
- Canonical model links:
  - `models/print-label.ts` (request/response + `PrintLabelType`).
  - `backend/lib/labelHtml.ts` (`BoxLabelPayload`, `ItemLabelPayload`, `ShelfLabelPayload`).
  - `frontend/src/utils/printLabelRequest.ts` (frontend request contract usage).
- Key fields:
  - Request: `actor`, `labelType`.
  - Response: `sent`, `previewUrl`, `reason`, `error`, `qrPayload`.
  - Payload identity: `id`, `type` (+ `materialNumber` for item QR payload).
- Enums:
  - `PrintLabelType = 'box' | 'item' | 'smallitem' | 'shelf'`.
- Sync requirements across layers:
  - Keep label type enum synchronized across `models/print-label.ts`, frontend request helper, and backend label parser.
  - Keep payload field names aligned with template scripts in `frontend/public/print/*.html`.

### Field glossary (one-line purpose per field)
- `actor`: identifies the user/operator responsible for the print action.
- `labelType`: routes to the expected template + queue pair.
- `previewUrl`: browser-accessible path to generated HTML print preview.
- `sent`: indicates whether dispatch to printer succeeded.
- `reason`: backend dispatch/status failure reason (queue, timeout, command error, etc.).
- `qrPayload`: payload snapshot used for preview/diagnostics and event metadata.

## API/actions
- Endpoint/action names:
  - Unified endpoint: `POST /api/print/:labelType/:id` (`print-unified`).
  - Compatibility wrappers: `print-item`, `print-box` call into unified handler.
  - Status probe: `GET /api/printer/status`.
- Request shape:
  - JSON body with `actor` (required, non-empty string) and optional/validated `labelType`.
- Response shape:
  - Success/failure returns include `previewUrl` and print dispatch outcome fields.
- Error cases:
  - `400`: invalid label type/id/body/json or missing actor.
  - `404`: requested entity missing.
  - `500`: payload build/preview/render/internal action failures.

## Template usage map (backend action → template asset)
- Template mapping source of truth:
  - `box` → `62x100` → `frontend/public/print/62x100.html`.
  - `item` → `29x90` → `frontend/public/print/29x90.html`.
  - `smallitem` → `62x10` → `frontend/public/print/62x10.html`.
  - `shelf` → `shelf-a4` → `frontend/public/print/shelf-a4.html`.
- Backend usage paths:
  - `backend/actions/print-unified.ts` selects label type, builds payload, logs template selection, writes preview artifact, then calls `ctx.printFile(...)`.
  - `backend/lib/labelHtml.ts` resolves template names and renders HTML via template loader.

## UI components & routes
- Routes:
  - API-only routes under `/api/print/*` and `/api/printer/status`.
  - Preview files served from `/prints/<generated-file>.html`.
- Key components/helpers:
  - `frontend/src/utils/printLabelRequest.ts` sends typed requests and enforces actor presence.
  - `backend/actions/print-label.ts` (legacy action card) still supports preview fallback UI when `sent=false`.
- User flows:
  - UI gathers/resolves actor → POST print request → backend returns preview + dispatch result → operator can open preview when direct dispatch fails.

## State machine / workflow
1. Validate request path/body (`labelType`, `id`, `actor`).
2. Resolve entity + construct label payload (`box`/`item`/`shelf`).
3. Render HTML preview artifact and log `PrintPreviewSaved`.
4. Resolve printer queue by label type (or fallback default).
5. Dispatch print via `printFile` (`html-to-pdf` renderer mode).
6. Log `PrintSent` on success or `PrintFailed` on failure; respond with `sent` + `reason` + `previewUrl`.

## Logging & error handling
- Observable events/log identifiers:
  - Action logs: template selection, preview generation, payload/build/validation failures.
  - Event log entries: `PrintPreviewSaved`, `PrintSent`, `PrintFailed` include actor/entity metadata.
  - Print helper logs: operation start/attempt/fail/retry/final outcome for both `lp` and `lpstat` flows.
- Warning conditions:
  - Missing label-specific queue with fallback to `PRINTER_QUEUE`.
  - Queue entirely missing (`source=missing`).
  - Shelf/box mismatch requests.
- Error conditions:
  - Invalid JSON/body/actor.
  - HTML render failure or missing rendered artifact.
  - Printer command timeout/start failure/non-zero exit.
- Retry/failure handling:
  - `runWithRetry` retries transient failures (`timeout`, network/CUPS reachability patterns) using env-configurable attempts/base delay with jitter.
  - Final failed attempts return `reason` and emit terminal error logs for diagnostics.
- try/catch boundaries:
  - Request body parsing and JSON decode.
  - Payload construction.
  - Preview generation.
  - Print invocation and outer unified handler catch-all.

## Config & environment dependencies
- Required for real printer integration:
  - `PRINTER_QUEUE` or label-specific queues (`PRINTER_QUEUE_BOX`, `PRINTER_QUEUE_ITEM`, `PRINTER_QUEUE_ITEM_SMALL`, `PRINTER_QUEUE_SHELF`).
- Optional/behavior controls:
  - `PRINTER_SERVER` (remote CUPS host).
  - `LP_COMMAND`, `LPSTAT_COMMAND`.
  - `PRINT_TIMEOUT_MS`.
  - `PRINT_RETRY_ATTEMPTS`, `PRINT_RETRY_BASE_MS`.
  - `PRINT_PREVIEW_DIR`.
  - `PRINT_RENDERER`, `PRINT_RENDER_TIMEOUT_MS`.
- Operational dependency notes:
  - CUPS restarts may require mediator container recreation so print volume inode references stay valid (`docs/setup.md`).

## Dependencies & integrations
- Database/event pipeline:
  - Print operations write event log records via `ctx.logEvent` for actor/entity observability.
- Device integrations:
  - CUPS (`lp`, `lpstat`) for dispatch/status.
  - Renderer dependency (chromium/wkhtmltopdf via print renderer abstraction) for HTML→PDF output.
- External services:
  - None required beyond reachable print infrastructure.

## Failure modes & troubleshooting
- Common issue: template mismatch between requested label type and expected layout.
  - Detection: unexpected template query warning and wrong physical label format.
  - Recovery: verify `labelType` sent by client and confirm mapping in unified action/template assets.
- Common issue: printer unavailable/unreachable.
  - Detection: `/api/printer/status` returns `ok=false`; print reasons include timeouts/network/CUPS errors.
  - Recovery: verify queue name, `PRINTER_SERVER`, CUPS service, and command availability (`lpstat`, `lp`).
- Common issue: invalid payload/body/actor.
  - Detection: `400` responses (`actor required`, `invalid json`, `invalid label type`, `invalid body`).
  - Recovery: ensure actor resolution in frontend, validate JSON body, keep label type enum synchronized.

### Operator troubleshooting checklist
1. Confirm actor is present and non-empty in the request source.
2. Confirm entity ID exists and matches label type (`S-*` IDs for shelf labels).
3. Open returned `previewUrl` to verify payload/template rendering before retrying print.
4. Check `/api/printer/status` and capture `reason`.
5. Validate queue/env settings (`PRINTER_QUEUE*`, `PRINTER_SERVER`, timeout/retry envs).
6. Inspect backend logs for `PrintFailed` reason and retry attempt history.

## Test/validation checklist
- Static checks:
  - Ensure enum/value consistency across `models/print-label.ts`, backend parser, and frontend request helper.
- Runtime checks:
  - Call `/api/printer/status` and one sample `/api/print/:labelType/:id` request per active label type.
  - Verify preview HTML is generated under `/prints` and corresponds to canonical template.
- Contract sync verification:
  - Confirm template scripts still consume payload fields generated by `backend/lib/labelHtml.ts`.

## Open questions / TODO
- [ ] TODO: Add direct sample request/response payloads once operations approve redaction-safe examples.
- [ ] TODO: Link printer-specific calibration SOP after hardware team publishes current queue-to-device map.
