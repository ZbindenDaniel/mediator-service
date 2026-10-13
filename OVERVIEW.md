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

974. ✅ Admin UI refit: admin pages were partly hidden under the fixed header (no 74px offset like other pages), so the Organisationen/Taxonomie links sat behind the heading. Now offset + shared admin styles (pill nav links, master-detail split, list rows with truncation, chips, compact forms, dashed "nothing to save" buttons). Taxonomy: category filter, code chips, Save only when changed, contract chips with real download/upload icons, add forms folded. Organisations: compact site table, auto-selects the first org. Checked with headless screenshots → [ui]
972. ✅ Fix: browsers kept an old frontend after updates (new "Organisationen verwalten" link missing) because index.html/bundle.js/bundle.css were served under fixed URLs with no cache headers. Now `Cache-Control: no-cache` + ETag (`utils/app-shell.ts`): revalidated on every load, 304 when unchanged → [docs-infra]
971. ✅ **Organisations admin page** (`/admin/organisationen`, platform admins): orgs live in the app DB (name, contact email for orders, linked Authentik group + optional admin group, active) with their warehouse **sites** (`tenant_sites`, floors), replacing the hardcoded site list. Logins resolve through the DB's group links (in-memory directory, refreshed on each save, no restart); `TENANT_GROUP_MAP` only seeds on first start (admin edits win). Shelf creation now validated server-side (site + floor must exist, own org's or unassigned sites only); sites reach the FE via `/api/app-config`. SQL verified on Postgres in a rolled-back transaction → [docs-infra]
970. ✅ **Deployment feature flags**: one manifest (`FEATURES`/`FEATURES_FILE`, default all on, fail-fast on typos) switches off 19 features (AI, printing, shopware, ERP sync, stubs, statistics/CO₂, help, intake, import/export, QR scan, item/box tabs, admin cards). Off = blocked: tagged actions 404 at the dispatcher, background jobs (AI dispatcher, print worker, shop/ERP sync) don't run, UI gated at mount via `GET /api/app-config` + `FeaturesContext`. Catalogue-deployment manifest from the 2026-10-13 meeting in `config/features.catalogue.example.json`. Tenancy plan revised with the meeting's decisions (redacted shared reads, owner-only edits, orgs in DB + admin tab) → [docs-infra]
969. ✅ Tenancy: **real users in the audit trail + admin by role** — when logged in via Authentik every actor-bearing handler records the login name (`resolveActor` in the remaining ~20 handlers incl. user marks, which no longer trust a client `username`); new FE `IdentityContext` (`/api/whoami` once at boot) makes `getUser()` return the login name, user settings show account/organisation/role + logout instead of a free-text name; `/api/admin/*` admits role `platform-admin` (403 for other logged-in users) and is forward-authed, so `ADMIN_SECRET` is break-glass from inside the host only; admin nav/shop-sync shown by role. Basic Auth mode unchanged. Jest: same 18 pre-existing failures, +8 passing → [docs-infra]
968. ✅ Tenancy **Stage 1 — login in front of the app** (opt-in): local `docker-compose.authentik.yml` + full nginx forward-auth config (`config/nginx/mediator.authentik.conf`, replaces the fragment; fixes its `proxy_pass` variable+URI bug), prod `docker-compose.prod.authentik.yaml` for the host Traefik (Authentik services, `ak-strip`→`ak-auth`, token-only machine router for `/api/admin/` + `/api/intake/`, no worker Docker socket) included by the deploy workflow when `AUTHENTIK_ENABLED=true`; backend `AUTH_REQUIRED` gate (data routes 401 without identity); prod Postgres bound to 127.0.0.1; guide rewritten as local→cloud setup. Jest: same 18 pre-existing failures, +7 passing → [docs-infra]
967. ✅ Identity-provider crash course (`docs/detailed/identity-provider.md`): plain-language explainer of Authentik + forward-auth (cast, request-flow diagram, groups→tenant/role, ordered setup with per-step checks, the one security rule, what is/isn't enforced, troubleshooting); nginx template now blanks client `X-authentik-*` on the non-forward-authed `/api/admin/` route (spoofed Actor gap) → [docs-infra]
966. ✅ Tenancy operator runbook (`docs/detailed/tenancy.md`): documents the live state — identity resolution + `TenantId` stamping work, isolation does **not** — and *why* `whoami`'s `tenant` is null (no proxy headers + no configured `defaultTenant`), the Authentik-group→tenant-id model (you create groups, not tenants), and three ladders to make it non-null (A: `TENANT_GROUP_MAP` defaultTenant only; B: curl `X-authentik-*` headers locally, dev-only; C: full Authentik + forward-auth), plus what's unenforced (Phase 3), how to inspect stamped rows, and the open decisions to settle. Indexed in detailed README → [docs-infra]
965. ✅ Tenancy **Phase 2b** (stamp-on-create + observable identity, behaviour-neutral): new `GET /api/whoami` echoes the identity the backend resolved for the request (verifies the forward-auth plumbing end-to-end); create handlers (`create-box`, `add-item`, `import-item`) now stamp `TenantId` on new items/boxes from `ctx.identity.tenant` via a `resolveTenant(ctx)` helper, and the item/box upserts preserve an already-set owner on conflict (`COALESCE`, never reassign); startup seeds the `tenants` registry from the config group map (`configuredTenants()`). Null until forward-auth is live, so neutral now. 912 tests → [docs-infra]
964. ✅ Tenancy **Phase 2a** (additive tenant schema, behaviour-neutral): `initDb` now creates a `tenants` registry + nullable `TenantId` on the private-logistics tables (`items`/`boxes`/`box_stubs`/`item_relations`/`quality_assessments`/`events`) + `ContributedByTenant` on `item_refs` (catalogue stays global), with tenant indexes; `db.ts` gains `listTenants`/`getTenant`/`upsertTenant`. Nothing stamped or filtered yet. Stamp-on-create (2b) deferred until forward-auth is host-verified. 901 tests → [docs-infra]
