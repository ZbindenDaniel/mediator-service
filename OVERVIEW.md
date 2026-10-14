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

981. ✅ Tenancy UI: another org's items are read-only in the UI (edit/relocate/remove/review/attachment/accessory/photo actions hidden via `permissions` in the item detail response), their org location opens an **org card** (name + contact email, `GET /api/orgs/:id`) instead of failing as a box, and "Ki Status" only shows with the AI feature on → [docs-infra]
979. ✅ Tenancy **Phase 3b — who sees what**: reads stay shared, but another org's item location shows the owner org's name (box id hidden), its boxes/shelves/Fundsachen are "not found" (detail, QR, lists, search), item/box logs + activity feeds show only own events, marks/AI reviewer hidden, search by box id blind to foreign boxes, item export own rows only, full export platform-admin only. Applied in the shared `db.ts` reads (`lib/redaction.ts`) + handlers with own SQL; live system without login unchanged. Verified on Postgres as two orgs → [docs-infra]
976. ✅ Tenancy **Phase 3a — who may change what**: `owner = TenantId ?? defaultTenant` (no backfill; the live system without login stays unrestricted, as do platform admins and background jobs; logged in without an org = read-only). Single policy in `lib/ownership.ts`; SQL safety net in the item/catalogue/box upserts (`DO UPDATE … WHERE owner = requester`, requester via `AsyncLocalStorage`); 403 guards on every write route (bulk all-or-nothing); catalogue entries read-only for other orgs while they may stock items of them; parts/components/relations/Fundsachen inherit the parent's owner. Verified on Postgres (rolled back) → [docs-infra]
974. ✅ Admin UI refit: admin pages were partly hidden under the fixed header (no 74px offset like other pages), so the Organisationen/Taxonomie links sat behind the heading. Now offset + shared admin styles (pill nav links, master-detail split, list rows with truncation, chips, compact forms, dashed "nothing to save" buttons). Taxonomy: category filter, code chips, Save only when changed, contract chips with real download/upload icons, add forms folded. Organisations: compact site table, auto-selects the first org. Checked with headless screenshots → [ui]
973. ✅ Plan for the laptop parts catalogue (`docs/PLANNING_PARTS_CATALOGUE.md`): part type = subcategory (210 Laptop-Ersatzteile), nesting via per-subcategory assembly contracts, quality roll-up bounded by per-slot `qualityFloor`, `multi` question type, nested drill-down assessment; reviewed against code — 3 blockers found and designed around (article-less components have no subcategory, `QUALITY_DEFAULT` would cap parents, article quality masks instance quality) → [item-lifecycle]
972. ✅ Fix: browsers kept an old frontend after updates (new "Organisationen verwalten" link missing) because index.html/bundle.js/bundle.css were served under fixed URLs with no cache headers. Now `Cache-Control: no-cache` + ETag (`utils/app-shell.ts`): revalidated on every load, 304 when unchanged → [docs-infra]
971. ✅ **Organisations admin page** (`/admin/organisationen`, platform admins): orgs live in the app DB (name, contact email for orders, linked Authentik group + optional admin group, active) with their warehouse **sites** (`tenant_sites`, floors), replacing the hardcoded site list. Logins resolve through the DB's group links (in-memory directory, refreshed on each save, no restart); `TENANT_GROUP_MAP` only seeds on first start (admin edits win). Shelf creation now validated server-side (site + floor must exist, own org's or unassigned sites only); sites reach the FE via `/api/app-config`. SQL verified on Postgres in a rolled-back transaction → [docs-infra]
970. ✅ **Deployment feature flags**: one manifest (`FEATURES`/`FEATURES_FILE`, default all on, fail-fast on typos) switches off 19 features (AI, printing, shopware, ERP sync, stubs, statistics/CO₂, help, intake, import/export, QR scan, item/box tabs, admin cards). Off = blocked: tagged actions 404 at the dispatcher, background jobs (AI dispatcher, print worker, shop/ERP sync) don't run, UI gated at mount via `GET /api/app-config` + `FeaturesContext`. Catalogue-deployment manifest from the 2026-10-13 meeting in `config/features.catalogue.example.json`. Tenancy plan revised with the meeting's decisions (redacted shared reads, owner-only edits, orgs in DB + admin tab) → [docs-infra]
969. ✅ Tenancy: **real users in the audit trail + admin by role** — when logged in via Authentik every actor-bearing handler records the login name (`resolveActor` in the remaining ~20 handlers incl. user marks, which no longer trust a client `username`); new FE `IdentityContext` (`/api/whoami` once at boot) makes `getUser()` return the login name, user settings show account/organisation/role + logout instead of a free-text name; `/api/admin/*` admits role `platform-admin` (403 for other logged-in users) and is forward-authed, so `ADMIN_SECRET` is break-glass from inside the host only; admin nav/shop-sync shown by role. Basic Auth mode unchanged. Jest: same 18 pre-existing failures, +8 passing → [docs-infra]
968. ✅ Tenancy **Stage 1 — login in front of the app** (opt-in): local `docker-compose.authentik.yml` + full nginx forward-auth config (`config/nginx/mediator.authentik.conf`, replaces the fragment; fixes its `proxy_pass` variable+URI bug), prod `docker-compose.prod.authentik.yaml` for the host Traefik (Authentik services, `ak-strip`→`ak-auth`, token-only machine router for `/api/admin/` + `/api/intake/`, no worker Docker socket) included by the deploy workflow when `AUTHENTIK_ENABLED=true`; backend `AUTH_REQUIRED` gate (data routes 401 without identity); prod Postgres bound to 127.0.0.1; guide rewritten as local→cloud setup. Jest: same 18 pre-existing failures, +7 passing → [docs-infra]
