# Planning: Laptop Parts Catalogue (nested assemblies + percentage quality)

**Status:** Phases 1–4 built (#980, #982, #984). Catalogue taxonomy, contracts and specs **drafted** in
[`config/catalogue/`](../config/catalogue/README.md) for rework on the test environment. Before the live refurbishment
system gets this: calibrate the grade bands (C1).
**Parent plan:** [PLANNING_NEW_USE_CASE.md](PLANNING_NEW_USE_CASE.md) §7–8 (spare-part cataloguing deployment).
**Related:** [spare-parts-catalog.md](detailed/spare-parts-catalog.md) · [component-lifecycle.md](detailed/component-lifecycle.md) ·
[PLANNING_TAXONOMY_EXTERNALIZATION.md](PLANNING_TAXONOMY_EXTERNALIZATION.md) · [contracts/](../contracts/README.md)

> **TL;DR.** We catalogue laptops part by part, in a tree: Laptop → Displayassembly → Webcam.
> - **Every part type is a subcategory.** Its attributes live in that subcategory's own quality/spec contracts.
> - **Every "consists of" is an assembly contract** on that subcategory. The Zerlegen tab already loads it by the
>   item's own subcategory, so nesting falls out for free.
> - **Quality is a percentage range** ("60–85 %") — **for every deployment** (#982). Each scored question and each
>   weighted slot adds its weight to the total; answers are named states ("Gut" 70 %, "Kaputt" 0 %). What has been
>   checked is certain, what hasn't is uncertainty. A part's range rolls up into its parent. Knock-outs cap the whole
>   item on safety/function defects. The 1–5 grade is **derived**: pessimistic from the lower bound, and only when the
>   range is narrow.
> - **The operator can drill into sub-assemblies during the quality review** and come back to the parent (Phase 4).
>
> Consumers of the 1–5 grade (badges, filters, Shopware, ERP, AI priority, labels) are unchanged — they read the
> derived grade.

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
| D9 | **One quality system** (2026-10-14): weight per component, distinct named states → fractions; refurbishment uses it too. U1 finer default scale, U2 knock-outs, U3 five bands, U4 pessimistic (lower bound) + no grade on wide ranges, U5 imported grades stay until the first assessment, U6 manual override flag, U7 rescore stored answers, U8 retire the `is_functional` shortcut, U9 intake identical | user |
| D8 | **Quality is a percentage range** with uncertainty: weights per component; checked parts are certain, unchecked parts are uncertainty (2026-10-14). Replaces the earlier `qualityFloor` / min-based roll-up idea | user |
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

## 3. Taxonomy (D6) — drafted in `config/catalogue/taxonomy.seed.json`

The new Hauptkategorie **210 "Laptop-Ersatzteile"** gets subcategories `2101…2199`. This keeps the numeric convention
(parent in tens; sub = parent·10 + n, the same as 100 → 1001…). The existing `202 Laptop-Ersatzteile` is set `active: false`
in the catalogue deployment. Generic components keep their existing codes.

**Revised 2026-10-14 (#985):** the catalogue taxonomy contains **only** Hauptkategorie 20 "Laptop" (201) and 210
"Laptop-Komponenten". The generic codes first reused for Mainboard/CPU/RAM/drive/WLAN/battery (601/602/603/901/710/206)
moved into 210 as 2127–2132, so no other main category is needed and `group-210` covers every part. Microphone (2124) was
added. Apply to an existing DB with `npm run taxonomy:apply` (§4.6).

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
├─ 2127 Mainboard
├─ 2115 Daughterboard                   [assembly] → 2126 slot: Flachbandkabel   (slots 1–3)
├─ 2116 Strombuchse (DC-Jack)
├─ 2128 Prozessor                 (often "Fest verbaut" = soldered BGA)
├─ 2117 Kühlkörper
├─ 2118 Lüfter                    slots: 1, 2 (or CPU/GPU)
├─ 2129 Arbeitsspeicher           multipleAllowed (often "Fest verbaut")
├─ 2119 Festplattenhalterung (Caddy)    slots: 1, 2
├─ 2126 Interne Kabel             slots: Festplattenkabel 1, 2
├─ 2130 Festplatte/SSD            slots: 2.5" 1, 2.5" 2, M.2 1, M.2 2 (Formfaktor/Interface = spec)
├─ 2120 Optisches Laufwerk              [assembly] → 2126 slot: Laufwerkskabel
├─ 2121 Lautsprecher              slots: links, rechts
├─ 2131 WLAN-Karte                (antenna cables belong to 2110, not here)
├─ 2122 Bluetooth-Modul           (usually on the WLAN card → "Nicht vorgesehen")
├─ 2123 CMOS-Batterie
└─ 2132 Laptop-Akku
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

## 4. Contract extensions (all additive, optional) — ✅ built in #980 except 4.4

### 4.1 Slot presence values (canonical) ✅
Shared constants in [models/assembly-contract.ts](../models/assembly-contract.ts) (`SLOT_PRESENT`, `SLOT_MISSING`,
`SLOT_NOT_APPLICABLE`, `SLOT_INTEGRATED`). They are used by the Zerlegen slot state and by the score on both sides.

| Value | Slot state | Score (§5) |
|---|---|---|
| `Vorhanden` | `present` (→ `cataloged`/`removed` once an item exists) | child range if an item is linked, else uncertain |
| `Nicht vorhanden` (also boolean `false`) | `empty` | 0 (certain) |
| `Nicht vorgesehen` | `notApplicable`: "–", no Erfassen | excluded (weight not counted) |
| `Fest verbaut` | `integrated`: "▣", no Erfassen | excluded; the condition is asked on the parent (Q3) |

The presence select is now shown in every state except `cataloged`, so a wrong answer can be corrected. This used
to apply to booleans only.

### 4.2 Scoring fields: `weight`, `states`, `knockout` ✅ (#980, extended #982)
```jsonc
// question
{ "id": "keyboard_condition", "type": "select", "values": ["Gut", "Abgenutzt", "Beschädigt", "Ungetestet"],
  "weight": 3,                                    // importance; defaults to 1 when the question is scored
  "states": { "Abgenutzt": 0.75, "Beschädigt": 0.25 },   // per-question override; "Gut" comes from the scale
  "knockout": { "below": 0.5, "cap": 0.39 } }      // certainly below 50 % → whole item at most 39 % (Upcycling)
// slot
{ "key": "mainboard", "targetSubcategory": 2127, "weight": 10, "knockout": { "below": 0.25, "cap": 0.19 }, … }
// general.json
{ "scale": { "Neuwertig": 1, "Sehr gut": 0.9, "Gut": 0.7, "Leichte Mängel": 0.55, "Ok": 0.5, "Gebraucht": 0.45,
             "Deutliche Mängel": 0.3, "Stark beschädigt": 0.15, "Kaputt": 0, "Defekt": 0, "Nicht zutreffend": null },
  "grading": { "bands": [{ "min": 0.8, "value": 5 }, …, { "min": 0, "value": 1 }], "maxUncertainty": 0.25 } }
```
- A question is **scored** when it has `weight`, `states` or legacy `qualityImpact`; spec questions ("RAM?") are not.
- Answer → fraction: question `states`, else the contract `scale`, else legacy `qualityImpact` as (v−1)/4. `null` =
  excluded ("Nicht zutreffend"); no value anywhere ("Ungetestet", "?") = uncertainty.
- **Knock-out:** applies only when the component is *certainly* below `below` (an unanswered question adds
  uncertainty, it does not cap — otherwise every skipped safety question would make the item ungradable).
- Unweighted slots: their presence question is scored like any question (refurbishment booleans `has_fan` …);
  weighted slots are scored through the slot (presence + child range).
- The validator rejects a scored select/boolean whose answers all lack a value (typo guard).

### 4.3 `multi` question type ✅
```json
{ "id": "missing_keys", "type": "multi", "question": "Fehlende Tasten?",
  "suggestions": ["Esc","F1","…","Ä","Ö","Ü","Enter","Leertaste",","],
  "specField": "Fehlende Tasten", "specValue": "%v",
  "weight": 2, "qualityImpact": { "1": 4, "3": 3 } }
```
- **Input:** `suggestions` gives an **open** chip input (type + Enter, datalist); `values` gives a **closed** checkbox list.
  Both offer a "Keine" button.
- **Storage:** a JSON array string. **`"[]"` = checked, nothing found** (full score); absent = not checked
  (uncertainty). This differs from the first draft, where an empty list counted as unanswered: "none missing" must be
  recordable.
- **`qualityImpact`:** keys are count thresholds (highest key ≤ count applies; below the lowest key = 5).
- **Spec output:** `%v` = entries joined with ", "; `"[]"` produces no spec line.
- **Restrictions:** `showIf` cannot target a multi question (validator), and intake skips multi questions entirely.
- **Styling:** the chip/checkbox layout is inline in `QualityReviewStep.tsx` for now; move it to SCSS later.

### 4.4 Shared contract per Hauptkategorie ✅ (#982)
`registry.getQualityContract(sub)` merges `quality/group-<floor(sub/10)>.json` before the subcategory's own file
(201 → group-20, 2101 → group-210 — the taxonomy's numeric convention, so no DB lookup and no import cycle). Every
caller (review, intake, score, `GET /api/contracts/quality/<code>`) sees the merged contract. Since #985 every
catalogue part is inside 210, so group-210 covers all of them. Spec contracts are not grouped (not needed so far).

### 4.5 Contract validation ✅
[backend/contracts/validate.ts](../backend/contracts/validate.ts) is used by:
- the Jest suite, which validates the shipped set against the shipped taxonomy seed;
- `npm run contracts:check` (shipped + `CONTRACTS_OVERLAY_DIR`, against `TAXONOMY_SEED_FILE`; exit 1 on problems);
- the admin upload, which reports only problems the upload *introduces* and doesn't require the file's own code to
  exist yet, so a category can be created after its contract.

What it checks:
- **Per file:** question types, select values, impact keys ⊂ values, impacts 1–5, positive weights, multi rules,
  part keys/labels/targets, weighted-slot rules.
- **Across files:** question ids unique across general + assembly + sub, `showIf` targets exist and aren't multi,
  slot targets exist in the taxonomy, **no assembly cycles**.

**On the first run it found three real bugs in the shipped refurbishment contracts (fixed in #980):**
- `quality/102.json` `has_os` had `qualityImpact {true: 0, false: 0}`. The 1–5 calculation takes the minimum and
  clamps to 1, so **every desktop whose OS question was answered was rated "Ersatzteil"**. The impact is removed now,
  as the question was clearly meant to have none.
- `ram_gb` / `storage_gb` / `drive_type` existed in both `quality/102.json` and `assembly/102.json`, with different
  value lists, so the form showed them twice. The quality copies are removed and "24" is merged into the assembly RAM
  values, following the rule that the assembly contract owns component questions.
- `assembly/102.json` GPU slot targeted non-existent subcategory 604; it now targets 701 Graphikkarte.

### 4.6 Taxonomy apply + deployment config (#985)
- `npm run taxonomy:apply -- <seed>` (`backend/lib/taxonomy-apply.ts`): upserts the seed into an existing DB and
  deactivates everything else (soft — items keep their codes); refuses reparenting. Startup only seeds an empty DB.
- `docker-compose.catalogue.yml`: sets `TAXONOMY_SEED_FILE`, `CONTRACTS_OVERLAY_DIR` (bind-mounted
  `config/catalogue/contracts`) and `FEATURES_FILE` for the catalogue stack.
- `contracts:check` lists contracts for subcategories outside the taxonomy as unused instead of failing
  (`skipUnknownCodes`), so the shipped refurbishment files don't block a catalogue deployment.

---

## 5. Quality (D4, D8, D9) — ✅ #980 + unified in #982

### 5.1 Calculation ([models/quality-score.ts](../models/quality-score.ts) — one function for server, intake, preview)
```
total    = Σ weight of every scored question and weighted slot
certain  = Σ weight × fraction   over what has been checked
possible = certain + Σ weight    over what has not been checked
range    = certain/total … possible/total, then both bounds ≤ the lowest applying knock-out cap
grade    = band(range.min)  if range.max − range.min ≤ maxUncertainty, else none ("?")
```
Worked example (user): webcam 3 (3/3), hinges 4 (3/4), keyboard 5 (unchecked), mainboard 8 (6/8) → 20/12/17 → **60–85 %**
(a test case). Slots: linked parts in the device → `w × [child min, child max]` (multipleAllowed: average); removed to
a box or "Nicht vorhanden" → 0; "Nicht vorgesehen"/"Fest verbaut" → excluded; otherwise uncertain.

### 5.2 Storage and grade
- `items."QualityScoreMin/Max"` (REAL 0–1) — the range incl. parts.
- `items."Quality"` (1–5) — **derived** by the recompute for items that have an assessment and no manual override;
  `NULL` (badge "?") when the range is too wide. Items without an assessment keep their imported grade (U5).
- **Shown in the instance tab** (#983): grade badge + range ("72–85 %") + "zu wenig bewertet für eine Note" when the
  range is too wide + "manuell" for a hand-set grade.
- `items."QualityManual"` (#982) — set by the instance edit (`PATCH …/instance` with `Quality`) and by "mark as
  spare"; the recompute then leaves `Quality` alone; the next assessment (`updateItemQualityAssessment`) clears it (U6).
- `quality_assessments.value` — the assessment's own pessimistic grade (band of the lower bound, 3 if nothing is
  scored); always set, as the column is NOT NULL and it is history.
- `COALESCE(r."Quality", i."Quality")` in item views (R4) — still open; matters now that instance grades are derived.

### 5.3 Recompute triggers ([backend/lib/quality-score.ts](../backend/lib/quality-score.ts))
Quality review, intake (U9), part catalogued (both routes), link deleted, part removed (`remove-from-device` and
`move-item`), `npm run quality:recompute` (after weight/scale/band changes; also rescoring stored answers, U7). Runs
after the triggering write, walks `Zerlegt_aus` parents, stops at tenant boundaries, logs `QualityScoreChanged`
(range + grade), calls `onGradeChange` (move-item/removal enqueue the Shopware sync as before).

### 5.4 A part leaves its device (U8, [backend/lib/parent-slot.ts](../backend/lib/parent-slot.ts))
Before: `move-item` (the UI's "Entnehmen") **always**, and `remove-from-device` by default, wrote a bare
"Ersatzteil, value 1" assessment on the parent — discarding all its answers. Now: the parent's last answers are carried
over with that slot set to missing (`false` / "Nicht vorhanden"), and the calculation decides. Marking the device as
spare donor (manual grade 1) is **contract-driven**: unweighted slot (refurbishment contracts) → yes, as before;
weighted slot (catalogue) → no, the score handles it; `markParentAsSpare` in the request overrides. The unused
`deriveQualityTagFromCondition` (`is_functional`/`has_defects` shortcut) is removed.

### 5.5 Effective subcategory (R1/R2) ✅ #980
`resolveEffectiveSubCategory(item)` = reference's `Unterkategorien_A`, else the `targetSubcategory` of the slot the
item sits in (recursively). Used server-side by the quality review (client value only as fallback) and returned on the
item detail as `EffectiveSubCategory` (accessories tab, quality modal).

### 5.6 Migration of the shipped contracts (U7, #982)
Every `qualityImpact` became `states` with the same relative values ((v−1)/4) plus a **draft** weight; answers that
used to force grade 1 or 2 became knock-outs capped at that band (swollen battery, missing fan/display/mainboard/CPU,
failed print test, cracked glass → 1; broken hinge, defect battery, missing toner → 2). Stored answers rescore with
`npm run quality:recompute`.

**Effect on refurbishment grades** (same answers, laptop 201):

| Device | Old ("worst answer wins") | New |
|---|---|---|
| mint | 5 | 100 % → 5 |
| typical used (scratches light, keyboard worn, screen scratched, battery 50–80 %) | 4 | 88 % → **5** |
| worn | 3 | 75 % → **4** |
| broken hinge | 2 | 39 % → 2 |
| swollen battery | 1 | 19 % → 1 |

Averaging lifts ordinary devices one band; knock-outs keep the severe ones where they were. → **C1**: calibrate bands
(e.g. 5 ≥ 0.95, 4 ≥ 0.8, 3 ≥ 0.6 …, with knock-out caps moved to match) or weights before this reaches the live
refurbishment system. Bands live in `general.json`, so each deployment can have its own.

---

## 6. Nested assessment UX (D5) — ✅ built in #984

```
ThinkPad T480  ›  Displayassembly  ›  Webcam            ← breadcrumb (only when nested), crumbs go back up
─────────────────────────────────────────────────────────
Qualitätsbewertung: Webcam
[general + group + subcategory questions]
Komponenten
  Webcam?  [Vorhanden ▾]
  ↳ bewertet · 70–90 %   [Ändern →]          ← per weighted slot: offen / bewertet · range / entnommen
─────────────────────────────────────────────────────────
Vorschau: [Gut] 70–90 %          [Verwerfen & zurück]  [Speichern & zurück]
```
- **Where:** `QualityReviewModal` is the navigator (stack of levels), `QualityReviewStep` renders one level. Every
  level stays mounted (hidden when not on top), so unsaved parent answers survive the trip down.
- **"Bewerten →"** on weighted slots whose presence is not missing/excluded; an unanswered slot is set to
  "Vorhanden" (opening a part implies it is there). `multipleAllowed` slots list each in-device instance plus
  "+ weiteres bewerten →". Removed parts show "entnommen" (they are assessed as normal items now).
- **Lazy creation:** opening a part that does not exist yet only opens a draft; "Speichern & zurück" first creates
  the part — and any not-yet-created ancestors — via `POST …/spare-parts/component`, then saves its assessment.
  "Verwerfen & zurück" creates nothing and clears that draft.
- **Drafts:** each level's unsaved answers are mirrored to `localStorage` (`quality-draft:<itemId>` or
  `quality-draft:<parent>><slot>` for parts not created yet) once edited; reopening restores them with a
  "Entwurf wiederhergestellt · verwerfen" note. A save clears the level's draft. Going up via the breadcrumb keeps
  deeper drafts.
- **Back on the parent:** its parts' stored ranges reload (`partsRefreshKey`), so the live preview includes the new
  child range.
- **Graduation guard (R5):** `remove-from-device` refuses a ref whose subcategory differs from the slot's target
  (409, `confirmSubCategoryChange: true` overrides) and gives a `newRef` the slot's subcategory by default. The UI
  never graduates today ("Entnehmen" = `move-item`), so this guards the API path.
- **Also fixed:** the quality modal never sent `notes` to the server; it does now.

## 7. Effect on the refurbishment deployment (#982 — no longer neutral, by decision D9)

- Grades are derived by the unified calculation → ordinary devices grade one band higher until calibrated (C1).
- "Entnehmen" no longer wipes the parent's answers; the parent still becomes grade 1 (manual) as before.
- A skipped scored question now widens the range; too many skips → no grade ("?") instead of the old default 3.
- The three desktop contract bug fixes from #980 (OS answer forced grade 1, duplicate RAM/storage rows, GPU → 604).

---

## 8. Review findings: status

| # | Finding (verified in code) | Status |
|---|---|---|
| R1 | Article-less components have no subcategory, so no contracts load for them | ✅ fixed: effective subcategory (§5.4) |
| R2 | Quality review trusts the client `subCategory` | ✅ fixed: server-resolved, client is fallback only |
| R3 | `QUALITY_DEFAULT = 3` would cap parents in a min-based roll-up | ⚪ moot: the percentage has no default; nothing weighted = NULL |
| R4 | Item views show article quality over instance quality | **open again**: instance grades are now derived (#982), so an article-level `Quality` hides them — investigate, then flip for instance views |
| R5 | Graduation can change the subcategory (ref ≠ slot target) | ✅ #984: 409 unless confirmed; new refs default to the slot's subcategory |
| R6 | Contract validation was nearly absent | ✅ fixed (§4.5), and it found three real bugs |
| R7 | "Removed = missing" sends disassembled laptops towards 0 % | accepted: intended |
| R8 | Slot keys are load-bearing (SlotKey → effective subcategory) | open: README rule added; an upload diff that refuses removing referenced keys is not built |
| R9 | Catalogue 201 must drop the device-level condition questions that now live on parts | open: Phase 5 content |
| R10 | Manual `Quality` edits overwritten by a recompute | ⚪ moot: the recompute never touches `Quality` |
| R11 | "Fest verbaut" keyboard: missing keys asked on the C-Cover via `showIf` on the slot answer | ✅ supported (validator test covers it) |
| R12 | `markParentAsSpare` wrote a fresh parent assessment *without answers*. **Correction:** the flag defaults to `true`, and `move-item` (the UI path) did the same unconditionally — so every "Entnehmen" wiped the parent's answers | ✅ fixed #982 (§5.4): answers carried over, spare marking contract-driven |
| R13 | **New:** the admin-contracts / admin-taxonomy tests fail locally whenever `.env` sets `ADMIN_SECRET` (dotenv loads it into Jest) | open: test isolation; run with `ADMIN_SECRET=` until fixed |

Checked and **holds**:
- nesting via the item's own assembly contract;
- graduation re-keys parent *and* child relations plus events;
- `TAXONOMY_SEED_FILE` exists for a per-deployment taxonomy;
- the admin upload accepts `group-210` names;
- `showIf` on assembly questions;
- the overlay dir keeps refurb contracts untouched.

---

## 9. Phases

| Phase | Content | Status |
|---|---|---|
| 1 Foundations | validator + CLI; effective subcategory; canonical presence values + slot states | ✅ #980 |
| 2 Percentage score | shared calculation; score columns; upward recompute; `quality:recompute`; range in UI | ✅ #980 |
| 2b One quality system | states/scale/knock-outs/grading; derived 1–5 grade; manual flag; group contracts; part-leaves-parent; intake; shipped contracts migrated | ✅ #982 |
| 3 `multi` type | type, validator, scoring, specs, chip/checkbox input, intake skip | ✅ #980 |
| 4 Nested assessment UI | breadcrumb drill-down, reference-less catalogue route + lazy creation, drafts, assessed/open markers, graduation subcategory guard (R5) | ✅ #984 (component-tested; browser walkthrough pending) |
| 5 Catalogue content | taxonomy 210, part tree, weights, per-part contracts | **draft** ✅ #982 in `config/catalogue/` (validated in Jest); rework on the test environment |

---

## 10. Open questions

| # | Question | For | Status |
|---|---|---|---|
| C1 | **Calibrate grade bands / weights** so refurbishment grades match expectations (§5.6 table) — blocker before the live refurbishment system | team | open |
| C2 | Large trees stay ungraded until most parts are assessed | team | ✅ intended (2026-10-14): without assessed parts there is nothing to tell |
| C3 | Overall condition on assemblies, or parts only? | team | ✅ every item, assemblies included, is scored the same way: its own assessment + its components (draft unchanged) |
| Q1 | Weight per part | team | **drafted** (`config/catalogue/`) |
| Q2 | Taxonomy tree (cables as one subcategory, M.2 as a 901 slot, microphone added) | team | **drafted** |
| Q3 | "Fest verbaut" (soldered CPU/RAM): excluded from the score (current) or counted? | team | open — the draft lets the C-Cover ask keyboard details when the keyboard is built in |
| Q6 | Displayassembly sold as one part? | team | open (draft gives it condition + FRU via group-210) |
| Q7 | Shared contract per Hauptkategorie | Daniel | ✅ built (`group-<code>`) |
| Q8 | Derive the 1–5 grade from the percentage | Daniel | ✅ yes (U3/U4) |
| Q9 | How lists show the range | Daniel | ✅ grade from the lower bound, % range small next to it, sort by lower bound — **instance tab done (#983)**, lists not yet |
| C4 | Spec contracts for parts | team | **drafted** (`config/catalogue/contracts/specs/`, 32 files) |
