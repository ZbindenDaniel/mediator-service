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

894. ✅ Idle contract-audit sweeper (AUTO_REWORK, default off): stamps `SpecContractVersion` per run (#46) and, only while idle, re-applies the current spec contract to the oldest stale item — re-stamp if complete, else enqueue a targeted rework for now-missing required fields (deterministic, no LLM) → [agentic]
893. ✅ Targeted "KI Überarbeitung" rework: reuse the main pipeline to regenerate only operator-selected fields (partial update preserves the rest, categorizer/pricing skipped), driven by a field-picker + instruction modal → [agentic]
892. ✅ Auto-approve clearly-good agentic runs to a new ERP-eligible `auto_approved` state (supervisor PASS + confidence + no missing-required + no ambiguity), behind AUTO_APPROVE flag (default off) → [agentic]
891. ✅ Clarify run states: `cancelled` = user stops only; exhausted pipeline errors now terminate in `failed` with a reason surfaced in the UI → [agentic]
890. ✅ Skip-search hardening: honour skipSearch only when a stored search exists (else live-search fallback); thread the flag through bulk start + a bulk UI toggle → [agentic]
889. ✅ Fix spec field naming: canonicalize variant spec keys (CPU→Prozessor) onto the contract key so a present field is never reported missing and no duplicate sibling is stored → [agentic]
888. ✅ Close event-log coverage gaps: intake, CSV import, import-time box upsert, and stubs now emit lifecycle events; agentic events surface on item history (keying fix) → [item-lifecycle]
887. ✅ Item list Ki-Status filter is now a multi-select (checkbox popover; default = all except Freigegeben) → [ui]
886. ✅ Scanner UX: full-frame visual scan feedback (green ✓ / red ✗) + explicit "Schliessen" exit that routes the placement loop into inventory reconciliation → [scanning]
885. ✅ Inventory scan gets an exit route: unscanned box items can be stock-removed or location-cleared → [storage]
