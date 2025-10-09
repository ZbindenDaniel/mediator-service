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

Quick commands:

```bash
# build (compiles TS, bundles frontend, copies public into dist)
npm run build

# start
npm start

# run tests (prebuild + node-based harness)
npm test
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
