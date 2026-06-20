# Media & File Storage

This document covers how the mediator service stores, resolves, and serves files. There are three storage
concepts with different identifiers, lifecycle rules, and access patterns.

## Overview

| Storage concept | Identifier used | Written by service | Example use |
|---|---|---|---|
| Item media (photos) | `Artikel_Nummer` | Yes | Product photos uploaded in item gallery |
| Item attachments | `ItemUUID` | Yes | Per-unit PDFs, scans, purchase records |
| Alternative document directories | `EAN`, `SerialNumber`, or `MacAddress` | No — read-only | Wipe reports, test certificates from external systems |

---

## 1. Item media (photos)

### Storage layout

```
dist/media/
  000123/          ← Artikel_Nummer zero-padded to 6 digits
    front.jpg
    back.jpg
  000456/
    ...
  instances/       ← item attachments (see section 2)
    ...
```

In WebDAV mode, a second read root at `<MEDIA_ROOT_DIR>/shopbilder/<artikelnummer>/` is also checked when
fetching, so photos already mirrored from an ERP appear alongside locally uploaded ones. Writes always
go to the local staging directory; the ERP root is read-only.

### Folder naming

`backend/lib/media.ts: formatArtikelNummerForMedia()` — numeric values are zero-padded to six digits
(`123` → `000123`). Non-numeric values are used as-is with a warning. If `Artikel_Nummer` is absent,
the legacy `ItemUUID` value is used as the folder name; this fallback is a migration window and will be
removed once all items carry `Artikel_Nummer`.

### Media roots

| Root | Env variable | Purpose |
|---|---|---|
| Staging (write + primary read) | Fixed: `dist/media` | All uploads; primary fetch source |
| ERP read root | `MEDIA_ROOT_DIR` → `<root>/shopbilder` | Optional read-only fallback (WebDAV) |
| ERP mirror target | `MEDIA_ROOT_DIR` → `<root>/shopbilder-import` | Destination for `/api/sync/erp` media copy stage |

Set `MEDIA_STORAGE_MODE=webdav` and `MEDIA_ROOT_DIR=/mnt/webdav` (absolute filesystem path, not a URL)
to enable the WebDAV read root. See `docs/ENVIRONMENT.md` for full configuration reference.

### API surface

- `GET /media/<relativeMediaPath>` — serves any file from staging root, then ERP root on miss. MIME type
  is detected automatically.
- `POST /api/items/:id/save-item` — attaches uploaded photo bytes to an item; writes to
  `dist/media/<artikelnummer>/`.
- `DELETE /api/items/:id/media` — removes a specific photo from the gallery.

---

## 2. Item attachments

Item attachments are per-instance files (PDFs, scans, invoices, certificates) uploaded directly by
operators. They are tracked in the `item_attachments` database table.

### Storage layout

```
dist/media/
  instances/
    I-123456-0001/
      wipe-report.pdf
      purchase-receipt.pdf
    I-123456-0002/
      ...
```

The folder is keyed by `ItemUUID`, making attachments per-instance rather than per-product. Two instances
of the same Artikel_Nummer have independent attachment folders.

### API surface

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/item/:itemUUID/attachments` | List all attachments for an instance |
| `POST` | `/api/item/:itemUUID/attachments` | Upload a file (body = raw bytes, `X-Filename` header required) |
| `DELETE` | `/api/item/:itemUUID/attachments/:id` | Remove a single attachment by DB id |

**Upload constraints:**
- Maximum file size: 50 MB
- Filename is sanitised: only `[a-zA-Z0-9._-]` characters are kept
- `X-Label` header: optional human-readable label stored in the DB

**Events logged:** `AttachmentAdded`, `AttachmentRemoved` (entity type `Item`, entity ID = `ItemUUID`).

### Known limitations

- No automatic folder cleanup when an item is deleted; orphaned `instances/<ItemUUID>/` directories must
  be removed manually.
- Attachments are not included in ZIP exports (media bundling was removed once WebDAV became the primary
  storage; re-evaluate if backup exports need per-unit attachments).

---

## 3. Alternative document directories (identifier-keyed external docs)

This mechanism maps existing external document stores onto item identifiers without the service writing
anything. It is the intended path for surfacing per-unit documents that are managed by other systems
(e.g. a wipe-report appliance that files reports by serial number, or a test lab that organises
certificates by EAN barcode).

### How it works

1. An external system stores files in a WebDAV share, organised by an identifier value:
   ```
   /mnt/wipe-reports/
     SN1234567/
       wipe-report-2026-01-15.pdf
     SN9876543/
       wipe-report-2025-11-02.pdf
   ```
2. An operator configures `ALT_DOC_DIRS` to describe the mount and which identifier to use.
3. When a client requests `/api/items/:itemUUID/external-docs`, the service looks up the item's
   identifier value from the database, resolves the filesystem path, lists the files, and returns URLs.
4. Files are served via `/external-docs/<dirName>/<itemUUID>/<fileName>`.

### Supported identifiers

| `identifierType` | Database source | Scope | Typical use |
|---|---|---|---|
| `ean` | `item_refs.EAN` | Product-level — shared across all units of same model | Datasheets, EU declarations of conformity |
| `serialNumber` | `items.SerialNumber` | Per physical unit | Wipe/erasure reports, test results per unit |
| `macAddress` | `items.MacAddress` | Per physical unit (network devices) | Per-unit config exports, network docs |
| `artikelNummer` | `items.Artikel_Nummer` | Product-level — internal catalog number | Service manuals, supplier documents |

### Configuration — `ALT_DOC_DIRS_FILE`

Set `ALT_DOC_DIRS_FILE=/etc/mediator/alt-doc-dirs.json` in `.env`. The file contains a JSON array:

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

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Unique key used in API URLs (`/external-docs/<name>/…`) — alphanumeric, hyphens, underscores |
| `mountPath` | Yes | Absolute filesystem path to the mounted root |
| `identifierType` | Yes | `ean`, `serialNumber`, `macAddress`, or `artikelNummer` |
| `normalize` | No | Optional transform before using value as folder name: `uppercase`, `lowercase`, `strip-colons` |
| `docType` | No | Human-readable label shown in the UI and API responses (e.g. `Löschprotokoll`) |
| `writable` | No | `true` to allow uploading new files via the UI (default: `false`). The upload modal shows this dir as a binding option only when `writable: true` and the item has the required identifier. |
| `deletable` | No | `true` to allow deleting individual files via the UI (default: `false`). Files are never deleted automatically — only explicit per-file UI actions are gated by this flag. |

### API surface

```
GET /api/items/:itemUUID/external-docs
```

Returns an array of directory summaries. Each entry includes `writable` and `deletable` flags so the
UI can show or hide the upload binding and delete button accordingly:

```json
{
  "docs": [
    {
      "name": "wipe-reports",
      "docType": "Löschprotokoll",
      "identifierType": "serialNumber",
      "available": true,
      "fileCount": 1,
      "files": [
        {
          "fileName": "wipe-report-2026-01-15.pdf",
          "url": "/external-docs/wipe-reports/I-123456-0001/wipe-report-2026-01-15.pdf"
        }
      ],
      "writable": true,
      "deletable": false
    },
    {
      "name": "test-results",
      "docType": "Prüfprotokoll",
      "identifierType": "ean",
      "available": false,
      "reason": "identifier_not_set",
      "fileCount": 0,
      "files": [],
      "writable": false,
      "deletable": false
    }
  ]
}
```

Possible `reason` values when `available: false`:
- `identifier_not_set` — the item does not have the required field populated (e.g. no `SerialNumber`)
- `directory_unavailable` — the configured mount path could not be read (mount offline, permissions)

```
GET /external-docs/:dirName/:itemUUID/:fileName
```

Serves a single file. Allowed extensions: `.pdf`, `.txt`, `.csv`, `.xml`, `.json`. All file access is
logged via the media audit framework.

```
POST /api/items/:itemUUID/external-docs/:dirName
```

Uploads a file to the external mount. Requires `writable: true` on the dir config — returns `403`
otherwise. Body: raw file bytes. Required header: `X-Filename`. The file is written to
`<mountPath>/<identifierValue>/<safeName>`. Returns `{ ok: true, fileName, url }`.

```
DELETE /api/items/:itemUUID/external-docs/:dirName/:fileName
```

Deletes a single file from the external mount. Requires `deletable: true` — returns `403` otherwise.
No files are ever deleted automatically on item deletion; only this explicit endpoint removes files.

### Security

- Identifier values are validated against type-specific allowlist patterns before use as path segments:
  - `ean` — `[0-9A-Za-z]+`
  - `serialNumber` — `[a-zA-Z0-9_-]+`
  - `macAddress` — `[0-9A-Fa-f:.-]+`
- The resolved path is checked with `resolvePathWithinRoot` (`backend/lib/path-guard.ts`) to reject any
  traversal attempt for both reads and writes.
- Only the file extensions listed above can be served; all other extensions are blocked.
- Write and delete operations emit structured audit events via the media audit framework.

---

## 4. Media audit logging

All media operations (uploads, deletes, mirrors, external-doc serves) emit structured audit events via
`backend/lib/media-audit.ts`. Each event carries:

```typescript
{
  action: 'write' | 'delete' | 'prune' | 'mirror-copy' | 'fetch',
  scope: 'item' | 'box' | 'erp-sync' | 'import' | 'external-docs',
  identifier: {
    artikelNummer: string | null,
    itemUUID: string | null,
    altIdentifierType?: string,
    altIdentifierValue?: string
  },
  path: string | null,
  root: string | null,
  outcome: 'start' | 'success' | 'blocked' | 'error' | 'skipped',
  reason: string | null,
  error: string | null
}
```

---

## 5. What is not yet implemented

| Gap | Notes |
|---|---|
| Artikel_Nummer-keyed item attachments | Attachments still use ItemUUID as the folder key |
| Automatic cleanup on item delete | Orphaned folders must be removed manually (by design — no cascade delete) |
| Filesystem readiness check for ERP mirror target | TODO in `backend/actions/sync-erp.ts` |
| Queryable media manifest API | TODO in `backend/actions/export-items.ts` — would enable CSV derivation |

---

## Key source files

| File | Role |
|---|---|
| `backend/lib/media.ts` | Media root resolution, `Artikel_Nummer` folder formatting, path helpers |
| `backend/lib/alt-doc-resolver.ts` | Identifier extraction, validation, normalization, path resolution for alt dirs |
| `backend/lib/path-guard.ts` | Path traversal prevention used by all storage operations |
| `backend/lib/media-audit.ts` | Structured audit event emitter |
| `backend/actions/item-attachments.ts` | Upload/list/delete for instance-level attachments |
| `backend/actions/item-external-docs.ts` | List external docs for an item across configured alt-doc dirs |
| `backend/config.ts` | `ALT_DOC_DIRS` parsing and `MEDIA_ROOT_DIR`/mode resolution |
| `docs/ENVIRONMENT.md` | Full environment variable reference including `ALT_DOC_DIRS` schema |
