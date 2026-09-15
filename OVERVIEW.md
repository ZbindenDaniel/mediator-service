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

959. ✅ **Fotos tab captures from the camera**: `ItemImagesTab` gained a "Foto aufnehmen" button that opens the existing `PhotoCaptureModal` (from `ItemCreate`); the shot is persisted through the same `persistMediaUpdate`/slot logic as a picked file. Hidden when no camera API. → [media]
958. ✅ **Search never returns nothing when weaker matches exist**: the ≥50 % token rule moved from SQL (`WHERE token_hits >= …`, now `>= 1`) into JS — identical results whenever any row clears it, otherwise the best weaker matches come back ranked, with `relaxed: true` on the `/api/search` response and a `(relaxed…)` note on the `[search]` log. Covers items, boxes, refs and every `searchItemReferences` caller (intake `select_ref` included). UI hint deferred. → [ui]
957. ✅ Intake `select_ref` no longer comes back **empty for a clearly-named device**: the DMI vendor string ("Intel(R) Client Systems") polluted the ref search term — 5 tokens with a ≥50% hit threshold meant an `Intel NUC …` ref (2 hits) never qualified → `0 references`. `findRefCandidates` now strips `(R)`/`(TM)` marks + corporate filler (Inc/Corp/Client Systems/…), dedupes tokens, and falls back vendor+model → model → vendor before giving up; logs `[intake-start] ref candidates` with the tried terms. The untagged `search … (refs) →` line is now `[search]`. → [intake]
956. ✅ Shopware sync **survives a shop DB reset**: `upsertProduct` verifies the persisted `ShopwareProductId` (`/api/search-ids/product`) before PATCHing and falls back to the `productNumber` lookup → re-create instead of `WRITE_TYPE_INTEND_ERROR`; the re-resolved id is persisted → [erp-sync]
955. 🔧 Planning: **instance agentic flow** (compute/bootable devices only — the intake API's domain) — a `scope=instance` flow consumes intake evidence (structured scan + `memtest`/`SMART`/`battery` Phase-2 files; raw `dmidecode`/`lspci`/CPU-stress **not yet collected**) + `InstanceSpecs` and **reconciles** the device against its reference's web-derived data, producing a **reconciliation object** (evidence digest, field comparisons, findings, operator-gated proposed actions, informational data-quality score, status). It never mutates `item_refs` and **never auto-triggers a ref change**: findings are flagged, and an **operator approves** (one click) to enqueue the existing `rework` — human gate mandatory; auto-triggers deferred to post-MVP. Reconcile is **item-read-only** (writes only the reconciliation object + owned instance-spec fills), dual-path (inline + standalone `mode=reconcile`), backfillable via its own timestamp/version. Introduces `scope`/`measuredSignal` on the spec contract (compute subcategories, replaces the `INTAKE_TO_SPEC` map), run **history** via latest-row snapshot + append-only `agentic_run_history` (transcript jsonb; existing readers untouched), and a new **`KI-Runs` list type**. Reuse-vs-dedicated-flow to validate; **builds on the shipped snapshot/diff (#918), search-sources (#916) and grounding (#917) work** rather than duplicating it (instance-field history = extending `agentic_run_snapshots`, which defers instance fields today). MVP operator-initiated; UI + data inventories folded in. **Re-validated after the "new pipeline" contract work** (plan §17): spine holds but the `scope`-field idea is superseded — reference contracts were redefined around **capabilities** (RAM-Slots/Kapazität/Typ), so the revised plan uses a **separate instance-spec contract** + a Phase 0 to stabilize the mid-refactor reference contracts; `INTAKE_TO_SPEC` is now orphaned. See `docs/PLANNING_instance_flow.md` → [agentic]
954. ✅ **Rejected reviews now teach the next run.** On reject the wizard folds a concrete before→after correction diff (texts reworded, dimensions filled, specs changed/removed, price) plus notes into `LastReviewNotes` under a labelled header — which already flows into the next run's extraction/supervisor prompts and survives restart. Chosen over deriving lossy `bad_format`/`wrong_physical_dimensions` flags: a diff ("Höhe 26, removed spec *Marketing*, renamed to *Lenovo ThinkPad X200*") is richer and unambiguous, and it's guidance (supervisor still validates), not a hard overwrite. On approve nothing is emitted — edits are persisted, so corrected values are the next run's baseline. Frontend-only; new wizard tests cover it. Flag-based review metrics deferred. → [agentic]
953. ✅ Agentic review is now a **wizard**: `AgenticReviewWizard` walks Artikelbeschreibung → Kurztext → Spezifikationen → **Dimensionen (L/W/H/Gewicht, editable)** → Preis with **Zurück/Weiter**, each step edit-in-place with an always-present feedback box. The **approve/reject decision moved to the end** — a summary step recaps all values + notes with **Freigeben/Ablehnen**; the **Shop step appears only after Freigeben**. The decision is sent explicitly (`decision` in the payload) instead of being derived from per-step flags. Text + numeric edits ride `referenceEdits` → persisted to `item_refs` on approval; per-step notes are tagged and concatenated into the run notes. → [agentic]
952. ✅ Hard-drive **dimensions fall back to standard form factors**, via a new spec contract. HDD/SSD measurements are rarely published, so runs left Länge/Breite/Höhe blank. There was no spec contract for drives (subcategory **901**/905), so the per-subcategory `guidance` mechanism had nowhere to hook. Added `contracts/specs/901.json` (internal) + `905.json` (external) with proper fields (Speichertyp/Speicher/Formfaktor/Schnittstelle/…) and `guidance` telling the agent to fill dimensions from the form factor when sources are silent — 2.5″ → 100×70×7 mm, 3.5″ → 147×102×26 mm (901); external dims left to the enclosure (905). Guidance rides the existing `{{EXTRACTION_REVIEW}}`/`{{SUPERVISOR_REVIEW}}` injection — no change to the general extraction prompt. → [agentic]
951. ✅ Shopware pre-merge **review fixes**: (1) net price was computed `== gross` whenever `SHOPWARE_DEFAULT_TAX_ID` was pinned (cached tax id but rate left 0) — `resolveTaxId` now only short-circuits once the rate is known, else fetches the pinned tax's own rate. (2) Deactivating a product or dropping a ref below 2 instances left **variant children active + in stock** (sellable) — new `deactivateVariantChildren` cascades `active:false, stock:0` on both the deactivation and single-product paths. Verified variants 14/14 (+ deactivation cascade) + full Shopware suite regression. → [erp-sync]
950. ✅ Event-log export/import round-trip no longer corrupts `Meta` into `[object Object]`. `events.Meta` is a `jsonb` column, so `pg` returns it to `export-data.ts` as a **parsed JS object**, but `toCsvValue` serialized cells with `String(value)` → the literal `"[object Object]"` in `events.csv`; on re-import that string was bound into the `jsonb` column → `22P02 invalid input syntax for type json`, and since `insertEventLogEntry` swallows the error the whole event row was silently dropped. Fixed at the source — `toCsvValue` now `JSON.stringify`s object/array cells (Date excluded) so the value round-trips — plus importer hardening: `sanitizeEventMetaValue` drops a non-JSON `Meta` to `NULL` (with a warning) so a row from an already-broken export still imports instead of being lost (mirrors the `initDb` legacy-Meta sanitization). → [erp-sync]

