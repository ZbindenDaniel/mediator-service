a small service to map items to the boxes their stored in and the location they're placed.
the workflow is very basic: items are created according to a predefined scheme. items are either placed on a new or existing box. boxes are linked to a location.
when creating a box a label with key values and a qr code is printed to allow for inspection of a boxes content.

## QR scanning

Generated QR codes encode a JSON payload that always contains the Behälter identifier under the `id` key and may include extra
metadata (e.g., `label`, `location`, or `items`). The new `/scan` route in the React application uses the browser camera via the
`BarcodeDetector` API to read the QR code, validate the JSON, and route to `/boxes/{id}` after a successful scan. Every scan is
POSTed to `/api/qr-scan/log` so the backend can audit activity and correlate payload metadata with existing Behälterdaten.

## Development notes

- The server serves frontend static files from `dist/v2/frontend/public` when running the compiled build. During development, if `dist/v2/frontend/public/index.html` is missing the server will fall back to the workspace `v2/frontend/public` directory.

- The `build` script (see `package.json`) compiles TypeScript, bundles the frontend, and copies `v2/frontend/public` into `dist/v2/frontend/public` so the compiled server can run without requiring manual copying.

Quick commands:

```bash
# build (compiles TS, bundles frontend, copies public into dist)
npm --workspace mediator-service run build

# start
npm --workspace mediator-service start
```

## Agentic migration verification

Use the verification script to ensure the agentic run schema exists and that `backend/db.ts` can be loaded without TypeScript module errors:

```bash
node scripts/verify-agentic-migration.js path/to/mediator.sqlite
```

The script registers a TypeScript loader (falling back to a lightweight transpiler) before requiring the database module, so it should no longer throw `MODULE_NOT_FOUND` for `backend/db.ts`. If the script reports missing build artifacts or schema issues, rebuild the project before retrying.
