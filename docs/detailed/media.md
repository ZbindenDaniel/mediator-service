# Media Handling

This document describes the storage contract, path conventions, and operational policy for item media assets.

## Storage Layout

```
shopbilder/
  <Artikel_Nummer>/
    image1.jpg
    image2.jpg
    ...

shopbilder-import/
  image1.jpg          ← flat mirror for ERP sync
  image2.jpg
  ...
```

- **`shopbilder/`** — source of truth for item media. Files are organized per item by `Artikel_Nummer`. This is the authoritative location the application reads from and writes to.
- **`shopbilder-import/`** — flat mirror directory used by the ERP sync pipeline. Files here are copied or linked from `shopbilder/` on export/sync. Do not write directly to this directory from runtime code.

## Path Resolution

All media paths in the application are resolved relative to `MEDIA_DIR` (configured via environment). Access to media outside this root is blocked by path-guard middleware to prevent directory traversal.

Key invariants:
- `Grafikname` on an `ItemRef` is the primary image filename (e.g., `R-001_front.jpg`).
- `ImageNames` is a comma-separated list of additional images.
- Paths are stored as **bare filenames** (no directory prefix). The runtime prepends `shopbilder/<Artikel_Nummer>/` at read time.

## Destructive File Operations

All operations that modify or delete files must:
1. Be wrapped in `try/catch` so errors are surfaced and recoverable.
2. Emit **structured log entries** before and after the operation — include `path`, `operation`, and the triggering `context` (e.g., `'removeAsset'`, `'csvImport'`).
3. Validate the resolved path is within the expected root before proceeding.

Example log contract:
```ts
console.info('[media] Removing asset', { path: resolvedPath, context, actor });
fs.unlinkSync(resolvedPath);
console.info('[media] Asset removed', { path: resolvedPath, context });
```

## Cleanup Policy

- **No bulk recursive cleanup at runtime.** The application must not recursively delete directories during normal operation or CSV ingestion.
- If cleanup of orphaned images is needed, run dedicated maintenance scripts manually (`scripts/cleanup-orphaned-media.sh` or similar) — not inline from server code.
- WebDAV `removeAsset` requests are validated to reject absolute paths. Only relative paths within `shopbilder/` are accepted.

## Temporary Media and Transcripts

Temporary files (e.g., agentic transcripts, in-progress uploads) are stored under `items-meta-data/` rather than `shopbilder/`. This keeps the ERP-sync mirror clean and makes temporary data easy to identify.

```
items-meta-data/
  <Artikel_Nummer>/
    agentic-transcript.json
    ...
```

The `items-meta-data/` directory is **not mirrored** to `shopbilder-import/`.

## WebDAV Integration

- WebDAV endpoints serve files from `shopbilder/` (with path-guard enforcement).
- DELETE operations via WebDAV (`removeAsset`) reject requests that resolve to paths outside `shopbilder/`.
- Absolute path inputs are rejected before any filesystem operation.
