# Changelog: Media & File Storage

Covers: item photos, file attachments, external docs (EAN/Serial/MAC-keyed), WebDAV storage, media health, alt-doc directories.

---

## 915. ✅ Accept MAC-keyed external-doc uploads into a serialNumber-typed dir (intake wipe reports)
**Why:** The netboot intake image uploads per-drive wipe certificates keyed by the drive serial
(`SN:<serial>`) but keys the machine-level wipe log and "orphan" certificates (drives with no
readable serial) by the machine MAC (`MAC:<mac>`). The `wipe-reports` dir is configured
`identifierType: "serialNumber"`, and `resolveAltDocDirPath` resolved strictly by the dir's type —
so every `MAC:`-keyed upload read the null `serialNumber` and returned `422 identifier_not_set`
(the whole wipe log and all orphan certs silently never landed). The `SN:`/`MAC:` prefix is the
caller declaring the identity directly (it already bypasses the DB lookup), so that declared type
must win over the dir's *default* type. Added an optional `identifierTypeOverride` param to
`resolveAltDocIdentifier`/`resolveAltDocDirPath`; the write action derives it from the prefix and
passes it (and stamps the effective type into the media-audit identifier). The overridden value is
still normalized, pattern-validated against the declared type, and path-guarded — a `MAC:` with a
non-MAC value is rejected, not path-escaped.
**Why (approach):** Chosen over adding a multi-type dir config (heavier schema change touching read,
list, and serve resolution) or duplicating serial-keyed certs. The dir's `identifierType` stays the
default for DB-lookup resolution and the UI availability listing; only an *explicit* prefixed request
overrides it, so nothing changes for real-item reads. The existing "no override → still null" guard
is kept (and tested) so the default resolution path is unchanged.
**Deferred:** MAC-keyed machine-level reports are stored durably but are not surfaced via the
`wipe-reports` listing on the machine item, because the read/serve paths still resolve real items by
the dir's default type (serial). Surfacing them (e.g. a dir accepting multiple identifier types, or a
MAC-typed companion dir) is left for later. The netboot-image/TUI contract in `intake-image.http` and
`media-storage.md` were updated to document the MAC fallback.

## 877. ✅ Route product-level attachments so all instances of a product see them
**Why:** The "Artikel (Produktebene)" binding was cosmetic — the file was still stored against a single `ItemUUID` and only listed for that instance, so sibling instances of the same `Artikel_Nummer` never saw it (the deferred gap from #760/#761). Gave `item_attachments` a product scope: added `Scope` (default `'instance'`) and `Artikel_Nummer` columns; product uploads send `X-Attachment-Scope: product`, are written under `dist/media/products/<artikelnummer>/`, and stored with `Scope='product'`. The product folder is derived server-side from the item row via `formatArtikelNummerForMedia()` — the client-supplied number is never trusted. Both read paths (the GET endpoint and the item-detail payload in `save-item.ts`) now return `WHERE "ItemUUID" = $1 OR ("Scope"='product' AND "Artikel_Nummer" = $2)`. Deleting a product-level attachment from any instance removes it for all (delete-for-all), matching its shared nature. The binding modal now appears whenever a real routing choice exists (product and/or external), not only for external dirs.
**Deferred:** No backfill of existing `artikel:`-labeled attachments — they remain instance-bound until re-uploaded (per product decision). Automatic cleanup of `products/<nr>/` folders on product delete (consistent with the existing no-cascade policy for instance attachments).

## 871. ✅ Show filename on broken image in media gallery
**Why:** When an image fails to load, operators saw only "Bild konnte nicht geladen werden." with no way to know which file was missing. Added the filename (last path segment of the src URL) below the error message in both the thumbnail and the modal fallback views, so operators can immediately identify and check the missing file.
**Deferred:** Nothing.

## 844. ✅ ALT_DOC_DIRS_FILE config, artikelNummer identifier, and grouped UI for external docs
   - **Why:** Config file (ALT_DOC_DIRS_FILE) replaces the inline JSON env var — easier to read, comment, and diff. Added `artikelNummer` as a fourth identifier type (alongside ean, serialNumber, macAddress), sourced from `items.Artikel_Nummer`, for service manuals and catalog-level supplier docs. UI binding modal now shows two-line options (label + `SN: value`, `EAN: value`, etc.) so operators see exactly where a file will be filed. File list groups external docs under a section header per directory showing the identifier type and value, replacing the flat mixed list. `identifierValue` added to ExternalDocSummary so the resolved identifier is available to the frontend.
   - **Deferred:** Image/photo support in external-docs serving (still PDF/TXT/CSV/XML/JSON only). Automatic cleanup on item delete (by design — no cascade).

## 805. ✅ Fix image slot always overriding first: volume path fix + deduplication
   - **Why:** Media files were written to `/app/dist/media/` (unvolume-backed) which was lost on restart. After restart, DB still had `Grafikname` pointing to the lost file, causing `galleryAssets` to double-count the same image (raw filename + URL form) and push new uploads to an unexpected high slot. Root fix is the volume path change (entry 803); image display corrects itself once files persist.
   - **Deferred:** Gallery deduplication improvement (raw filename vs URL in galleryAssets) if issues persist after rebuild.

## 803. ✅ Fix media uploads not persisting: align LOCAL_MEDIA_DIR with Docker volume mount path
   - **Why:** `config.ts` set `LOCAL_MEDIA_DIR = path.resolve(cwd, 'dist/media')` = `/app/dist/media`, but the Docker volume is mounted at `/app/dist/backend/media`. All uploaded images were written to an unvolume-backed path and lost on container restart. The Dockerfile comment (`# MEDIA_DIR=/app/dist/backend/media`) confirms the intended path. Fixed by changing the constant to `dist/backend/media`.
   - **Deferred:** Nothing.

## 761. ✅ Unified attachments tab: aggregates instance attachments + external docs (ALT_DOC_DIRS) in one view; upload modal routes files to the correct storage backend; external mount write/delete gated by per-dir `writable`/`deletable` flags (both default false)
   - **Why:** The previous implementation stored all uploads to the same endpoint with a label tag. The user wanted actual routing: external-mount uploads land in the correct filesystem path. The `deletable` flag defaults to false so no files are deleted without explicit opt-in per directory.
   - **Deferred:** Artikel_Nummer-keyed attachments (non-image product-level docs still go to item_attachments with a label); filesystem readiness check for ERP mirror target.

## 760. ✅ Attachment upload binding modal: intercept file selection in AttachmentsCard, show identifier-choice modal when 2+ options are available, store chosen binding as X-Label on upload, and display the binding type in the attachment list
   - **Why:** Users upload to one unified attachments tab but files need to carry provenance — whether they belong to the specific instance (ItemUUID), the product reference (Artikelnummer), or a per-unit identifier (SN/MAC/EAN). The modal is only shown when the item actually has 2+ non-null identifiers so it never adds friction for sparse items.
   - **Deferred:** Routing uploads to separate backend storage per binding type (e.g. Artikel_Nummer folder vs. instances/ folder) — currently all writes still go to POST /api/item/:uuid/attachments regardless of binding; the label carries the intent. Backend routing is the next step once the UI pattern is validated. UI surface for external-docs (ALT_DOC_DIRS) on the same tab is also deferred.

## 759. ✅ Added `docs/detailed/media-storage.md` runbook documenting all three storage concepts (item photos, instance attachments, identifier-keyed external docs)
   - **Why:** No dedicated doc existed for the media system. The identifier-based alt-doc-dirs feature (EAN/serial/MAC) is fully implemented in the backend but undiscoverable without docs. Runbook covers architecture, API surface, config, security, what is and isn't yet implemented, and key source files.
   - **Deferred:** UI component for external-docs (no React surface yet — noted as gap in the doc). Artikel_Nummer-keyed attachments (still ItemUUID today).

## 21. ✅ Collapse media path configuration to a single mounted root and derive fixed `shopbilder` / `shopbilder-import` subfolders for WebDAV + ERP mirror usage.

## 61. ✅ Clarify media storage and cleanup policy docs so `shopbilder` remains the Artikelnummer source-of-truth, `shopbilder-import` stays the flat sync mirror, and runtime cleanup defaults to minimal/manual-script operations with explicit logging expectations.
