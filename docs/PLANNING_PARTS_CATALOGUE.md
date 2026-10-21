# Planning: Laptop Parts Catalogue (nested assemblies + percentage quality)

**Status:** Phases 1–4 built (#980, #982, #984). Catalogue taxonomy, contracts and specs **drafted** in
[`config/catalogue/`](../config/catalogue/README.md) for rework on the test environment. Before the live refurbishment
system gets this: calibrate the grade bands (C1). **Phase 6 planned (§11, 2026-10-20):** device-first creation,
Einzelteile page grouped by work steps, stable readable part IDs — replaces the drill-down modal and the Zerlegen card.
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
  *Phase 6 (§11) replaces this with an Einzelteile page; creation only checks the whole device.*
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
  graduation: the part ID never changes (#991), so their `ParentItemUUID` stays valid.

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

## 6. Nested assessment UX (D5) — ✅ built in #984 · to be replaced by §11 (Phase 6)

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
| 6 Device-first + Einzelteile | stable part IDs (✅ #991), `askOnCreate`/`steps`/`refinedBy`, slot scoring change, answer merge, article specs at creation, Einzelteile page, Zubehör split | **planned** (§11) |

---

## 10. Open questions

| # | Question | For | Status |
|---|---|---|---|
| C1 | **Calibrate grade bands / weights** so refurbishment grades match expectations (§5.6 table) — blocker before the live refurbishment system | team | open |
| C2 | Large trees stay ungraded until most parts are assessed | team | **superseded (2026-10-20, §11.4):** unassessed slots no longer count, so a device keeps its creation grade and parts only refine it |
| C3 | Overall condition on assemblies, or parts only? | team | ✅ every item, assemblies included, is scored the same way: its own assessment + its components (draft unchanged) |
| Q1 | Weight per part | team | **drafted** (`config/catalogue/`) |
| Q2 | Taxonomy tree (cables as one subcategory, M.2 as a 901 slot, microphone added) | team | **drafted** |
| Q3 | "Fest verbaut" (soldered CPU/RAM): excluded from the score (current) or counted? | team | open — the draft lets the C-Cover ask keyboard details when the keyboard is built in |
| Q6 | Displayassembly sold as one part? | team | open (draft gives it condition + FRU via group-210) |
| Q7 | Shared contract per Hauptkategorie | Daniel | ✅ built (`group-<code>`) |
| Q8 | Derive the 1–5 grade from the percentage | Daniel | ✅ yes (U3/U4) |
| Q9 | How lists show the range | Daniel | ✅ grade from the lower bound, % range small next to it, sort by lower bound — **instance tab done (#983)**, lists not yet |
| C4 | Spec contracts for parts | team | **drafted** (`config/catalogue/contracts/specs/`, 32 files) |

---

## 11. Phase 6 — device-first creation + Einzelteile page (planned 2026-10-20, not built)

**Why:** first test round. The flow is "a lot of clicking and somewhat confusing": a part shows up in two places with
different words (the quality modal's "Komponenten" block with its drill-down stack, and the Zerlegen card in the
Zubehör tab), you only ever see one level of the tree, and part IDs (`C-<random>`) are unreadable and change at
graduation. At creation, a laptop is **not** taken apart — the operator judges the whole device, as in refurbishment.
Taking it apart is a separate, optional pass that only adds detail.

### 11.1 Decisions (Daniel, 2026-10-20)

| # | Decision |
|---|---|
| E1 | **Creation = device check**, asked like refurbishment (display, keyboard, chassis, battery, RAM, storage …). Assembly slots are not asked at creation unless a contract says so |
| E2 | **S1 — parts refine the device answers.** A device question names the slots it covers; once they are assessed, the parts' ranges replace it in the score |
| E3 | **Creation fills the article (ItemRef) specs** from the spec contract. Missing required fields: **warning only**. Instance data is not edited at creation (beyond what quality answers already write today) |
| E4 | **Einzelteile page** on the left panel replaces the drill-down modal and the Zerlegen card, **in both deployments**. Instance-tab button "Neu bewerten" → "Einzelteile" |
| E5 | Einzelteile is grouped by **work steps** (G2), defined in the assembly contract |
| E6 | Zubehör tab: **accessory links stay editable**; the components part becomes a read-only summary linking to Einzelteile |
| E7 | **Part ID `C-<root Artikelnummer>-<subcategory>-<####>`**, minted once, **never renamed** |
| E8 | **The Artikelnummer is not derived** from parent + subcategory; graduation only sets it (write-once) |
| E9 | **`askOnCreate` is a list on the assembly contract**; missing = all slots (refurbishment unchanged) |
| E10 | Presence answers given on the Einzelteile page **merge into the latest assessment**; a new history row only on "Speichern" |
| E11 | **Default presence per slot** (`"default": "Nicht vorgesehen"`), e.g. rare second-drive slots — the walkthrough only touches what is unusual |
| E12 | **RAM and storage are asked with the device** (what is fitted matters more than cataloguing each stick); creating a RAM/SSD part later stays possible |
| E13 | **Left and right panel never overwrite each other**: disjoint answer sets, server-side merge, both reload after every save (§11.6 "Panel sync") |

Rejected, with reasons (so they are not re-proposed):
- **Derived Artikelnummer** (parent + subcategory, with or without dash). New Artikelnummern are `max + 1` over all
  refs (`getMaxArtikelNummer`, `CAST(... AS INTEGER)`): one 10-digit number moves every future article to that range,
  a nested one (14 digits) overflows INTEGER and breaks article creation for everyone, a dash breaks the cast and is
  refused by `generateItemUUID`. Generic parts (RAM, SSD, WLAN) would get one article per laptop model, and in
  refurbishment those would become ERP/Shopware articles.
- **Graduation as "delete + create an `I-` item".** That has to move the same rows the current re-key moves (relations
  on both sides, events, `QualityId`, attachments, printed labels) — it *is* the re-key under another name. A stable
  ID removes the problem instead.
- **Groups as real sub-assemblies (G3)**: creates items that do not exist physically and changes scoring.
- **Interactive SVG now**: one drawing per assembly level, kept in step with the contracts. Possible later as a
  picture per work step, keyed by slot keys (which are already load-bearing, R8).

### 11.2 The model after Phase 6

| Pass | Question | UI | Stored in |
|---|---|---|---|
| **Zustand** (creation, and later re-checks) | How good is *this item* as a whole? | creation step; right panel on the root node | the item's assessment (its own questions) |
| **Aufbau** (optional) | What is it made of, what is there? | Einzelteile, left panel | the parent's assessment (slot answers) |
| **Zustand of a part** | How good is *this part*? | right panel on a part node | the part's own assessment |

Rule of thumb for contract authors: **the device asks what can only be judged on the whole device or without
opening it; parts ask about their own physical condition.** Where both describe the same thing (display), the device
question carries `refinedBy`.

### 11.3 Contract fields (all optional; absence = today's behaviour)

```jsonc
// assembly/<code>.json
{
  "askOnCreate": ["battery"],              // slot keys asked at creation; missing = all slots, [] = none
  "steps": [                               // array order = work order; missing = one group "Weitere Teile"
    { "key": "bottom", "label": "Akku & Bodenabdeckung" },
    { "key": "storage", "label": "Speicher & Funk" }
  ],
  "parts": [
    { "key": "battery", "step": "bottom", ... },          // part without step → "Weitere Teile"
    { "key": "drive_25_2", "default": "Nicht vorgesehen", ... }   // shown pre-set; not stored until changed
  ]
}
// quality/<code>.json (device question)
{ "id": "screen_condition", ..., "refinedBy": ["display_assembly"] }
```

Validator (`contracts:check`) adds: `askOnCreate`/`refinedBy` reference existing slot keys of the **same
subcategory's** assembly contract (direct children only — a nested part is already inside its parent's range);
`step` references a declared step; step keys unique; a question with `refinedBy` has a `weight`; `default` is one of
the slot question's values and **not a "missing" value** (an unconfirmed "Nicht vorhanden" would silently cost score).

**Slot `default` (E11)** is display-only: the row shows it pre-set and it counts as answered for step progress, but it
is not written to the assessment until the operator changes or confirms it. Scoring needs nothing — an unanswered slot
and a "Nicht vorgesehen" slot are both excluded (§11.4) — and a later contract change of the default applies
everywhere instead of being frozen into old assessments.

**One question selector for both creation paths.** Today the frontend (`getAllQuestions`,
`frontend/src/lib/qualityContracts.ts`) and intake (`resolveIntakeQuestions`, `backend/lib/intake-quality-map.ts`)
each assemble the question list. The `askOnCreate` filter goes into one shared function in `models/` used by both, so
the create form and the intake station cannot drift apart.

### 11.4 Scoring changes ([models/quality-score.ts](../models/quality-score.ts), one function for server, intake, preview)

1. **A slot counts only when it has been looked at:** a linked part with a range → `w × child range`; "Nicht
   vorhanden" / removed to a box → 0 (certain); "Nicht vorgesehen" / "Fest verbaut" → excluded; **present but not
   assessed, or unanswered → excluded** (was: uncertain). Otherwise starting the walkthrough would *widen* the range —
   ticking 30 slots "✓" on a laptop graded at creation would turn its grade into "?". **Replaces C2.**
   Unanswered *questions* stay uncertain, as before (D8 unchanged for questions).
2. **S1 (`refinedBy`):** example — "Gehäuse-Zustand" lists `palmrest` + `bottom_case`. Only the palmrest assessed →
   the device question still counts (the bottom case has not been looked at). Both assessed → it drops out, the two
   parts now speak for the chassis. Rule: a device question drops out of the total once **every** slot it lists is assessed (part with
   a range) or missing/removed. If a covered slot is "Fest verbaut" or "Nicht vorgesehen", the device question stays
   (the condition is still judged on the device, Q3). The part's own slot weight then stands for that area — so the
   relative weight of an area can change on refinement (device question 4 → display slot 10); calibrating that is part
   of C1.
3. Knock-outs unchanged (a part's knock-out applies once it is assessed).

**Effect on refurbishment: none** — its slots carry no weights, its questions no `refinedBy`. Covered by the existing
refurbishment score tests plus new ones for (1)–(2).

### 11.5 Creation flow

- **Questions:** general + group + subcategory + the slots in `askOnCreate` (missing = all → refurbishment unchanged).
- **Catalogue content:** `config/catalogue/contracts/quality/201.json` takes over the refurbishment device questions
  (keyboard layout/condition, display, chassis, battery swollen, hinges) and adds **RAM and storage as unweighted
  questions with `specField`** (capacities, as refurbishment asks them) plus battery health as a weighted question.
  They are device questions, not slot answers, because the catalogue splits storage over four slots (`drive_25_*`,
  `m2_*`) and a capacity cannot be assigned to one of them before opening the device — and knowing what is fitted
  matters more than cataloguing each stick (E12). The `ram`/`m2_*` slots stay, so a stick can still become a part
  later; no `refinedBy` on RAM/storage (capacity is a spec, not a condition). `assembly/201.json` gets
  `"askOnCreate": []`. `refinedBy` drafted for display, keyboard (palmrest), chassis (palmrest + bottom_case),
  battery. *The team reviews these mappings and weights* (C1).
- **Article specs block** (E3), shown once the subcategory is known: the fields of `specs/<sub>.json`, required ones
  marked, saved into the article's Langtext. New article → editable, prefilled from the intake scan where a field
  matches; **existing article → read-only** with a link to edit the article (a change would hit every unit). Blank
  fields keep today's empty-key placeholders (`import-item.ts` `applySpecContract`), so the AI still sees the gaps.
  Missing required fields → warning, never a block. **Reuse** the article form's Langtext editor
  (`frontend/src/components/forms/itemFormShared.tsx`), no second spec editor.
- Unchanged: quality answers with `specField` still write `InstanceSpecs` (refurbishment RAM/storage behaviour).

### 11.6 Einzelteile page

**Entry:** instance tab button **"Einzelteile"** when the item's (effective) subcategory has an assembly contract;
otherwise the button stays **"Neu bewerten"** and opens the existing modal **reduced to a single level** (the level
stack goes away). Route `/items/:itemId/einzelteile` renders in `panel-main` (replacing the list; "← Liste" returns).

**Left — Aufbau:**
```
ThinkPad T480 · I-104523-0001                    Gut · 72–80 %
● Gerät — Zustand bei Erfassung                  bewertet
▼ 1 Akku & Bodenabdeckung                        2/3
    Akku            [✓][✕][n.v.][fest]           bewertet · 80–90 %
    D-Cover         [✓][✕][n.v.][fest]           offen
    CMOS-Batterie   [ ][ ][   ][    ]            ?
▶ 2 Speicher & Funk                              0/7
▶ 4 Display abnehmen                             0/1
    └ Displayassembly → its own steps, indented
▶ Weitere Teile
```
- **Presence control:** chips when the slot question uses the canonical presence values (§4.1); otherwise the slot's
  own select (refurbishment RAM/storage capacities, battery health) — refurbishment slots keep their meaning.
- Chips are **read-only while a part item sits in the slot** (state comes from the item: `cataloged`/`removed`), so
  "✕ fehlt" can never contradict an existing item. To undo, use "Lösen" on the part.
- `multipleAllowed`: one row per in-device instance + "+ weiteres".
- A step counts as done when every slot in it has a presence answer; the next step opens.
- Nested assemblies: a part with its own assembly contract expands **under its row** with its own steps.

**Right — the selected node** (new panel entity, URL-addressable `?entity=part&node=<rootId>/<slot>/<slot>` so a
reload keeps the place; an existing part may also be addressed by its ItemUUID):
- Header: label, ID (or "noch nicht erfasst"), range.
- The node's **own** questions only (general + group + subcategory — no "Komponenten" block), via `QualityReviewStep`.
- **"Speichern & nächster offener →"** creates the part lazily (and any not-yet-created ancestors, as #984 does), saves
  the assessment, reloads the left side.
- Actions: **Entnehmen** (into a box; optionally link an article: search an existing ref or create a new one —
  refurbishment parity, = `remove-from-device`), **Lösen**, **Artikel verknüpfen/ändern** (folds in todo 0n),
  "Artikel-Details öffnen" for existing parts.
- Root node "Gerät" = the device's own Zustand form (re-check after creation happens here).
- Unsaved answers per node keep the `qualityDraft` localStorage mirror (keyed per node) — switching nodes must not
  lose work.
- **Mobile:** step list = list view, node = detail view (as list ↔ detail today).

**Storage (E10):**
- New `PATCH /api/items/:id/quality-review/answers` `{ answers: { part_battery: "Vorhanden" } }` merges slot answers
  into the item's latest assessment (creates a first one if none), then recomputes. No history row per chip click.
- **The full save must not wipe the slot answers.** `POST …/quality-review` replaces the answer set; the right panel
  no longer sends slot questions. So the server carries over the previous answers for the slot-question ids of the
  current assembly contract when they are not in the request (the same carry-over as "Entnehmen", §5.4). Without
  this, saving the device's Zustand would erase the whole Aufbau.

**Panel sync (E13).** The two panels write **disjoint** answer sets of the same item: the left only slot answers
(PATCH), the right only the node's own questions (POST). Server-side:
- the PATCH accepts **only** slot-question ids of the item's assembly contract (400 otherwise);
- the POST keeps every stored slot answer the body does not send, **read at save time on the server**, so a chip
  clicked after the right form was opened is not lost (the right panel never sends slot ids, so no stale copy is
  written back). A slot answer the body *does* send still wins — the create form (`askOnCreate` slots) and, until
  6e, the refurbishment modal send them. ✅ built in #994.
Client-side: one shared revision for the page — every save on either side bumps it, both sides reload (the right
panel keeps its unsaved draft through the reload; the draft mirror already does that). A not-yet-created part that is
open on the right and then marked ✕/n.v. on the left closes on the right (its draft stays). Two people on the same
device at once: last write wins per answer set — accepted, not solved here.

**Zubehör tab (E6):** split `ZubehoerCard` (≈700 lines). Linked accessories (charger …), "Zubehör von" and compatible
articles stay editable in the tab. The slot part moves to Einzelteile; the tab shows "12 Teile erfasst · 3 entnommen
→ Einzelteile öffnen".

**Parity before retiring the Zerlegen card** (no phase with both): refurbishment's add-with-article (`spare-parts`
POST with a ref, `…/new-ref`), Entnehmen, Lösen, multi-slot "+ weiteres". Checklist in the PR.

### 11.7 Part IDs (E7, E8)

- **Format:** `C-<root Artikelnummer>-<subcategory>-<####>`, e.g. `C-104523-2132-0003`. Root = walk `Zerlegt_aus`
  to the top device (a webcam inside the Displayassembly gets the laptop's number). Counter per (root article,
  subcategory) across all devices: two T480 batteries are `…-2132-0001`, `…-2132-0002`; which device a part sits in
  comes from the relation, not the ID. Root without Artikelnummer → 400 (devices always have one).
- **Minted once from what is known at creation:** created *with* an article (refurbishment add-with-ref) → the normal
  `I-<Artikelnummer>-####`, as today; created *without* → `C-…`. **No ID ever changes afterwards.**
- **Graduation** = set `Artikel_Nummer` (write-once guard stays) + relocate. The re-key in
  `graduate-component.ts` (relations both sides, events, one transaction) is deleted. So: `C-104523-2132-0003`
  stays `C-104523-2132-0003` with `Artikel_Nummer = 019456` — not `I-019456-0003`.
- **Generator:** a small dedicated function using `getMaxItemId` with pattern `C-104523-2132-%`. Not
  `generateItemUUID`: it refuses dashes in the identifier on purpose, and loosening that would weaken the normal IDs.
  The `C-` prefix keeps parts out of the `I-104523-%` counter (with an `I-` prefix the 4 characters after the dash
  would read "2132" and restart the device counter at 0001 → collision).
- **Removed:** random `generateComponentUUID`; `isComponentUUID` (no callers outside tests).
- **Existing random `C-` items** (test environment only): left as they are — nothing parses them.
- **Checked (6a):** agentic runs are keyed by Artikelnummer, never by ItemUUID, so the invoker never sees a part ID
  (no fix needed). `resolveCanonicalItemUUID` falls back for an article whose only instances are `C-`, and
  `isCanonicalInstance` treats a part as non-canonical — both by design. Still to watch: the ERP export's `ItemUUID`
  column carries `C-` IDs for graduated parts, and a CSV re-import must update those in place.
- **Intake disks:** scan slot keys are device names (`nvme0n1`, `sda`), not assembly slot keys, so their ID gets the
  `0` subcategory segment (`C-104523-0-0001`) and they have no effective subcategory — a scan-to-slot mapping is a
  follow-up (todo).

### 11.8 What disappears (debt check)

| Removed | Replaced by |
|---|---|
| Level stack + per-slot drafts in `QualityReviewModal` | Einzelteile (modal stays single-level for non-assemblies) |
| "Komponenten" block in `QualityReviewStep` | left panel |
| Slot half of `ZubehoerCard`, probably `SparepartSlotPopup` | Einzelteile rows + right panel |
| Re-key in `graduate-component.ts` | stable IDs |
| `generateComponentUUID` (random), `isComponentUUID` | dedicated sequential generator |
| Two question assemblers | one shared selector in `models/` |

New: three optional contract fields + validator rules, one PATCH route, one panel entity, one page. No database
migration.

### 11.9 Order of work

| Step | Content | Tests |
|---|---|---|
| 6a ✅ | Part IDs: generator, root resolution, graduation without re-key (#991) | Jest: format, counter, nesting, graduation keeps ID |
| 6b ✅ | Contract fields + validator; shared question selector; scoring (11.4) (#993) | Jest: validator, score cases incl. refurbishment unchanged |
| 6c ✅ | Answer merge PATCH + carry-over in `POST …/quality-review` (#994) | route tests: chip then full save keeps both |
| 6d | Creation: `askOnCreate`, article specs block | jsdom: block editable/read-only, warning |
| 6e | Einzelteile page + panel entity; Zubehör split; parity; retire Zerlegen card + level stack | jsdom + **browser walkthrough** on a disposable DB |
| 6f | Catalogue content drafts: 201 device questions, `refinedBy`, steps for 201/2101 | `contracts:check` |
| — | Docs: this plan, `component-lifecycle.md`, `spare-parts-catalog.md`, `taxonomy-and-contracts.md`, user help | — |

**Workload (estimate, 2026-10-20):** ~8–10 working sessions; 6e is about half of it. Delivered in three mergeable
chunks so test feedback can still shape the page: **A** = 6a–6c (backend, invisible to users, refurbishment grades
unchanged), **B** = 6d (creation — testers feel it at once), **C** = 6e–6f (Einzelteile + content).

### 11.10 Open (for the team, does not block building)

| # | Question |
|---|---|
| F1 | Work steps for 201 and 2101 (draft from 6f to rework) |
| F2 | `refinedBy` mapping and the device-question weights next to the slot weights (part of C1) |
| F3 | Picture per work step (SVG/photo keyed by slot keys) — later, once the steps are stable |
