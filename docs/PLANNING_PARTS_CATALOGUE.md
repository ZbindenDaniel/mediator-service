# Planning: Laptop Parts Catalogue (nested assemblies + quality roll-up)

**Status:** Plan reviewed against the code, **no code yet** (2026-10-13).
**Parent plan:** [PLANNING_NEW_USE_CASE.md](PLANNING_NEW_USE_CASE.md) §7–8 (spare-part cataloguing deployment).
**Related:** [spare-parts-catalog.md](detailed/spare-parts-catalog.md) · [component-lifecycle.md](detailed/component-lifecycle.md) ·
[PLANNING_TAXONOMY_EXTERNALIZATION.md](PLANNING_TAXONOMY_EXTERNALIZATION.md) · [contracts/](../contracts/README.md)

> **TL;DR.** We catalogue laptops part by part, in a tree: Laptop → Displayassembly → Webcam.
> - **Every part type is a subcategory.** Its attributes live in that subcategory's own quality/spec contracts.
> - **Every "consists of" is an assembly contract** on that subcategory. The Zerlegen tab already loads it by the
>   item's own subcategory, so nesting falls out for free.
> - **A part's condition rolls up into its parent's quality**, bounded by a per-slot `qualityFloor`, so a broken
>   webcam lowers a laptop without making it a parts donor.
> - **The operator can drill into sub-assemblies during the quality review** and come back to the parent.
>
> The plan uses the existing contract formats plus five small, additive extensions (§4). It is behaviour-neutral
> for the refurbishment deployment.
>
> **Reviewing the plan against the code turned up three blockers.** They are resolved in the design (§8):
> 1. Article-less components have no subcategory.
> 2. `QUALITY_DEFAULT = 3` would cap every parent.
> 3. Item lists prefer the article's quality over the instance's.

---

## 1. Decisions taken (2026-10-13, Daniel + colleagues)

| # | Decision | Source |
|---|---|---|
| D1 | Part attributes (condition, FRU, specs) live in the **child's** contracts, keyed by subcategory, not on the parent slot | user |
| D2 | Missing keys are a **multi-value field**, not 5 separate fields and not free text | user |
| D3 | Nesting = categories. A laptop consists of assemblies, and assemblies consist of parts (the `-`/`--`/`---` levels in the colleagues' list) | user |
| D4 | A broken or missing sub-part **does lower the parent's quality** | user |
| D5 | The quality review lets the operator **jump into sub-assemblies** and back | user |
| D6 | Taxonomy proposal (§3) | proposed, **needs confirmation** |
| D7 | Everything deployment-specific lives in the catalogue deployment's `CONTRACTS_OVERLAY_DIR` + `TAXONOMY_SEED_FILE` | proposed (existing mechanisms) |

---

## 2. The model: three rules

| Concept | Answers | Lives in |
|---|---|---|
| **Subcategory** | *What kind* of part is it? | taxonomy + `quality/<code>.json` + `specs/<code>.json` |
| **Slot** | *Where* does it sit in its parent? | the parent's `assembly/<parentCode>.json` |
| **Assembly contract on a subcategory** | Does this part consist of parts? | the file's existence = "it is an assembly" |

What follows from these rules:
- **Position goes on the slot, type goes on the subcategory.** "Scharnier links/rechts" are **two slots of one subcategory** (Scharnier). The same goes for speakers, antennas and fans.
- **Defects are not parts.** Missing keys and missing rubber feet are **quality questions** on the item they belong to, never slots.
- **Group headers are real parts.** A Displayassembly is catalogued as an item; it is not just a heading.
- **Zerlegen already nests.** [ItemAccessoriesTab.tsx:34-42](../frontend/src/components/item-tabs/ItemAccessoriesTab.tsx) loads
  `assembly/<item's subcategory>.json`, so a catalogued Displayassembly shows its own slots. Grandchildren survive
  graduation: `graduateComponentInTx` re-keys `ParentItemUUID` as well ([graduate-component.ts:71-72](../backend/lib/graduate-component.ts)).

---

## 3. Taxonomy (proposal, D6)

The new Hauptkategorie **210 "Laptop-Ersatzteile"** gets subcategories `2101…2199`. This keeps the numeric convention
(parent in tens; sub = parent·10 + n, the same as 100 → 1001…). The existing `202 Laptop-Ersatzteile` is set `active: false`
in the catalogue deployment. Generic components keep their existing codes.

```
201  Laptop                              [assembly]
├─ 2101 Displayassembly                 [assembly]
│   ├─ 2105 Displaypanel
│   ├─ 2106 Display-Cover (A-Cover)
│   ├─ 2107 Display-Rahmen (B-Cover / Innenabdeckung)
│   ├─ 2108 Scharnier             slots: links, rechts
│   ├─ 2109 Webcam
│   ├─ 2110 WLAN-Antenne          slots: links, rechts
│   ├─ 2111 Inverterboard         (older CCFL panels only → usually "Nicht vorgesehen")
│   └─ 2126 Interne Kabel         slot: Displaykabel
├─ 2102 Handauflage (C-Cover)           [assembly]
│   ├─ 2104 Tastatur                    ← missing keys (multi), layout
│   ├─ 2112 Touchpad
│   ├─ 2113 Fingerabdrucksensor
│   └─ 2114 Einschaltknopf
├─ 2103 Gehäuse-Boden (D-Cover)         [assembly]   ← missing rubber feet: quality question
│   └─ 2125 Abdeckung / Serviceklappe   slots named by function (RAM-, HDD-, Service-)
├─ 601  Mainboard
├─ 2115 Daughterboard                   [assembly] → 2126 slot: Flachbandkabel   (slots 1–3)
├─ 2116 Strombuchse (DC-Jack)
├─ 602  Prozessor                 (often "Fest verbaut" = soldered BGA)
├─ 2117 Kühlkörper
├─ 2118 Lüfter                    slots: 1, 2 (or CPU/GPU)
├─ 603  Arbeitsspeicher           multipleAllowed (often "Fest verbaut")
├─ 2119 Festplattenhalterung (Caddy)    slots: 1, 2
├─ 2126 Interne Kabel             slots: Festplattenkabel 1, 2
├─ 901  Festplatte/SSD            slots: 2.5" 1, 2.5" 2, M.2 1, M.2 2 (Formfaktor/Interface = spec)
├─ 2120 Optisches Laufwerk              [assembly] → 2126 slot: Laufwerkskabel
├─ 2121 Lautsprecher              slots: links, rechts
├─ 710  WLAN-Karte                (antenna cables belong to 2110, not here)
├─ 2122 Bluetooth-Modul           (usually on the WLAN card → "Nicht vorgesehen")
├─ 2123 CMOS-Batterie
└─ 206  Laptop-Akku
```

The rationale for each choice:
- **One cable subcategory (2126)** with a `Kabeltyp` spec. Five cable subcategories would add nothing searchable.
  "Interne Kabel" stays as a slot meaning *other* cables only.
- **The caddy is a slot of the laptop,** not nested under the drive: caddies are swapped independently of drives.
- **The colleagues' list has these mistakes, corrected here:**
  - laptop drives are **2.5"**, not 3.5";
  - "M2.Sata" becomes **M.2** (SATA *or* NVMe);
  - the WLAN antenna cable was double-counted (under the display and as "Wlan-Adapter und Kabel");
  - Bluetooth is usually part of the WLAN combo card;
  - "Abdeckung 1/2/3" → named by function;
  - typos "Gehöuse", "intergriert".
- **Possibly missing, ask the colleagues:** microphone (display bezel), touchscreen digitizer, card reader,
  touchpad/keyboard ribbon cables, MXM GPU (old gaming laptops). The external power adapter stays an `Zubehör` relation.

**Mechanism:** a catalogue `taxonomy.seed.json` via `TAXONOMY_SEED_FILE` (only seeds an **empty** DB) or the admin
taxonomy editor (Phase 4 of taxonomy externalization) for an existing DB.

---

## 4. Contract extensions (all additive, optional)

### 4.1 Slot presence values (canonical)
Slot questions in the catalogue overlay use one select with fixed values. The strings become **shared constants in
`models/assembly-contract.ts`**, used by the frontend slot-state code and the backend roll-up. Today the frontend
hardcodes `'false' | 'Nicht vorhanden'` ([ZubehoerCard.tsx:43,61](../frontend/src/components/ZubehoerCard.tsx)).

| Value | Slot state | Roll-up (§5) |
|---|---|---|
| `Vorhanden` | `present` (→ `cataloged`/`removed` once an item exists) | child quality if assessed, else none |
| `Nicht vorhanden` (also boolean `false`) | `empty` | `floor` |
| `Nicht vorgesehen` | **new** `notApplicable`: greyed out, no Hinzufügen | none |
| `Fest verbaut` | **new** `integrated`: no separate item, condition asked on parent | none (see Q3) |

### 4.2 `qualityFloor` on `AssemblyPart`
```ts
/** Lowest quality (1–5) a problem with this part can pull the parent down to. Absent = no roll-up (legacy behaviour). */
qualityFloor?: number;
```
- Display: `1`, Mainboard: `1`, Akku: `2`, Tastatur: `2`, Webcam: `3`, Abdeckung: `4`, … These are domain input (Q1).
- **Validator rule:** a slot with `qualityFloor` must not also carry `qualityImpact` on its `question`, because that would count twice.
  Legacy slots (refurbishment 201) keep `qualityImpact` and have no floor, so their behaviour is unchanged.

### 4.3 `multi` question type (D2)
```json
{ "id": "missing_keys", "type": "multi", "question": "Fehlende Tasten?",
  "suggestions": ["Esc","F1","…","Ä","Ö","Ü","Enter","Leertaste",","],
  "specField": "Fehlende Tasten", "specValue": "%v",
  "qualityImpact": { "1": 4, "3": 3 } }
```
- `suggestions` gives an **open** chip input (type or pick); `values` instead gives a **closed** checkbox list.
- **Stored as a JSON array string** (`'["F5",",","Ä"]'`) because `answers` is `Record<string,string>`. Commas can't be
  the separator because the comma is itself a key. An empty list counts as unanswered.
- `specValue` `%v` renders the list joined with `", "`.
- `qualityImpact` keys are **count thresholds**: the highest key ≤ number of entries applies. So 1–2 missing keys
  give 4, and 3 or more give 3.
- `showIf` *targeting* a multi question is not supported in v1 (equality makes no sense); the validator rejects it.
- Intake ignores the type (intake is off in this deployment). The intake question filter must skip unknown types
  rather than crash.

### 4.4 Shared contract per Hauptkategorie
Without this, about 25 part subcategories would each repeat the same two questions: `part_condition` (OK / beeinträchtigt / defekt /
ungetestet → 5/3/1/–) and `part_fru` (text → spec `FRU`).
- **New lookup chain:** `general` → `group-<hauptCode>` → `<subCode>`, e.g. `quality/group-210.json`, and the same for specs.
- **Why the `group-` prefix:** main-category and subcategory codes share one numeric space (e.g. 110 vs a future 10th
  sub of 10). The admin upload route already accepts `[A-Za-z0-9_-]+`.
- **Reused parts outside 210:** 601/602/603/901/710/206 sit outside 210 and do not get `group-210`. Either give them
  their own `quality/<code>.json` with the two questions, or allow `"extends": "group-210"` in a contract. We pick the
  former for v1 (6 files, explicit). Revisit if it grows.

### 4.5 Contract validation (tooling)
[contracts/README.md](../contracts/README.md) claims contracts are validated against their TS shapes at startup. **They are not.**
The registry only parses JSON, and the admin upload ([admin-contracts.ts:35](../backend/actions/admin-contracts.ts)) checks only
the top-level shape. With ~30 interlinked files that is the biggest maintenance risk. Add one validator
(`backend/contracts/validate.ts`) used by a Jest test over shipped + overlay dirs, by a CLI (`npm run contracts:check`)
and by the admin upload. It checks:
- slot `key` unique per file, and question ids unique across the merged set (general + group + sub + assembly);
- `targetSubcategory` exists in the taxonomy;
- **no cycles** in the assembly graph (a subcategory transitively containing itself);
- floor/impact exclusivity (§4.2);
- `showIf` targets an existing, non-multi question;
- presence-select slots use exactly the canonical values (§4.1).

---

## 5. Quality roll-up (D4)

### 5.1 Algorithm
```
effective(item) = min( ownScores(item) ∪ { slotScore(s) for each slot s of item's assembly contract } )
                  → QUALITY_DEFAULT only if that set is empty

slotScore(s) =
  slot has no qualityFloor                      → none
  child(ren) linked & in device & has a score   → max(min(childEffective…), floor)
  child linked & REMOVED (BoxID set)            → floor        (the part is gone from this device)
  answer "Nicht vorhanden" / false              → floor
  "Nicht vorgesehen" / "Fest verbaut" / unknown → none
  child linked, not yet assessed                → none, item flagged "Bewertung unvollständig"
```
- **Recursion:** `childEffective` already includes the child's own sub-parts. Example: a broken webcam (1) in a
  Displayassembly (webcam floor 3) gives an assembly of 3; the laptop's display floor is 1, so the laptop is `max(3,1)` = 3.
- **multipleAllowed:** the slot score is the worst of its instances.

### 5.2 Blocker found in review: `QUALITY_DEFAULT`
`deriveQualityFromAnswers` returns `QUALITY_DEFAULT = 3` ([models/quality.ts:47](../models/quality.ts)) when no answer
carries an impact. If that 3 were rolled up, **every unscored child would cap its parent at 3 ("Ok")**.
- **Fix:** split the function so it returns the raw score list (or `null` when unscored). The default is applied **only** at
  the top, when the combined set is empty.
- An unscored child is treated as "not assessed", not as 3.

### 5.3 Storage
- **Own vs effective.** `quality_assessments.value` stays the item's **own** result, exactly what the operator answered.
  `items.Quality` becomes the **effective** value (today `updateItemQualityAssessment` writes the own value,
  [db.ts:3434](../backend/db.ts)).
- **No new column.** The own value is reachable via `items.QualityId`. The breakdown (which slot drove the value) is
  computed on read for the UI, e.g. "Eigene Bewertung 5 · Gesamt 3 (Webcam defekt)".
- **Blocker found in review: article quality wins over instance quality.** Item queries select
  `COALESCE(r."Quality", i."Quality")` ([db.ts:916](../backend/db.ts)), so wherever an article has a quality, the rolled-up
  instance value is hidden. It must become `COALESCE(i."Quality", r."Quality")` at least for instance views. **First
  check why the article was given precedence**, e.g. ERP/Shopware export or grouping, before flipping it globally.
- **Manual override.** `PATCH /api/items/:id/instance` can set `Quality` directly ([#911]). A recompute would silently
  overwrite that. v1 rule: a manual value is overwritten by the next recompute and an event records it. Revisit only
  if operators complain (Q4).

### 5.4 When to recompute (upward propagation)
Recompute the item, then walk `Zerlegt_aus` parents to the root, **in the same transaction** as the triggering write:

| Trigger | Handler |
|---|---|
| quality assessment saved | `quality-review.ts` |
| part catalogued into a slot | `catalog-spare-part.ts` (both routes) |
| part removed to a box | `remove-from-device.ts` (after graduation, using the effective UUID) |
| part link deleted | `catalog-spare-part.ts` `DELETE …/spare-part-link` |
| contract floors edited | admin "recompute all" (script/endpoint); the floors are config, not per-item |

- **Idempotent and order-independent:** recompute always re-reads the current child values. Depth is tiny (≤ 4), so cost is negligible.
- **Event log:** when `items.Quality` changes, log `Qualität 5→3 (Unterbaugruppe: Webcam)` on the parent. This feeds the
  traceability requirement.
- **Tenancy:** parent and child belong to the same tenant in practice. Assert it and skip cross-tenant writes, so a
  recompute can never write into another org (owner-only edits).

---

## 6. Nested assessment UX (D5)

```
Laptop ThinkPad T480  ›  Displayassembly  ›  Webcam          ← breadcrumb, each crumb clickable
─────────────────────────────────────────────────────────
[questions for the current level: general + group + sub + slot presence]

Unterbaugruppen
  Displayassembly   ● bewertet · 3            [Bewerten →]
  Handauflage       ○ offen                   [Bewerten →]
  Lüfter 2          Nicht vorgesehen
─────────────────────────────────────────────────────────
Live: Gesamt 3 · eigene Antworten 5           [← zurück]  [Speichern]
```
- **"Bewerten →"** appears on a slot whose target subcategory has a quality *or* assembly contract and whose answer
  is `Vorhanden`. It opens that child's assessment.
- **Child creation is lazy.** Clicking only opens a client-side draft. The in-device component (no article number,
  `C-` UUID, BoxID NULL, [component-lifecycle.md](detailed/component-lifecycle.md)) is **created when the child is
  saved**. Abandoned drafts therefore leave no orphan items.
- **Draft stack.** The parent's unsaved answers live in a frontend draft stack mirrored to `localStorage`, keyed by item
  UUID, so a reload or a phone lock keeps them. Each level saves independently. "Zurück" saves the child (or asks),
  then the parent's live preview recomputes with the new child value.
- **Live preview.** The frontend needs the roll-up too, so `computeEffectiveQuality` lives in **shared `models/`**
  code used by both sides (same pattern as the contract types).
- **Drill-down, not accordions:** the trees are 3+ levels deep and each level is a real item with its own history.
  It also stays usable on a phone.

---

## 7. Behaviour neutrality for the refurbishment deployment

All extensions are optional: no `qualityFloor` means no roll-up, no `multi` questions, no `group-*` files, the existing
presence values still work, and the shipped `contracts/` stay unchanged. **The two exceptions** are the
`QUALITY_DEFAULT` refactor and the `COALESCE` order. They touch shared code paths and are covered by tests in Phase 1.

---

## 8. Review findings (2026-10-13): what didn't hold and how the plan handles it

| # | Finding (verified in code) | Severity | Resolution |
|---|---|---|---|
| R1 | **Article-less components have no subcategory.** It lives only on `item_refs."Unterkategorien_A"`; `items` has none. An in-device component (no `Artikel_Nummer`) therefore resolves no quality/spec/assembly contract, so the drill-down and nesting break exactly where they are needed. | **Blocker** | **Effective subcategory** = `ref.Unterkategorien_A ?? parentContract.slot(SlotKey).targetSubcategory`, resolved server-side via `item_relations."SlotKey"`. Expose it on the item API (`EffectiveSubCategory`); frontend uses it instead of `Unterkategorien_A`. |
| R2 | **The quality review takes `subCategory` from the client** ([quality-review.ts:53](../backend/actions/quality-review.ts)), so the client decides which contract scores the item. | High (correctness, and with roll-up writing other items, integrity) | Server resolves the effective subcategory itself (R1) and ignores or validates the client value. |
| R3 | `QUALITY_DEFAULT = 3` would cap every parent with unscored children. | **Blocker** | §5.2 |
| R4 | Item views show article quality over instance quality (`COALESCE(r, i)`). | **Blocker** for visibility | §5.3: investigate first, then flip for instance views. |
| R5 | **Graduation can change the subcategory.** At Zerlegung the operator picks or creates a ref; if its subcategory ≠ the slot's `targetSubcategory`, the item silently switches contracts and its stored answers stop matching. | Medium | Prefill new refs with `targetSubcategory`; on an existing ref with a different subcategory, show a warning and require confirmation. |
| R6 | Contract validation is nearly absent (README overstates it). | High (maintenance) | §4.5, done in Phase 1, before any big contract set lands. |
| R7 | **"Removed = missing" changes the meaning of laptop quality.** In this use case, fully disassembled laptops end at 1. | Accepted | Intended: the laptop *is* a donor shell then. Its own assessment row keeps the pre-disassembly answers for history. |
| R8 | **Slot keys become load-bearing** (SlotKey → effective subcategory). Renaming a key in a contract orphans components. | Medium | Rule in contracts README: slot keys are immutable like spec keys; the validator diffs against the previous file on admin upload and refuses removed keys that are still referenced. |
| R9 | **Two quality questions describe the same thing.** The refurb `quality/201.json` asks `screen_condition`, `keyboard_condition`, `hinges_ok`, `battery_swollen`, `fan_dusty`, which overlap the child parts. | Medium | The catalogue overlay's `quality/201.json` drops them (they move to 2105/2104/2108/206/2118). The refurb file is untouched. |
| R10 | **Manual `Quality` edits get overwritten** by recompute. | Low | §5.3, event-logged; Q4. |
| R11 | **Some answers need special handling in the roll-up:** the "Fest verbaut" keyboard needs its missing keys on the C-Cover, and soldered RAM/CPU have no item. | Covered | `showIf` on the slot answer (`part_keyboard` = `Fest verbaut`) works today because the assembly's synthetic quality contract is merged with the sub contract. |

Checked and **holds**:
- nesting via the item's own assembly contract;
- graduation re-keys parent *and* child relations plus events;
- `TAXONOMY_SEED_FILE` exists for a per-deployment taxonomy;
- the admin upload accepts `group-210` names;
- `showIf` on assembly questions;
- the overlay dir keeps refurb contracts untouched.

---

## 9. Phases

Each phase ships independently, with tests, and is documented per CLAUDE.md.

**Phase 1: Foundations (backend, neutral)**
1. Contract validator + test + CLI (§4.5, R6).
2. Effective subcategory resolver + server-side contract resolution in quality review (R1, R2).
3. `deriveQualityFromAnswers` split, default applied only at the top (R3).
4. Investigate + fix the `COALESCE` quality order (R4).
5. Canonical presence values + the `notApplicable`/`integrated` slot states (§4.1).

*Done when:* the full Jest suite shows no new failures, and refurb contracts validate clean.

**Phase 2: Roll-up (backend + shared)**
1. `qualityFloor` on `AssemblyPart`; shared `computeEffectiveQuality` in `models/`.
2. Upward recompute in the 4 handlers + an admin "recompute all"; event entries; tenancy assert.
3. Own vs effective on the item API, with a breakdown.

*Done when:* tree tests pass for the webcam/display example, removal, unassessed children and multipleAllowed.

**Phase 3: `multi` question type**
1. Type + validator + spec rendering + count-threshold impact + quality review renderer (chips / checkboxes).

**Phase 4: Nested assessment UI**
1. Breadcrumb drill-down, lazy child creation, draft stack with `localStorage`, live preview, open/assessed markers.
2. Graduation subcategory guard (R5).

**Phase 5: Catalogue content (overlay + taxonomy)**
1. Taxonomy 210 seed; `202` inactive.
2. `group-210.json` (quality + specs); per-part quality/spec files; assembly files for 201, 2101, 2102, 2103, 2115, 2120.
3. Catalogue `quality/201.json` without the overlapping questions (R9).
4. Floors from the colleagues' table (Q1).

*Done when:* `contracts:check` is clean, and a laptop has been fully catalogued in a browser session down to the webcam.

Phases 1–3 do not depend on the open questions; start there.

---

## 10. Open questions

| # | Question | For |
|---|---|---|
| Q1 | **Floor per part:** "Teil → schlimmstenfalls Note X" table (display, mainboard, battery, keyboard, hinges, webcam, covers, feet …) | colleagues |
| Q2 | Confirm the taxonomy tree (§3): one cable subcategory? M.2 as a 901 slot rather than its own subcategory? missing parts (mic, digitizer, card reader)? | colleagues |
| Q3 | "Fest verbaut": no roll-up impact (the condition is asked on the parent), or should a soldered part count as part of the parent's condition questions? | colleagues |
| Q4 | Should a manual `Quality` override survive a recompute (lock flag), or is "recompute wins + event" enough? | Daniel |
| Q5 | Should `part_condition` "ungetestet" count as unscored (current plan) or as a mild penalty? | colleagues |
| Q6 | Complete Displayassembly as one FRU: is it ever sold whole, or always split? This affects whether 2101 needs its own FRU/spec fields. | colleagues |
