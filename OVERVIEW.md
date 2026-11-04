# Project Overview

Runbooks: [docs/detailed/](docs/detailed/README.md) · Changelogs: [docs/changelogs/](docs/changelogs/README.md)

## Current focus
- Agentic quality: AI-runs optimization phase 2 and the operator-gated instance flow — see [docs/plans/](docs/plans/README.md).
- Shopware follow-ups: reverse stock sync from orders, backfill of pre-existing products.

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

1022. ✅ Play-layer plan (gamification): transitions, rotating rewards, mini-quests, fun facts, overload guardrails → [ui]
1021. ✅ Merged Gitea `main` (Iyed: relocation box-name search, help renderer, search + Artikel help) into GitHub `main` with a real merge instead of an 81-commit rebase; help pages corrected against the current UI → [docs-infra]
1020. ✅ Version bumped to **4.0.0** — major release for the multi-tenant spare-part-cataloguing line (Authentik forward-auth identity, tenant scoping + roles, taxonomy externalization, one weighted quality system, parts catalogue); `package.json` + the stale `package-lock.json` root (was 3.1.0) realigned → [docs-infra]
1019. ✅ Docker image moved from EOL Debian bullseye to bookworm (apt 404s broke the build) → [docs-infra]
1018. ✅ Plans trimmed to three future designs in `docs/plans/`, user help updated for recent features, legacy compose/deploy files removed → [docs-infra]
1017. ✅ Docs cleanup: rewrote README/setup/architecture/env docs for v3.3, deleted stale trackers, finished plans and placeholder docs, pruned resolved items from todo.md → [docs-infra]
1016. ✅ Tenancy **Phase 4 FE polish**: the reference tab shows a **"Referenz löschen"** button for tenant-admins only — `resolveItemPermissions` now returns `canDeleteReference`, `ItemDetail` threads it to `ItemReferenceTab` as `onDelete`, which confirms, calls `POST /api/references/<nr>/delete`, navigates to the list on success and surfaces the 409 in-use / 403 cases. The other polish item (hide shelf-create from operators) needed no change — `ShelfCreateForm` lives only in the admin panel, which operators can no longer open after the M1 split. 1121 tests → [ui]
1015. ✅ Tenancy **Phase 4 admin-panel split** (§7 M1): deployment-wide admin controls are now **super-admin-only** — `requireSuperAdminAuth` gates `admin-{config,contracts,taxonomy,tenants,nightly-erp-sync,shopware,printer-queues,printer-settings}`; `requireAdminAuth` admits `super` (tenant-admin) for the operational endpoints (label queue, agentic dispatch, system status). New `GET /api/admin/access` reports the caller's tier; `AdminPage` probes it (so tenant-admins are admitted) and renders the super-admin-only sections (orgs/taxonomy nav, printer config, ERP, Shopware) only for super-admins. Break-glass password = super-admin, unchanged; feature flags are host config (no endpoint). 1118 tests → [docs-infra]
1014. ✅ Tenancy **Phase 4 reference curation** (§7 M2): operators edit only their **own org's** catalogue references (unchanged); **tenant-admins edit any** reference (shared-catalogue curation) and can **delete** references. `ownership.ts` gains `canEditReference`/`canDeleteReference`/`refWriteScopeParams`; the reference upsert safety net + `write-guard` (ref kind) + `save-item` permissions all route through them, so the FE's `canEditReference` gate follows automatically. New `POST /api/references/<nr>/delete` (`delete-reference` action) — tenant-admin+ only, 409 in-use guard blocks deleting a reference that still has instances, 404 if missing. Shopware product cleanup on ref-delete deferred (noted §7). 1114 tests → [docs-infra]
1013. ✅ Tenancy **Phase 4 role model** (resolved 2026-10-27): three cumulative tiers — operator (`normal`) < tenant-admin (`super`) < super-admin (`platform-admin`). `ownership.ts` gains `isTenantAdmin`/`isSuperAdmin`/`canManageShelves`; **shelf creation is now gated to tenant-admin+** in `create-box` (boxes stay open to operators; no-op for the live unrestricted system + platform admins). Confirmed no-work answers: within-org deletion has no role gate (operators remove own instances), onboarding stays manual, grey zone stays shared. `PLANNING_TENANCY.md` §7 records the model + two remaining forks (admin-panel split M1, reference edit/delete scope M2 incl. that reference deletion isn't built yet). 1105 tests → [docs-infra]
