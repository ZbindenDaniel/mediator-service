# QR Codes

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Explicitly call out where data structures must stay synchronized across `models/`, `backend/src/models/`, and frontend types/usages.

## In short
- Business goal: Make item/box/shelf identification fast and reliable by standardizing how QR payloads are generated, scanned, routed, and audit-logged.
- User value: Operators can scan printed labels and reach the right entity page (or return flow) with clear error states and traceable backend audit events.

## Scope
- In scope:
  - QR payload generation for print labels.
  - Frontend scanner lifecycle (`/scan`) from camera start to navigation.
  - Backend scan audit logging endpoint (`/api/qr-scan/log`).
  - Data contract locations and scan-event observability expectations.
- Out of scope:
  - Alternative barcode formats.
  - Legacy/removed scanner implementations.
  - Future callback/intent schemas not yet implemented.

## Core concepts
- Terms:
  - **QR payload**: JSON serialized into the QR image (must include `id`).
  - **Scan return flow**: scanner sends `qrReturn` state back to originating route via `returnTo`.
  - **Audit event**: persisted `QrScanned` event in event log.
- Entities:
  - Label payloads (`BoxLabelPayload`, `ItemLabelPayload`, `ShelfLabelPayload`).
  - Scanner payload (`BoxQrPayload` in frontend scanner).
  - Event log entry (`logEvent` payload with `Meta` JSON).
- Relationships:
  - Print action builds label payload -> `labelHtml` creates QR data URI from minimal QR payload -> user scans in `/scan` -> scanner validates+routes and posts to `/api/qr-scan/log` -> backend logs `QrScanned`.

## Data contracts
- Canonical model links:
  - `models/print-label.ts` (`PrintLabelResponsePayload.qrPayload`).
  - `models/event-resources.json` (`QrScanned` event taxonomy entry).
  - `backend/lib/labelHtml.ts` (`BoxLabelPayload` / `ItemLabelPayload` / `ShelfLabelPayload`; minimal embedded QR payload fields).
  - `frontend/src/components/QrScannerPage.tsx` (`BoxQrPayload`, `qrReturn` payload handling).
- Key fields:
  - QR payload minimum: `id` (string, required at scan time).
  - Optional scan payload passthrough: extra JSON keys; scanner preserves and counts them in UI.
  - Optional return helper fields: `itemUUID`/`ItemUUID` normalized for return-navigation helpers.
  - Audit payload: `actor`, `payload`, `scannedAt`, `source`, and backend-enriched `userAgent`.
- Enums:
  - `QrScanIntent`: `add-item` | `relocate-box` | `shelf-add-box`.
  - `QrCallback`: currently `NavigateToEntity`.
  - Event key: `QrScanned`.
- Sync requirements across layers:
  - QR payload `id` semantics must stay aligned between label generation (`backend/lib/labelHtml.ts`) and scanner validation/routing (`frontend/src/components/QrScannerPage.tsx`).
  - `PrintLabelResponsePayload.qrPayload` shape should mirror what print templates/scanner expect when debugging print outputs.
  - Event key names in backend logging must remain present in `models/event-resources.json` so activity views classify scan events correctly.

### Field glossary (one-line purpose per field)
- `id`: Primary routing key from QR payload; determines whether scanner opens `/items/:id` or `/boxes/:id`.
- `type`: Printed label context (`item`/`box`/`shelf`) attached during QR generation.
- `materialNumber`: Extra item context included in generated QR payload when available.
- `itemUUID`: Optional helper extracted from QR payload for return flows that can navigate directly to item details.
- `scannedAt`: ISO timestamp submitted by scanner and persisted in scan audit meta.
- `source`: Scanner source label (`qr-scanner` default) persisted in audit meta.
- `userAgent`: Backend-captured request header persisted in audit meta for troubleshooting device/browser-specific scan issues.

## API/actions
- Endpoint/action names:
  - `POST /api/qr-scan/log` (`backend/actions/qr-scan.ts`).
  - `POST /api/print/{box|item|smallitem|shelf}/:id` (returns `qrPayload` as part of print response; generation path references QR embedding).
- Request shape (`/api/qr-scan/log`):
  - Required: JSON body with `payload` object and non-empty `payload.id`.
  - Optional: `actor`, `scannedAt`, `source`.
- Response shape (`/api/qr-scan/log`):
  - `200`: `{ ok: true }`.
  - `400`: validation errors such as missing body, invalid JSON, missing payload object, missing `payload.id`.
  - `500`: `{ error: 'Internal error' }` on handler failure.
- Error cases:
  - Invalid JSON request body.
  - Missing/empty `payload.id`.
  - Runtime failure while reading request/logging event.

## UI components & routes
- Routes:
  - `/scan` renders `QrScannerPage`.
- Key components:
  - `frontend/src/components/QrScanButton.tsx`: builds scanner URL/state (`returnTo`, `callback`, `intent`) and navigates to scanner.
  - `frontend/src/components/QrScannerPage.tsx`: camera lifecycle, QR decode/validation, optional return routing, scan logging.
  - `frontend/src/components/SearchCard.tsx`: consumes `qrReturn` payload and can directly navigate to entities.
  - `frontend/src/components/BoxDetail.tsx` / `AddItemToBoxDialog.tsx` / `RelocateBoxCard.tsx`: specialized return consumers for scan intents.
- User flows:
  - Direct flow: open scanner -> decode QR -> validate -> log scan -> navigate to entity route.
  - Return flow: open scanner from a source page via `QrScanButton` -> decode and log -> navigate back to `returnTo` with `location.state.qrReturn` payload.

## State machine / workflow
1. **QR generation (backend print path)**
   - Print action builds entity label payload and calls label HTML renderer.
   - Label renderer creates QR PNG data URI from minimal JSON (`id`, `type`, `materialNumber`) and injects it into label template payload.
2. **Scan initialization (frontend `/scan`)**
   - Scanner validates browser capabilities (`getUserMedia`, `BarcodeDetector`), requests environment camera, and starts polling decode every 400ms.
3. **Decode + validate + route**
   - First QR detection raw value is parsed as JSON.
   - Scanner requires object payload and non-empty `id`; resolves route by prefix (`I-` => item, `B-`/`S-` => box).
   - Depending on `returnTo` and optional callback/intent, scanner either navigates directly or returns payload to caller.
4. **Backend audit log**
   - Scanner posts decoded payload + timestamp to `/api/qr-scan/log`.
   - Backend writes `QrScanned` event with `Meta` containing payload, timestamps, source, and user agent.

## Logging & error handling
- Log identifiers/events:
  - Frontend logger entries around invalid query params, scan resolution, routing, scan logging failures.
  - Backend console logs: successful scan event logging and structured failure messages.
  - Persisted event: `QrScanned` with `EntityType: 'Box'` and `EntityId` from `payload.id`.
- Warning conditions:
  - Invalid `returnTo`, callback, or intent query/state values are ignored with warning logs.
  - Backend returns 400 for malformed scan log payloads.
- Error conditions:
  - Camera/device capability failures (`getUserMedia` unavailable, missing `BarcodeDetector`).
  - QR decode/parsing/validation errors (non-JSON, missing `id`, unsupported prefix).
  - Backend log submission failure (`/api/qr-scan/log` not OK).
- try/catch boundaries:
  - Frontend wraps query parsing, camera start, video playback, detection loop, payload parse/validation, and navigation calls.
  - Backend wraps request parsing and full handler logic in nested/outer `try/catch` blocks, returning typed HTTP errors.

## Config & environment flags
- Required flags:
  - No dedicated required scanner-only env var; scanner depends on browser camera APIs and active backend endpoint.
- Optional flags:
  - `BASE_QR_URL`: base URL for QR links when generating public QR URLs.
  - `BASE_UI_URL`: base URL for UI links referenced by QR-related flows.
- Defaults/constraints:
  - If unset, `BASE_QR_URL` and `BASE_UI_URL` default to `${PUBLIC_ORIGIN}/qr` and `${PUBLIC_ORIGIN}/ui`.

## Dependencies & integrations
- Database:
  - Event log persistence via `logEvent` writing to event log table.
- Device integrations (printer/camera):
  - Browser camera (`getUserMedia`) and `BarcodeDetector` for scan capture.
  - Printer label rendering pipeline produces QR data URIs for printed templates.
- External services:
  - None required for scan decode/log path.

## Failure modes & troubleshooting
- Camera access denied/unavailable:
  - Detection signals: scanner status shows camera init/start error; frontend logs `QR scanner initialisation failed`.
  - Recovery: grant camera permission, use supported browser/device, retry scanner.
- Malformed QR payload:
  - Detection signals: scanner status set to error with JSON/id validation message; frontend logs `QR payload validation failed`.
  - Recovery: reprint label, verify QR encodes JSON with non-empty `id`, ensure ID prefix matches supported routes (`I-`, `B-`, `S-`).
- Backend scan-log failure:
  - Detection signals: non-blocking UI error message (`Scan konnte nicht protokolliert werden...`), frontend logs `Failed to log QR scan`, backend may emit 4xx/5xx logs.
  - Recovery: inspect `/api/qr-scan/log` payload and response, verify backend availability, review event-log persistence warnings from DB layer.

## Test/validation checklist
- Static checks:
  - Keep `QrScanned` present in `models/event-resources.json`.
  - Keep scanner intent/callback unions aligned between `QrScanButton` and `QrScannerPage`.
- Runtime checks:
  - Generate a label (`/api/print/...`) and verify `qrPayload` in response.
  - Scan valid `I-`, `B-`, and `S-` QR payloads and confirm expected navigation.
  - Validate malformed QR JSON and missing `id` produce scanner error state without crash.
  - Confirm scan still navigates when logging endpoint fails (with visible non-blocking warning).
- Contract sync verification:
  - Compare generated QR payload fields in `backend/lib/labelHtml.ts` with parse assumptions in `frontend/src/components/QrScannerPage.tsx`.
  - Confirm `/api/qr-scan/log` request/validation behavior matches component payload submission.

## Open questions / TODO
- [ ] Consider splitting scan audit entity typing (`Box` vs `Item`) based on QR prefix instead of current fixed `EntityType: 'Box'`.
- [ ] Consolidate duplicated QR intent/callback parsing into shared frontend helpers once another scanner consumer requires it.
