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

1024. 🔧 Target doc note (§7b): **agentic input will grow and diversify** — a standing rule, a schema change, and a one-off search are different *kinds* of instruction; the eventual control surface (form first, chat later) is one front door for all. Kept high-level (north-star, not a build). → [docs-infra]
1023. ✅ **Catalogue data-quality grade on read (lever L10, slice 1).** A per-reference 1–5 data-quality grade mirroring main's condition `quality-score.ts`, derived on read from findings (conformance) + `checkSpecGap` (completeness) + `SpecContractVersion` (freshness), with a block-finding knock-out cap. New pure `computeDataQualityGrade` (`backend/agentic/data-quality.ts`, types in `models/data-quality.ts`); attached transiently as `AgenticRun.CurrentDataQuality` and shown as a `DataQualityBadge` above the KI-tab findings. Nothing persisted yet (weights are v0 to tune on real items). Tests green; tsc clean. → [agentic]
1022. 🔧 Re-aligned the **agentic levers plan** with main (v4.0.0): named the two orthogonal quality axes (condition/stock vs catalogue-data/reference), added the **autonomy ladder** (each auto rung earned by data from the one below), and promoted a **data-quality grade (L10)** to the next lever — mirroring main's proven `quality-score.ts` derive→store→recompute pattern, built on findings + spec-gap + contract freshness. Self-maintenance levers (L10→L4→L8) now precede review-UI polish. → [docs-infra]
1021. 🔀 Consolidated **origin/main** (v4.0.0 — the multi-tenant spare-part-cataloguing release, 93 commits: Authentik identity, tenant scoping + roles, taxonomy externalization, one weighted quality system, parts catalogue) into the agentic review-levers branch; resolved registry/package conflicts and renumbered our planning changelog entries to clear a collision with main's. → [docs-infra]
1020. ✅ Version bumped to **4.0.0** — major release for the multi-tenant spare-part-cataloguing line (Authentik forward-auth identity, tenant scoping + roles, taxonomy externalization, one weighted quality system, parts catalogue); `package.json` + the stale `package-lock.json` root (was 3.1.0) realigned → [docs-infra]
1019. ✅ Docker image moved from EOL Debian bullseye to bookworm (apt 404s broke the build) → [docs-infra]
1018. ✅ Plans trimmed to three future designs in `docs/plans/`, user help updated for recent features, legacy compose/deploy files removed → [docs-infra]
963. ✅ **Auto-approve now gates on findings, not confidence (lever L3).** The `AUTO_APPROVE` gate was keyed on the model's self-reported extraction confidence (unreliable); repointed it to **findings-clean** — a run auto-approves only when it has no `block` (missing-required) or `warn` (banned phrase / intake conflict) finding; info-level style hints tolerated (raise a rule's severity to gate). New pure `isAutoApprovable(findings)` in `findings.ts`; `item-flow` now computes findings first (on the wording-cleaned output) then the gate — so it **implicitly requires the wording pass** (fluffy prose leaves warn findings → no auto-approve). `AUTO_APPROVE` flag + `auto_approved` settle unchanged; `AUTO_APPROVE_MIN_CONFIDENCE` deprecated (no longer gates). Tests 246/246; tsc clean. → [agentic]
961. ✅ **Wording step after extraction (lever L2b).** A dedicated LLM pass (`flow/item-flow-wording.ts` `runWordingStage`) runs after extraction and **rewrites** the prose fields (`Artikelbeschreibung`/`Kurzbeschreibung`) into the house style + tidies `Langtext` spec key names — stripping marketing fluff and source-copied phrases ("mit einer Garantie von…") per `contracts/standards.json`, without changing facts. Extraction stays fact-oriented; wording owns style (the operator's shape). New `prompts/wording.md`, registered in `loadPrompts`. A **normal always-on stage** (no flag — consistent with extraction/supervisor/pricing; only autonomous behaviors are flagged); skipped in rework mode; failure/timeout keeps extraction's wording (never blocks). Tests `item-flow-wording.test.ts`; full agentic suite green; tsc clean. First real mechanic off the levers plan. → [agentic]
960. 🔧 Planning reset: **agentic review levers** (`PLANNING_agentic_levers.md`). The AI-data-quality planning had drifted into a from-scratch redesign (six pillars, new objects, a Workbench, an instance flow) — unbuildable as one step for a live pipeline. Reframed: `PLANNING_ai_data_quality.md` is now the **target/north-star**, and the new doc is the **working plan** — the smallest changes to the *existing* pipeline that move toward it, each anchored to a file that ships today (discipline: no lever without existing code). Inventories the machinery we already have (extraction, supervisor + `{{SUPERVISOR_REVIEW}}` slot, guidance injection, findings engine, `ambiguousFields`, auto-approve flag, contract-audit sweeper, reject-feedback loop, snapshots) and lists levers L1–L9 (scope tag on findings, standards→prompt prevention, auto-approve on zero findings, legible sweeper, per-finding actions, supervisor emits findings, exemplar findings on read, reject-feedback→standards, run provenance) ordered by leverage. Workbench / quality-grade formula / full reconcile flow / LLM auditor explicitly parked as emergent target-state. → [docs-infra]
