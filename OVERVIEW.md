# Project Overview

Runbooks: [docs/detailed/](docs/detailed/README.md) · Changelogs: [docs/changelogs/](docs/changelogs/README.md)

## Current focus
- Stabilize ERP sync by removing unproven continuation heuristics and preserving only behavior backed by known request evidence.
- Harden pricing-agent JSON reliability by repairing malformed model output before schema validation.

## System map

| Area | README | Primary changelog |
|---|---|---|
| Backend server | [backend/](backend/README.md) | — |
| Agentic pipeline | [backend/agentic/](backend/agentic/README.md) | [agentic](docs/changelogs/agentic.md) |
| API action handlers | [backend/actions/](backend/actions/README.md) | — |
| Frontend SPA | [frontend/](frontend/README.md) | [ui](docs/changelogs/ui.md) |
| Shared models | [models/](models/README.md) | — |
| Runtime contracts | [contracts/](contracts/README.md) | [item-lifecycle](docs/changelogs/item-lifecycle.md) |
| Print server | [cups/](cups/README.md) | [printing](docs/changelogs/printing.md) |
| Reference docs | [docs/detailed/](docs/detailed/README.md) | — |

## Topic changelogs

| Topic | File | Covers |
|---|---|---|
| Item lifecycle | [item-lifecycle.md](docs/changelogs/item-lifecycle.md) | Item CRUD, quality, specs, accessories, spare parts, CO₂ |
| Agentic pipeline | [agentic.md](docs/changelogs/agentic.md) | AI enrichment, extraction, review flow, dispatch queue |
| ERP sync | [erp-sync.md](docs/changelogs/erp-sync.md) | ERP import/export, CSV, Langtext, nightly sync, Shopware |
| Printing | [printing.md](docs/changelogs/printing.md) | Labels, CUPS, printer queues, drivers |
| Media & files | [media.md](docs/changelogs/media.md) | Photos, attachments, external docs, WebDAV |
| Storage & boxes | [storage.md](docs/changelogs/storage.md) | Boxes, locations, relocation, stubs, placement |
| Device intake | [intake.md](docs/changelogs/intake.md) | Intake station, netboot, cataloguing flow |
| Scanning & QR | [scanning.md](docs/changelogs/scanning.md) | QR generation, scanner workflows, audit |
| UI/UX | [ui.md](docs/changelogs/ui.md) | Frontend layout, navigation, help pages |
| Testing | [testing.md](docs/changelogs/testing.md) | Test coverage, test rewrites, test infrastructure |
| Docs & infra | [docs-infra.md](docs/changelogs/docs-infra.md) | Documentation, config, Docker, DB migrations |

## Recent changes (last 10)

957. ✅ Taxonomy externalization **Phase 3** (DB persistence): added `taxonomy_categories`/`taxonomy_subcategories` tables (additive) + `db.ts` accessors; `initTaxonomy()` runs after `initDb` — loads the seed file as a synchronous fallback, seeds the DB on first boot when empty, then reads the DB into the cache as the authoritative source (never throws; DB error → seed-file cache stays). `getItemCategories()` stays synchronous so consumers are unchanged; `reloadTaxonomyFromDb()` added for Phase 4 edits. Tests mock `../db` (seed-on-empty / DB-authoritative / error-fallback); 855 pass → [docs-infra]
956. ✅ Spec contract for All-in-One (`contracts/specs/109.json`): the `109 All-in-One` subcategory added in #937 had no spec contract (fell back to `general`); modelled on 102 (Standard-PC) + integrated-display fields (required Prozessor + Bildschirmgröße; optional Auflösung/Touchscreen/Speicher/RAM/Grafikkarte/Anschlüsse) + guidance. Auto-discovered, shipped to dist by the build → [item-lifecycle]
955. ✅ Taxonomy externalization **Phase 2** (frontend): new `TaxonomyProvider` fetches `GET /api/taxonomy` once at boot and exposes `{categories, lookups}`; migrated all consumers (`ItemDetail`, `itemFormShared`, `ItemBasicInfoForm`, `ItemListPage`) to `useTaxonomy()` and deleted the static `frontend/src/data/itemCategories.ts`. The FE no longer imports the taxonomy at build time — it comes from the API, so a deployment's taxonomy needs no FE rebuild. Context defaults to empty (graceful when no provider). All 58 FE tests pass; bundle clean → [docs-infra]
954. ✅ Taxonomy externalization **Phase 1** (backend runtime source): `backend/lib/taxonomy.ts` loads/validates/caches `config/taxonomy.seed.json` (a verified snapshot of the old hardcoded taxonomy, in the new field model — labelInternal/labelExternal, active, categorizerDescription, intake flags); `getItemCategories()` accessor + `GET /api/taxonomy` + startup fail-fast; backend lookup consumers, the categorizer reference (byte-parity tested), and the intake list now read the loader; build ships the seed to `dist/config`. Surfaced+fixed a bug: intake mapped "All-in-One" to code 302 (a printer) → added `109 All-in-One` under Computer. No new test failures → [docs-infra]
953. ✅ Phased plan to externalize the category taxonomy as a runtime, DB-backed, editable data object (`docs/PLANNING_TAXONOMY_EXTERNALIZATION.md`): loaded at startup + served via `GET /api/taxonomy` + seeded into DB from a shipped default, so one image runs any deployment's taxonomy and labels/categories edit without a rebuild (build-time codegen rejected — would force one image per taxonomy); backend stays synchronous via a startup cache, frontend moves to a boot-fetch provider; closes G-C1 → [docs-infra]
952. ✅ New-use-case planning doc: spare-part cataloging as a separate, multi-tenant deployment — readiness inventory (taxonomy hardcoded in 4 hand-synced copies; contracts drop-in; no use-case/tenant/feature-flag concept), feature-disposition (keep/strengthen/remove-by-config/out), and high-concept designs for a feature-flag manifest + two-tier tenancy (shared catalogue / private logistics on the ref↔instance seam) → [docs-infra]
951. ✅ Shopware pre-merge **review fixes**: (1) net price was computed `== gross` whenever `SHOPWARE_DEFAULT_TAX_ID` was pinned (cached tax id but rate left 0) — `resolveTaxId` now only short-circuits once the rate is known, else fetches the pinned tax's own rate. (2) Deactivating a product or dropping a ref below 2 instances left **variant children active + in stock** (sellable) — new `deactivateVariantChildren` cascades `active:false, stock:0` on both the deactivation and single-product paths. Verified variants 14/14 (+ deactivation cascade) + full Shopware suite regression. → [erp-sync]
950. ✅ Event-log export/import round-trip no longer corrupts `Meta` into `[object Object]`. `events.Meta` is a `jsonb` column, so `pg` returns it to `export-data.ts` as a **parsed JS object**, but `toCsvValue` serialized cells with `String(value)` → the literal `"[object Object]"` in `events.csv`; on re-import that string was bound into the `jsonb` column → `22P02 invalid input syntax for type json`, and since `insertEventLogEntry` swallows the error the whole event row was silently dropped. Fixed at the source — `toCsvValue` now `JSON.stringify`s object/array cells (Date excluded) so the value round-trips — plus importer hardening: `sanitizeEventMetaValue` drops a non-JSON `Meta` to `NULL` (with a warning) so a row from an already-broken export still imports instead of being lost (mirrors the `initDb` legacy-Meta sanitization). → [erp-sync]
949. ✅ Intake can now match a booted device onto a **pre-existing instance** instead of forcing a duplicate. Items catalogued before the intake API have no serial/MAC, so `/start`'s identifier lookup misses and the operator was pushed to create a new item. Now each `select_ref` candidate carries `matchableInstances` (instances of that ref with no serial/MAC, excluding in-device components + zero-stock), and the `type:'ref'` answer accepts `useItemUUID` to bind the scanned serial/MAC + scan onto the chosen instance (guarded: must belong to the ref, must not already carry a different identity → 409; idempotent). Fully additive — a script that ignores the new fields behaves as before. → [intake]
948. ✅ Shopware properties: **push all Langtext, filter only spec-contract fields**. Pushing every Langtext key as a filterable property flooded the storefront filter sidebar. Now **all** keys are still pushed as properties, but a property group is created **`filterable`** only when its key is a recognized spec-contract field — `registry.getFilterableSpecKeys()` = the union of `contracts/specs/*.json` `fields[].key` (e.g. Prozessor/Display/Anschlüsse for laptops), threaded through the snapshot as `filterablePropertyKeys`. Freeform keys become **non-filterable** properties (still visible on the product). `ensurePropertyGroup(name, filterable)` also **heals** an existing group whose flag differs (PATCH), so over-filtered groups from earlier syncs flip to non-filterable and a changed contract re-filters next sync; same rule applies to variant-axis groups (itemUUID/Zustand → non-filterable). Flag is global per group (Shopware has no per-product filterable), so the whitelist is the contract union. Verified 7/7 (create filterable/non-filterable by spec membership, heal both directions, all keys still pushed, back-compat all-filterable) + property/variant/multiaxis regression. → [erp-sync]
