# Changelog: Device Intake Station

Covers: device intake cataloguing flow, quality questions at intake, netboot architecture, Phase 1/2 separation, scan.txt.

---

## 884. ✅ Intake reference step: bootable-only categories, auto description, drop "funktionsfähig?"
   - **Why:** Three redundancies in the reference/quality steps. (1) The category dropdown (`GET /api/intake/categories`) offered non-bootable devices (Monitor, external screen) that can never reach a netboot station — pruned to the five bootable categories, and the mismatched `Hauptkategorien_A` codes were aligned to the canonical taxonomy (10/20/…) since the file was already being edited. (2) The operator re-typed a "short description" (`Kurzbeschreibung`) that the station had already scanned — `Kurzbeschreibung` is now optional and defaults to `scanPayload.model` (the model name), and `select_ref` echoes the scanned vendor/model so the TUI can pre-fill both fields. `Artikelbeschreibung` continues to compose as `Hersteller + Kurzbeschreibung`. (3) "Ist der Artikel funktionsfähig?" was nonsensical — the device just booted the intake image, so it is functional by definition. Removed the `is_functional` question from `contracts/quality/general.json`; both the TUI and `QualityReviewStep` render the contract generically, so it disappears from both with no code change.
   - **Deferred:** No `bootable` flag was added to the canonical taxonomy (`models/item-categories.ts`); the intake category list stays a hardcoded subset. The `is_functional` DB column and `deriveQualityTagFromCondition()` are untouched — they remain in use by `move-item`/`remove-from-device`. Quality value 1 (Ersatzteil) is no longer reachable through the general contract at intake, which is the intended consequence (a booting device is functional).

## 845. ✅ Device Intake Station API — 4 endpoints + Phase 2 file upload support
   - **Why:** Alpine Linux netboot image on donated devices needs a minimal API to catalog items without a full UI. State machine routes each device boot to the correct step (select_ref → quality → phase2) based on DB state, so already-completed steps are skipped automatically. Phase 2 test results upload via the existing external-docs endpoint with SN:/MAC: prefix to bypass the DB lookup before item creation.
   - **Deferred:** scan.txt augmentation of agentic extraction prompt (reading Phase 2 scan results before the agentic run starts); operator notification on completion; InstanceSpecs sync across ref-sharing instances. These are v2 concerns that don't block the core flow.
