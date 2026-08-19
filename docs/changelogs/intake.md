# Changelog: Device Intake Station

Covers: device intake cataloguing flow, quality questions at intake, netboot architecture, Phase 1/2 separation, scan.txt.

---

## 916. ✅ Intake: operator-typed Artikelbeschreibung was ignored + make every question skippable
**Why:** Two operator-reported issues.
**(1) The typed Artikelbeschreibung never stuck — the scanned model always won.** Field-name
mismatch: the station (`phase1.sh`) sends the operator's input as `newRef.Artikelbeschreibung`, but
`findOrCreateRef` only ever read `newRef.Kurzbeschreibung`, so the typed value was dropped and the
description fell back to `scanPayload.model` (usually garbage DMI like "HP Notebook"). Fixed: the
create-new-ref path now honours `newRef.Artikelbeschreibung` as **authoritative**, with precedence
operator-text → supplied `Kurzbeschreibung` → scanned model → `Hersteller` (last resort so the
required field is never empty). `Kurzbeschreibung` still keeps the short model name from the scan
when the operator didn't supply one. `IntakeAnswerRefBody.newRef` gained the `Artikelbeschreibung?`
field to match what the station already sends.
**(2) "Don't know" is now valid on any question.** The backend treated an empty answer as a real
value — `deriveSpecsFromAnswers` rendered a skipped `ram_gb` as `RAM: " GB"` and `deriveQualityFromAnswers`
could score it. Now an empty/whitespace answer is treated as **unanswered** in both derive functions
(so a skip never produces a junk spec or drives the score), and the intake quality-answer merge drops
empty submitted answers so a skip can't clobber a scan-derived auto-answer. No intake question is
mandatory: the station may omit an `id` or send `""` to skip. (The matching TUI change — press Enter
on an empty prompt to skip select/boolean/text — is a small `phase1.sh` patch handed to the image repo;
the backend already accepts the result.)
**Why (approach):** Both fixes are the *authoritative-source* principle: the operator's explicit
input beats the scan (Artikelbeschreibung), and an explicit "don't know" is honoured rather than
coerced into a bogus value. Guarding empty answers centrally in the two derive functions also fixes
the same junk-spec risk in the operator review flow (`quality-review.ts`), not just intake.
**Deferred:** The `phase1.sh` skip UX (empty-input-to-skip) is image-side. The RAM/storage prompt
itself still needs the `build_scan_payload` lsblk fix (#915) to stop being *asked* at all on NVMe;
skippability is the interim relief the operator asked for. No backfill of refs already created with a
scanned-model description.

## 915. ✅ Intake "asks RAM/storage": root-caused to NVMe disk size = 0 + made the scan gap visible
**Why:** The reported bug — intake prompts for storage the device already scanned — is **not** a
backend-logic or missing-echo bug. Verified by reproduction: the resolver drops `ram_gb`/`storage_gb`/
`drive_type`/`battery_condition` for a well-formed scan, and `phase1.sh` attaches the full `scanPayload`
in `/start` and in **both** ref-answer variants. The real cause is in the netboot image's
`build_scan_payload` (in `common.sh`, a separate repo): disk `sizeGb` is read from `smartctl`'s
`.user_capacity.bytes`, which is an **ATA/SATA-only** field — **empty for NVMe** (SMART reports NVMe
capacity elsewhere) and empty on any smartctl open-fail. So on modern NVMe laptops `sizeGb` comes out
**0**, the `storageSize` signal treats `0` as unknown, and `storage_gb` is asked. (RAM comes from
`/proc/meminfo` and already resolved — storage was the visible offender.)
Two things done **in this repo** (the image fix is handed off, below):
1. **Surface what the scan answered.** `resolveIntakeQuestions` now also returns `detected` (the
   scan-answered spec questions, rendered via `specValue`, e.g. `RAM=8 GB`) and `unresolvedAutoFill`
   (autoFill questions the scan could NOT answer). The `quality`-step responses (`/start` step 2 and the
   `ref` answer) carry a new **`detectedSpecs: [{label,value}]`** so the TUI shows the operator the
   scanned specs instead of a blank — the operator's chosen "omit-but-inform" behavior.
2. **Make a mis-scan visible.** Both question-generation paths now log one structured
   `[intake] question resolution` line — `asked` / `detected` / `unresolvedAutoFill`. A non-empty
   `unresolvedAutoFill` naming `storage_gb` is the exact fingerprint of the NVMe-size-0 gap, so the next
   occurrence is diagnosable from the server log instead of guessed at.
3. **Contract updated for the image.** `docs/detailed/intake-image.http` + `intake-image-guide.md` now
   REQUIRE disk `sizeGb` to come from `lsblk -bdno SIZE` (authoritative for every transport), with
   `smartctl` kept for identity only (serial/wwn/model/type).
**Why (approach):** The server can't recover a size the scan never sent (`sizeGb:0` carries no
information), so the storage prompt can only be fixed at the source — the image. The in-repo changes make
the failure **observable** (log) and **less operator-hostile** (the specs are still shown), and pin the
contract so the image fix is unambiguous. No staging-table / scan-persistence change was made: the earlier
"script doesn't echo the scan" hypothesis was disproven by reading `phase1.sh`, so that complexity is
unnecessary.
**Deferred:** The `build_scan_payload` change itself lives in the intake-image repo (patch handed to the
operator). Broadening `driveTypeLabel` for exotic `type` strings and a per-run scan-quality metric are
left as follow-ups (todo 0z5). `detectedSpecs` rendering in `phase1.sh` is a small, optional image-side
addition — the field is ignored harmlessly until then.

## 914. ✅ Fix invalid JSON in `contracts/quality/201.json` (laptop quality questions silently dropped)
**Why:** A trailing comma after the `has_os` question made `contracts/quality/201.json` invalid JSON.
Both contract loaders (`lib/quality-contracts.loadSubCategoryContract` and `contracts/registry.getQualityContract`)
`try/catch` and return `null` on a parse failure, so the entire laptop-specific quality question set
(OS installed, keyboard layout/condition, screen condition, swollen battery, hinges, fan) was silently
dropped — at intake **and** in the operator review flow — with no error surfaced anywhere. Removed the
trailing comma and bumped the contract version 6 → 7 to mark the fix. Found while investigating the
"intake still asks RAM/storage" report (that symptom is unrelated — tracked separately, see below).
**Why (approach):** The failure was invisible because both loaders swallow parse errors by design (so one
bad contract can't crash startup). No loader change here — the durable lesson (a contract lint/validation
step in CI) is noted as a follow-up in `todo.md` rather than bolted on in this fix.
**Deferred:** No CI JSON-lint for the `contracts/` tree yet (todo). The RAM/storage auto-resolution
investigation is still open — the backend resolver and `phase1.sh` are both correct for a well-formed
scan (verified by reproduction); the open question is whether `build_scan_payload` actually populates
`ramMb`/`disks[]` on the affected machines (awaiting a captured scan payload).

## 913. ✅ Fix intake reference matching + "HP HP HP" brand triplication
**Why:** The intake flow failed to surface an existing reference even for an identical device,
pushing operators to create duplicates with mangled names ("HP HP HP ProBook 470 G4"). Two root
causes: **(1) a separate, weaker matcher** — `findRefCandidates` ran a bespoke `Kurzbeschreibung`-only
substring query, but the kivitendo/ERP importer maps `description → Artikelbeschreibung`,
`suchbegriff → Suchbegriff`, `notes → Kurzbeschreibung`, so for every imported ref the model name
lives in `Artikelbeschreibung` while `Kurzbeschreibung` holds (usually empty) notes — the match
never touched the right field (only intake-created refs, which write the model into
`Kurzbeschreibung`, round-tripped). **(2) brand triplication** — the netboot image embeds the brand
in `model` (`vendor="HP"`, `model="HP HP ProBook 470 G4"`) and the name builder additionally did an
unconditional `[Hersteller, model].join(' ')`, yielding a triple brand.
Fixes: **(a) Matching now reuses the one shared matcher** that manual item creation already uses —
the token-based fuzzy reference search behind `/api/search?scope=refs` was extracted into
`searchItemReferences(term, opts)` (exported from `backend/actions/search.ts`); `findRefCandidates`
builds a search term from the scan (`vendor` + `model`) and calls it, so intake and manual creation
surface identical candidates. (The token search matches even when the term carries a duplicated
brand — the repeated token just hits the same field.) **(b)** The new-ref name (and the
`intake-complete` agentic hand-off, which now uses the ref's `Artikelbeschreibung` as-is) no longer
prepends `Hersteller` — it's a separate first-class column and the model already carries the brand,
so prepending it was the extra "HP".
**Why (approach):** Per operator request, matching must be *the same* everywhere — so rather than
tune a second query, the existing search was made the single implementation and intake now consumes
it (no behavior drift, one place to improve). We deliberately did **not** add a token-dedup step in
the name/search: the duplicated brand originates in the netboot image's `model` (and the station TUI
combining `vendor`+`model`), and collapsing it here would mask a source bug that must be fixed where
it originates (see todo). This supersedes #884's "Artikelbeschreibung = Hersteller + Kurzbeschreibung"
composition for intake-created refs.
**Deferred:** The duplicated-brand-in-`model` is fixed at its source (netboot image / station TUI),
tracked in todo — not worked around in the backend. No backfill of already-created duplicate refs or
brand-duplicated names. `searchItemReferences` was extracted verbatim (same SQL/scoring/dedupe), so
manual-creation ranking is unchanged.

## 912. ✅ Fix intake asking about the drive when the scan already knows it
**Why:** `POST /api/intake/start` rebuilt the scan object field-by-field and forwarded only the
`disks[]` shorthand, dropping the canonical `components[]` list (#902 made `components[]` the general
shape). A drive reported via `components[]` reached `resolveIntakeQuestions` with no disk, so the
`storageSize`/`storageType` signals returned null and the `storage_gb`/`drive_type` questions were
asked instead of auto-resolved. Fix: forward `components[]` alongside `disks[]`. The `ref` answer
path never had the bug (it passes the whole `scanPayload` through), so only `/start` needed it.
**Deferred:** The two entry points still build their scan independently — consolidating onto one
helper is left for later. (Pre-existing, unrelated: `intake-specs-assembly.test.ts` fails on a clean
tree because `loadSubCategoryContract` returns null under jest — see todo #52.)

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
