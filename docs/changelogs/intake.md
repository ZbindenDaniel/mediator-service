# Changelog: Device Intake Station

Covers: device intake cataloguing flow, quality questions at intake, netboot architecture, Phase 1/2 separation, scan.txt.

---

## 895. ✅ Deferred-identity in-device components (creation → graduation → gates)
**Why:** Phase-2 artefacts (wipe, SMART) are produced per sub-device, but components had no
identity — reports could only attach to the machine serial and drives never became items. We
make any scanned sub-device a first-class instance that carries **no Artikelnummer** while
inside its parent, so it needs no catalog reference until it is actually extracted. Key
simplifications that keep it tractable: reports are **serial-keyed** (a report at `SN:<serial>/`
surfaces on whichever item carries that serial — no file moves), and identity is **write-once**
(set once at Zerlegung, never changed — no re-link operation to make safe). Built in slices:
(1) **creation** — at the intake ref step `syncInDeviceComponents` materializes one component
per disk with a usable serial (`Artikel_Nummer` NULL, `BoxID` NULL, `Zerlegt_aus` + `SlotKey`),
idempotent on re-scan (keyed on the globally-unique drive serial), with a shared serial-hardening
guard rejecting blank/placeholder serials; components carry a temporary `C-` UUID that the
Artikelnummer parsers degrade past. (2) **graduation** — `remove-from-device` now doubles as the
Zerlegung step: set identity (existing/new ref, write-once, 409 on re-set) and re-mint `C-` →
`I-<Artikelnummer>-####`, re-pointing every UUID-keyed row (`items` PK, `item_relations` ×2,
`events`, `item_attachments`, `label_queue`; `user_item_marks` cascades) in one transaction —
reports untouched. (3) **gates** — `IN_DEVICE_COMPONENT_SQL` excludes boxless `Zerlegt_aus`
children from ERP/Shopware export; `queueLabel` refuses reference-less items. Scan `disks[]`
extended with `serial`/`wwn`/`model`; the intake image contract lives in
[`intake-image.http`](../detailed/intake-image.http). Full model in
[`docs/detailed/component-lifecycle.md`](../detailed/component-lifecycle.md).
**Why (approach):** Reused the existing `Zerlegt_aus` + `BoxID IS NULL` convention rather than a
new "component" table/flag, so **deletion needed no new code** (`remove-item` already deletes
unextracted children with the parent; `catalog-spare-part` delete-link already refuses when
boxed) and the default list already nests components (ZubehoerMode `connected`). Parent →
Ersatzteil is now **contract-gated** (`markParentAsSpare`, decoupled from extraction) because a
drive pulled from a device sold whole must not mark the parent a spare-part donor; default true
preserves the historical parting-out behavior.
**Deferred:** manual "add unidentified component" UI (backend paths exist; no explicit
add-in-Zerlegen entry point); the contract signal source for `markParentAsSpare` (a parent/Auftrag
field vs. operator toggle) is not yet wired — the API never auto-marks without the flag; severing
the `Zerlegt_aus` provenance link on sale/stock-removal (link is kept after graduation); verifying
the intake image can read per-drive serials for every bench drive type (`wwn`/`model` fallback
exists); re-link/change-reference remains out of scope by construction.

## 884. ✅ Intake reference step: bootable-only categories, auto description, drop "funktionsfähig?"
   - **Why:** Three redundancies in the reference/quality steps. (1) The category dropdown (`GET /api/intake/categories`) offered non-bootable devices (Monitor, external screen) that can never reach a netboot station — pruned to the five bootable categories, and the mismatched `Hauptkategorien_A` codes were aligned to the canonical taxonomy (10/20/…) since the file was already being edited. (2) The operator re-typed a "short description" (`Kurzbeschreibung`) that the station had already scanned — `Kurzbeschreibung` is now optional and defaults to `scanPayload.model` (the model name), and `select_ref` echoes the scanned vendor/model so the TUI can pre-fill both fields. `Artikelbeschreibung` continues to compose as `Hersteller + Kurzbeschreibung`. (3) "Ist der Artikel funktionsfähig?" was nonsensical — the device just booted the intake image, so it is functional by definition. Removed the `is_functional` question from `contracts/quality/general.json`; both the TUI and `QualityReviewStep` render the contract generically, so it disappears from both with no code change.
   - **Deferred:** No `bootable` flag was added to the canonical taxonomy (`models/item-categories.ts`); the intake category list stays a hardcoded subset. The `is_functional` DB column and `deriveQualityTagFromCondition()` are untouched — they remain in use by `move-item`/`remove-from-device`. Quality value 1 (Ersatzteil) is no longer reachable through the general contract at intake, which is the intended consequence (a booting device is functional).

## 845. ✅ Device Intake Station API — 4 endpoints + Phase 2 file upload support
   - **Why:** Alpine Linux netboot image on donated devices needs a minimal API to catalog items without a full UI. State machine routes each device boot to the correct step (select_ref → quality → phase2) based on DB state, so already-completed steps are skipped automatically. Phase 2 test results upload via the existing external-docs endpoint with SN:/MAC: prefix to bypass the DB lookup before item creation.
   - **Deferred:** scan.txt augmentation of agentic extraction prompt (reading Phase 2 scan results before the agentic run starts); operator notification on completion; InstanceSpecs sync across ref-sharing instances. These are v2 concerns that don't block the core flow.
