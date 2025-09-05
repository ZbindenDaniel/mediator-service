a small service to map items to the boxes their stored in and the location they're placed.
the workflow is very basic: items are created according to a predefined scheme. items are either placed on a new or existing box. boxes are linked to a location.
when creating a box a label with key values and a qr code is printed to allow for inspection of a boxes content.

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