# Changelog: Device Intake Station

Covers: device intake cataloguing flow, quality questions at intake, netboot architecture, Phase 1/2 separation, scan.txt.

---

## 911. ✅ Fix intake reference matching + "HP HP HP" brand triplication
**Why:** The intake flow failed to surface an existing reference even for an identical device,
pushing operators to create duplicates with mangled names ("HP HP HP ProBook 470 G4"). Two
compounding root causes: **(1) wrong column** — `findRefCandidates` matched the scanned model only
against `item_refs."Kurzbeschreibung"`, but the kivitendo/ERP importer maps `description →
Artikelbeschreibung`, `suchbegriff → Suchbegriff`, `notes → Kurzbeschreibung`, so for every
imported ref the model name lives in `Artikelbeschreibung` while `Kurzbeschreibung` holds (usually
empty) notes — the match never touched the right field. Only intake-created refs round-tripped,
because `findOrCreateRef` writes the model into `Kurzbeschreibung`. **(2) duplicated vendor** — the
netboot image embeds the brand in `model` (e.g. `vendor="HP"`, `model="HP HP ProBook 470 G4"`), so
even against the right column the contiguous `%HP HP ProBook 470 G4%` substring missed the clean
description, and the name builder's unconditional `[Hersteller, model].join(' ')` produced a triple
brand. Fixes: (a) matching now searches `Artikelbeschreibung`/`Suchbegriff`/`Kurzbeschreibung` (and
matches the vendor against `Hersteller` OR the description) after stripping the leading vendor from
the model term; (b) a new `backend/lib/intake-naming.ts` (`stripLeadingVendor`, `composeRefName`)
strips a leading brand before composing the name so `Hersteller` is prepended exactly once, applied
in `findOrCreateRef` (new refs) and defensively in `intake-complete` (agentic hand-off).
**Why (approach):** Broadening the candidate query (OR across the three description columns, vendor
in `Hersteller` OR description) is the right trade for a candidate list the operator confirms — a
false positive is cheap, a miss creates a duplicate reference. Stripping the vendor server-side
keeps the fix tolerant of the external netboot image (out of this repo) rather than depending on it
to emit a clean model. This reconciles the #884 assumption ("Kurzbeschreibung is the model name",
true only for intake-created refs) with the importer's actual column mapping.
**Deferred:** Matching stays substring-based (contiguous cleaned model within a description column);
token/fuzzy/accent-fold matching was not added. No backfill of already-created duplicate refs or
brand-triplicated names. The external intake-station TUI still combines echoed `vendor`+`model` when
pre-filling the new-ref form — the backend is now defensive against that, but the TUI itself is
unchanged.

## 905. ✅ Resolve `showIf` against auto-answered controllers (auto-resolve robustness)
**Why:** With auto-resolution, a question's `showIf` could point at a question the server
auto-answered (`autoFill`/`skipAtIntake`). The script never sees auto-answers, so it would evaluate
the `showIf` as unmet and wrongly hide the dependent — a latent trap as contracts grow (no current
contract hits it). `resolveIntakeQuestions` now resolves such `showIf`s server-side: if the
auto-answered controller meets the condition the dependent is asked unconditionally (the `showIf`
is stripped, since the controller isn't shown), otherwise it is dropped. `showIf`s pointing at
still-asked questions are untouched (the client handles them as before).
**Why (approach):** Two-pass split (compute auto-answers first, then resolve dependents) so it works
regardless of question order. Keeps the script a dumb renderer — no client-side awareness of
auto-answers needed.
**Deferred:** Nothing.

## 904. ✅ Enrich the human-judgment quality questions; decouple keyboard layout
**Why:** After auto-resolution the intake questionnaire was thin, and the one cosmetic question was
too generic. Split the generic `condition_optical` ("Optischer Zustand?") in `general.json` into
`discoloration_residue` ("Verfärbungen oder Kleberückstände?") and `scratches` ("Kratzer?"), and
added laptop condition questions to `quality/201.json`: `keyboard_condition`, `screen_condition`,
`battery_swollen` ("Akku aufgebläht oder verformt?" → quality 1, the safety check the battery %
signal can't catch), `hinges_ok`, `fan_dusty`. Also **decoupled `keyboard_layout`** — moved it out
of the keyboard assembly part's `specQuestion` into `quality/201.json` as a standalone question, so
a human-only spec is never orphaned by skipping its presence question (`has_keyboard` stays in
assembly for Zerlegen). A laptop now asks ~10 human-judgment questions (cosmetic, OS, keyboard
layout+condition, display, swollen battery, hinges, dust) while the 8 scan/boot-known ones stay
auto-resolved.
**Why (approach):** These are all genuine human observations (no `autoFill`/`skipAtIntake`), so they
just flow through the existing resolver as `ask`. Decoupling `keyboard_layout` to the quality
contract (option 2) keeps its id/specField (`Tastatur-Layout`) unchanged, so downstream specs and
the operator review are unaffected; the keyboard slot in Zerlegen simply no longer carries an inline
layout field. Contract versions bumped (general v3→v4, 201 v5→v6).
**Deferred:** More condition questions (ports/charging jack, trackpad, free-text Bemerkungen) are
easy follow-ons — left out to keep the set focused. `fan_dusty` is recorded in the assessment
responses only (no spec/quality impact) — a maintenance flag, not a defect.

## 903. ✅ Auto-resolve intake questions from the scan (contract-declared, not hardcoded)
**Why:** A booting laptop was still asked presence questions it obviously satisfies ("Lüfter/Display/
Mainboard vorhanden?") and re-asked data the scan already has (RAM, storage, drive type, battery) —
the scan values were only used as a shown `defaultValue`. Now the intake questionnaire returns
**only the questions a human must decide**; everything else is answered server-side. Two fields,
declared per question in the contract JSON (no code, no hardcoded question-id table):
`autoFill: "<signal>"` binds a question to a named scan signal (`ram` / `storageSize` /
`storageType` / `battery`) — the server auto-answers and drops it, numeric signals snapping to the
question's own `values`; `skipAtIntake: true` means "a booted device implies this" — assumed
present and dropped. `resolveIntakeQuestions` splits the merged contract questions into `ask` vs.
`autoAnswers`; at the quality step the auto-answers are merged **under** the submitted answers
(operator/script wins) before scoring + spec derivation, so quality and specs stay complete. The
old hardcoded `FIELD_MAPPERS` (question-id → scan field, with hardcoded option arrays) is gone —
replaced by a small named-signal registry that snaps to the contract's `values`. Applied to
`assembly/201.json` (skip fan/keyboard/display/mainboard; autoFill ram/storage/drive_type/battery)
and `assembly/102.json` (skip cpu/mainboard, keep gpu; autoFill ram/storage/drive_type). The raw
scan is persisted at the ref step (`items.IntakeScan`) so the quality step resolves without the
script re-sending it — **no script change** (it already renders `qualityQuestions` generically).
**Why (approach):** Named signals (contract says `autoFill: "ram"`, code holds ~4 adapters) over a
fully-declarative JSON transform spec — the signal set maps 1:1 to what the image actually gathers,
which is the only legitimate code coupling; everything else (which question is auto/skip) is JSON.
Persisting the scan server-side (vs. requiring a `scanPayload` echo) keeps the script contract
unchanged. `quality-review` is untouched — the operator/refurb flow still asks everything.
**Deferred:** No intake-time "show everything / advanced" override to correct a mis-scan (auto now,
editable later on item detail). `battery` auto-labels from percent — a swollen battery reporting a
healthy % isn't caught at intake. Battery/drive-type signal label strings must match the question's
`values` (a named-signal tradeoff).

## 902. ✅ Generalize intake sub-devices to a `components[]` object (PCI fills assembly info)
**Why:** The intake→component pipeline only read `disks[]`, but the lifecycle (deferred identity,
serial-keyed reports, graduation, gates) is not disk-specific. Generalized the input to a single
extensible `IntakeComponent` object — `{ kind, slotKey?, serial?, wwn?, vendor?, model?, type?,
sizeGb?, attributes? }` — carried in `scan.components[]`. `disks[]` stays as a shorthand for
`kind:'disk'` (folded in via `normalizeScanComponents`). Auto-creation is now **serial-gated and
kind-agnostic**: any component with a usable serial becomes an in-device item (disks, serial-bearing
NICs/GPUs); serialless components (typical PCI cards) are **not** created. Instead a detected
serialless component **fills assembly info** — `preFillQualityQuestions` pre-fills, by slot-key
convention, `has_<slotKey>` → `"true"` and `<slotKey>_model` → its model, so a detected GPU tagged
`slotKey:"gpu"` pre-answers a `has_gpu` question (operator confirms), provided the subcategory's
assembly contract defines that slot. `deriveInstanceSpecsFromScan` and the scan→default mappers now
read the disk-kind component instead of `disks[0]`. Guide + `.http` updated.
**Why (approach):** Serial-gating (not a hardcoded kind allowlist) keeps it future-proof and
naturally does the right thing — PCI cards usually lack a stable serial, so they fall to
assembly-info without special-casing; a serial-bearing card that *is* inventory-worthy still works.
The slot-key pre-fill convention reuses the flat question shape (no slot metadata needed at pre-fill).
**Deferred:** Auto-creating items for serial-bearing PCI is allowed by the serial gate (not
kind-restricted) — revisit if a kind allowlist is ever wanted. Recording detected serialless
components that map to no assembly slot (pure visibility) is not done.

## 900. ✅ Intake quality step produces a complete item (specs + accessories)
**Why:** The intake quality step only assessed quality — it never asked accessory questions or
filled the spec fields a "complete" item needs, so intaked items still required heavy agentic
/ operator follow-up. Now the step also serves the subcategory's **assembly (accessory)
contract**: `intake-start` and `intake-answer` merge the assembly questions (presence + spec)
into `qualityQuestions`, and the quality answer feeds the assembly contract into
`buildQualityCheckResponse` so accessory answers drive **both** quality (a missing part → lower
quality) **and** specs (spec answers → Spezifikationen) — mirroring what the operator review
flow (`quality-review.ts`) already did. Specs are filled from three merged sources (lowest →
highest precedence): **scan-derived** (`deriveInstanceSpecsFromScan` back-fills the canonical
required keys `Prozessor`/`RAM`/`Speicher`/`Speichertyp` from the scan — "present because the
device booted"; the quality body accepts an optional `scanPayload`), **questionnaire-derived**,
and **explicit `instanceSpecs`** sent free-form by the script. Author guide:
[`docs/detailed/intake-image-guide.md`](../detailed/intake-image-guide.md); request contract
updated in [`intake-image.http`](../detailed/intake-image.http).
**Why (approach):** Reused the existing assembly-contract + `assemblyToQualityContract`
machinery and the `/api/contracts/*` serving endpoints rather than inventing an intake-specific
schema, so intake and the operator review derive quality/specs identically. Spec-name alignment
is **manual/by-convention**: instanceSpecs keys must match `contracts/specs/<subcat>.json`
exactly (no intake-side aliasing) — stated in the guide.
**Deferred:** intake does not auto-create linked accessory *items* for non-serialed slots
(RAM/keyboard/…) — those are captured as specs; only serialed disks become components (existing
behavior), and `noLink` slots are spec-only by contract. Duplication guard for
already-cataloged-without-serial devices (re-intake matches on serial/MAC only) is unchanged and
noted in the guide. Nested/detailed future contracts (a display made of hinges/LCD/housing) fit
the recursive relation model but are not yet authored.

## 899. ✅ Deferred-identity in-device components (creation → graduation → gates)
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
