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

1027. ✅ **Legible auto-rework sweeper (lever L4, slice 1).** The `AUTO_REWORK` idle sweeper acted silently; now it logs the whole stale backlog ("N stale: X rework, Y restamp") and emits activity-log events (`ContractAuditRework`/`ContractAuditRestamp`, actor `auto-rework`) so its automated actions are auditable. New pure `planContractSweep` + a no-side-effect `previewContractSweep` dry run so an operator can see the backlog before trusting it on. Behaviour unchanged (one rework/tick, self-limiting). Grade-driven targeting + UI surface deferred. 1164 pass; tsc clean. → [agentic]
1026. ✅ **Review wizard: review by exception (lever L5b).** A clickable stepper marks which steps carry a finding (jump straight there) and verified spec rows collapse behind a "✓ N geprüfte Felder anzeigen" toggle — reviewers see only what needs attention instead of paging every field. Summary unchanged; the L5a model-rework is deliberately kept out of the wizard (would clobber unsaved edits). Extended wizard tests; 1161 pass; tsc clean. → [ui]
1025. ✅ **Findings are actionable (lever L5a).** Each surfaced finding the machine can resolve by regenerating one field (`ask === 'fix'`) gets a **"Beheben"** button in the KI tab that fires a field-scoped rework via the existing path — you act on the problem instead of a blind field-picker. The old **"KI Überarbeitung"** button is demoted to a secondary "Feld manuell überarbeiten…" fallback. `choose` conflicts + verified-collapse are next (L5b/c). New `FindingsPanel.test.tsx`; 1157 pass; tsc clean. → [ui]
1024. 🔧 Target doc note (§7b): **agentic input will grow and diversify** — a standing rule, a schema change, and a one-off search are different *kinds* of instruction; the eventual control surface (form first, chat later) is one front door for all. Kept high-level (north-star, not a build). → [docs-infra]
1023. ✅ **Catalogue data-quality grade on read (lever L10, slice 1).** A per-reference 1–5 data-quality grade mirroring main's condition `quality-score.ts`, derived on read from findings (conformance) + `checkSpecGap` (completeness) + `SpecContractVersion` (freshness), with a block-finding knock-out cap. New pure `computeDataQualityGrade` (`backend/agentic/data-quality.ts`, types in `models/data-quality.ts`); attached transiently as `AgenticRun.CurrentDataQuality` and shown as a `DataQualityBadge` above the KI-tab findings. Nothing persisted yet (weights are v0 to tune on real items). Tests green; tsc clean. → [agentic]
1022. 🔧 Re-aligned the **agentic levers plan** with main (v4.0.0): named the two orthogonal quality axes (condition/stock vs catalogue-data/reference), added the **autonomy ladder** (each auto rung earned by data from the one below), and promoted a **data-quality grade (L10)** to the next lever — mirroring main's proven `quality-score.ts` derive→store→recompute pattern, built on findings + spec-gap + contract freshness. Self-maintenance levers (L10→L4→L8) now precede review-UI polish. → [docs-infra]
1021. 🔀 Consolidated **origin/main** (v4.0.0 — the multi-tenant spare-part-cataloguing release, 93 commits: Authentik identity, tenant scoping + roles, taxonomy externalization, one weighted quality system, parts catalogue) into the agentic review-levers branch; resolved registry/package conflicts and renumbered our planning changelog entries to clear a collision with main's. → [docs-infra]
1020. ✅ Version bumped to **4.0.0** — major release for the multi-tenant spare-part-cataloguing line (Authentik forward-auth identity, tenant scoping + roles, taxonomy externalization, one weighted quality system, parts catalogue); `package.json` + the stale `package-lock.json` root (was 3.1.0) realigned → [docs-infra]
1019. ✅ Docker image moved from EOL Debian bullseye to bookworm (apt 404s broke the build) → [docs-infra]
1018. ✅ Plans trimmed to three future designs in `docs/plans/`, user help updated for recent features, legacy compose/deploy files removed → [docs-infra]
