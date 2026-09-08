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

963. ✅ Tenancy **Phase 1** (identity, code done): `backend/lib/identity.ts` resolves Authentik forward-auth headers (`X-authentik-username`/`-groups`) → `{authenticated,username,groups,tenant,role}` via a config-driven `group→{tenant,role}` map (`TENANT_GROUP_MAP`/`_FILE`), injected into the per-request `ctx`; `resolveActor()` prefers the authenticated username for the event-log Actor (applied to the item/box lifecycle handlers). Behaviour-neutral until the proxy is wired — `ADMIN_SECRET` stays break-glass. Proxy forward-auth is **templated** (`config/nginx/mediator.authentik.conf.example` + Traefik snippet + Authentik runbook in `docs/setup.md`, with header-spoof protection) pending on-host verification. 881 tests → [docs-infra]
962. ✅ Phased multi-tenancy plan (`docs/PLANNING_TENANCY.md`), identity-first: confirmed greenfield (backend has no per-user identity; no tenant column; Authentik stood up but unconsumed). Phases: (1) identity into `ctx` via Authentik forward-auth + `group→{tenant,role}` map — the prerequisite, independently valuable for multi-user audit; (2) additive nullable `TenantId` on logistics tables (behaviour-neutral); (3) class-aware scoping in `db.ts` (shared catalogue / private logistics); (4) tenant/user admin + org-token self-registration. Recaps the two-tier design + DL1–3; lists 5 open decisions → [docs-infra]
961. ✅ Taxonomy externalization **Phase 4** (editing — the payoff): `/admin/taxonomy` master-detail page (nav from `/admin`) edits labels/active + adds categories/subcategories via a new admin CRUD API (`/api/admin/taxonomy`), each write `reloadTaxonomyFromDb()` so it's live with no restart (codes immutable; reparenting/hard-delete deferred). Contracts stay file-based but become runtime-editable via a writable overlay (`CONTRACTS_OVERLAY_DIR`): reads overlay-first, `PUT /api/admin/contracts/{type}/<code>` validates+writes+invalidates cache, `DELETE` reverts; the page shows per-subcategory coverage badges + Download/Upload (download→edit→re-upload). 868 backend + 58 FE tests pass → [docs-infra]
960. ✅ Taxonomy externalization **Phase 3** (DB persistence): added `taxonomy_categories`/`taxonomy_subcategories` tables (additive) + `db.ts` accessors; `initTaxonomy()` runs after `initDb` — loads the seed file as a synchronous fallback, seeds the DB on first boot when empty, then reads the DB into the cache as the authoritative source (never throws; DB error → seed-file cache stays). `getItemCategories()` stays synchronous so consumers are unchanged; `reloadTaxonomyFromDb()` added for Phase 4 edits. Tests mock `../db` (seed-on-empty / DB-authoritative / error-fallback); 855 pass → [docs-infra]
959. ✅ Spec contract for All-in-One (`contracts/specs/109.json`): the `109 All-in-One` subcategory added in #937 had no spec contract (fell back to `general`); modelled on 102 (Standard-PC) + integrated-display fields (required Prozessor + Bildschirmgröße; optional Auflösung/Touchscreen/Speicher/RAM/Grafikkarte/Anschlüsse) + guidance. Auto-discovered, shipped to dist by the build → [item-lifecycle]
958. ✅ Taxonomy externalization **Phase 2** (frontend): new `TaxonomyProvider` fetches `GET /api/taxonomy` once at boot and exposes `{categories, lookups}`; migrated all consumers (`ItemDetail`, `itemFormShared`, `ItemBasicInfoForm`, `ItemListPage`) to `useTaxonomy()` and deleted the static `frontend/src/data/itemCategories.ts`. The FE no longer imports the taxonomy at build time — it comes from the API, so a deployment's taxonomy needs no FE rebuild. Context defaults to empty (graceful when no provider). All 58 FE tests pass; bundle clean → [docs-infra]
957. ✅ Taxonomy externalization **Phase 1** (backend runtime source): `backend/lib/taxonomy.ts` loads/validates/caches `config/taxonomy.seed.json` (a verified snapshot of the old hardcoded taxonomy, in the new field model — labelInternal/labelExternal, active, categorizerDescription, intake flags); `getItemCategories()` accessor + `GET /api/taxonomy` + startup fail-fast; backend lookup consumers, the categorizer reference (byte-parity tested), and the intake list now read the loader; build ships the seed to `dist/config`. Surfaced+fixed a bug: intake mapped "All-in-One" to code 302 (a printer) → added `109 All-in-One` under Computer. No new test failures → [docs-infra]
956. ✅ Phased plan to externalize the category taxonomy as a runtime, DB-backed, editable data object (`docs/PLANNING_TAXONOMY_EXTERNALIZATION.md`): loaded at startup + served via `GET /api/taxonomy` + seeded into DB from a shipped default, so one image runs any deployment's taxonomy and labels/categories edit without a rebuild (build-time codegen rejected — would force one image per taxonomy); backend stays synchronous via a startup cache, frontend moves to a boot-fetch provider; closes G-C1 → [docs-infra]
955. ✅ New-use-case planning doc: spare-part cataloging as a separate, multi-tenant deployment — readiness inventory (taxonomy hardcoded in 4 hand-synced copies; contracts drop-in; no use-case/tenant/feature-flag concept), feature-disposition (keep/strengthen/remove-by-config/out), and high-concept designs for a feature-flag manifest + two-tier tenancy (shared catalogue / private logistics on the ref↔instance seam) → [docs-infra]
954. ✅ **Rejected reviews now teach the next run.** On reject the wizard folds a concrete before→after correction diff (texts reworded, dimensions filled, specs changed/removed, price) plus notes into `LastReviewNotes` under a labelled header — which already flows into the next run's extraction/supervisor prompts and survives restart. Chosen over deriving lossy `bad_format`/`wrong_physical_dimensions` flags: a diff ("Höhe 26, removed spec *Marketing*, renamed to *Lenovo ThinkPad X200*") is richer and unambiguous, and it's guidance (supervisor still validates), not a hard overwrite. On approve nothing is emitted — edits are persisted, so corrected values are the next run's baseline. Frontend-only; new wizard tests cover it. Flag-based review metrics deferred. → [agentic]
