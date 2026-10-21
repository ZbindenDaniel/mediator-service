# Taxonomy & Contracts — a practical guide

How categories and contracts decide what the app asks about an item, how quality is calculated,
and how to change them without breaking existing data. Written for whoever maintains a deployment's
categories and question sets — no code changes needed for anything in here.

Related: [spare-parts-catalog.md](spare-parts-catalog.md) (slots, Einzelteile) ·
[component-lifecycle.md](component-lifecycle.md) (parts without an article number) ·
[contracts/README.md](../../contracts/README.md) (file reference) ·
[PLANNING_PARTS_CATALOGUE.md](../PLANNING_PARTS_CATALOGUE.md) (design + open questions)

---

## 1. The pieces in one picture

```
Taxonomy                 Contracts (JSON files, one per subcategory code)
─────────                ───────────────────────────────────────────────────────────────
20  Laptop          ┌──► quality/general.json   asked for EVERY item  + scale + grading
 └─ 201 Laptop ─────┼──► quality/group-20.json  asked for every item of main category 20 (optional)
                    ├──► quality/201.json       asked for laptops
                    ├──► specs/201.json         article specs for laptops (shown as "missing" when empty)
                    └──► assembly/201.json      the laptop's parts (slots) → Einzelteile page + quality
210 Laptop-Komponenten
 └─ 2105 Displaypanel ──► quality/group-210.json + quality/2105.json + specs/2105.json (+ assembly/2105.json if it has parts)
```

| Thing | What it is | Where it lives |
|---|---|---|
| **Main category** (Hauptkategorie) | A group, code in tens: `20`, `210` | Database (seeded from `taxonomy.seed.json`, edited in Admin → "Taxonomie verwalten") |
| **Subcategory** | What kind of thing an item is: `201` = Laptop. Code = main × 10 + n (`201`, `2105`) | Same |
| **Quality contract** | Questions asked in "Qualität bewerten" and how they score | `contracts/quality/<code>.json` |
| **Spec contract** | Which specs an article of this kind should have | `contracts/specs/<code>.json` |
| **Assembly contract** | The parts ("slots") an item of this kind consists of | `contracts/assembly/<code>.json` |
| **Group contract** | Questions shared by all subcategories of one main category | `contracts/quality/group-<main>.json` |

An item gets its subcategory from its **article** (`Unterkategorien_A`). A part that has no article yet
(e.g. a webcam just catalogued inside a laptop) gets it from **the slot it sits in** — so it is assessable
before anyone has identified it.

---

## 2. Where files come from (per deployment)

| Source | Used for | Notes |
|---|---|---|
| `contracts/` in the repo | shipped defaults | built into the image |
| `CONTRACTS_OVERLAY_DIR` | per-deployment contracts | a file here **replaces** the shipped file of the same name; Admin uploads write here; must be writable + persistent |
| `config/taxonomy.seed.json` / `TAXONOMY_SEED_FILE` | the categories | **only fills an empty database** — see §6 |
| `FEATURES_FILE` | which features are on | e.g. `config/features.catalogue.example.json` |

The catalogue deployment bundles all three in [`config/catalogue/`](../../config/catalogue/README.md) and
[`docker-compose.catalogue.yml`](../../docker-compose.catalogue.yml).

---

## 3. How quality is calculated

Every **scored** thing has a **weight** (how important it is). Each answer is a **state** with a value
between 0 and 1. The item's quality is a **range**:

```
certain  = what has been checked, weighted
possible = certain + everything not checked yet
quality  = certain / total  …  possible / total            e.g. "60–85 %"
```

| Example part | Weight | Answer | Certain | Possible |
|---|---|---|---|---|
| Webcam | 3 | Gut (1.0) | 3 | 3 |
| Scharniere | 4 | Abgenutzt (0.75) | 3 | 3 |
| Tastatur (device question) | 5 | not answered | 0 | 5 |
| Mainboard | 8 | 0.75 | 6 | 6 |
| | **20** | | **12** | **17** → **60–85 %** |

- **States** come from the `scale` in `general.json` ("Gut" 0.7, "Kaputt" 0 …); a question can override
  them with its own `states`. An answer with no value ("Ungetestet", "?") counts as *not checked*.
  `null` means "doesn't apply" (left out entirely).
- **Parts** count with their own range: a webcam assessed at 50–90 % in a slot of weight 3 adds 1.5–2.7.
  A part taken out of the device, or answered "Nicht vorhanden", counts 0. A slot **nobody has looked at
  yet** — unanswered, or "Vorhanden" without an assessed part — is **left out**, like "Nicht vorgesehen" and
  "Fest verbaut". So a device graded at creation keeps its grade while it is taken apart; each assessed
  part only adds detail. (An unanswered *question* still counts as not checked, as in the table.)
- **Parts replace device questions (`refinedBy`):** a device question can name the slots it stands in
  for — `"refinedBy": ["palmrest", "bottom_case"]` on "Gehäuse-Zustand". Once **every** listed slot is
  assessed, removed or "Nicht vorhanden", the question leaves the score and the parts speak for the
  chassis. If one of them is "Fest verbaut"/"Nicht vorgesehen", the question stays.
- **Knock-outs** cap the whole item when something is *certainly* bad: a swollen battery with
  `"knockout": { "below": 0.5, "cap": 0.19 }` makes the device at most 19 % (= "Ersatzteil"), however good
  the rest is.
- **Grade 1–5** (badges, shop, ERP) = the band of the **lower** bound ("at least …"), from `grading` in
  `general.json`. If the range is wider than `maxUncertainty` (default 25 points) there is no grade — the
  badge shows "?" and the instance tab says "zu wenig bewertet für eine Note".
- A grade set by hand is marked **"manuell"** and stays until the next assessment.
- Items without any assessment keep their imported grade.

---

## 4. File anatomy (copy-paste starting points)

**`quality/general.json`** — scale + grading + questions for every item:
```json
{
  "version": 5,
  "scale": { "Neuwertig": 1, "Sehr gut": 0.9, "Gut": 0.7, "Ok": 0.5, "Kaputt": 0, "Nicht zutreffend": null },
  "grading": { "bands": [{ "min": 0.8, "value": 5 }, { "min": 0.6, "value": 4 }, { "min": 0.4, "value": 3 },
                         { "min": 0.2, "value": 2 }, { "min": 0, "value": 1 }], "maxUncertainty": 0.25 },
  "questions": []
}
```

**A question** (in any quality file):
```json
{ "id": "keyboard_condition", "type": "select", "question": "Tastatur-Zustand?",
  "values": ["Gut", "Abgenutzt", "Beschädigt", "Ungetestet"],
  "weight": 3,
  "states": { "Abgenutzt": 0.75, "Beschädigt": 0.25 },
  "knockout": { "below": 0.3, "cap": 0.39 },
  "specField": "Tastatur-Zustand", "specValue": "%v" }
```
- `type`: `select` · `boolean` (answers `"true"`/`"false"` — always give `states`) · `text` (not scored) ·
  `multi` (several values, e.g. missing keys; `states` keyed by count: `{ "1": 0.75, "3": 0.5 }`).
- Leave out `weight`/`states` for pure spec questions ("Wie viel RAM?") — they don't score.
- `specField`/`specValue` copy the answer into the item's specs. `showIf` shows a question only when another
  has a given answer.

**A slot** (in `assembly/<code>.json`):
```json
{ "key": "display_assembly", "label": "Displayassembly", "targetSubcategory": 2101, "weight": 10,
  "knockout": { "below": 0.25, "cap": 0.19 },
  "question": { "id": "part_display_assembly", "type": "select", "question": "Displayassembly?",
                "values": ["Vorhanden", "Nicht vorhanden", "Nicht vorgesehen", "Fest verbaut"] } }
```
- Weighted slots use exactly those four presence values. `multipleAllowed: true` for RAM-like slots.
- `"default": "Nicht vorgesehen"` shows a slot pre-set (e.g. a rarely fitted second drive). Display only —
  it is not saved or scored until someone answers; "Nicht vorhanden" is refused as a default.
- `"step": "<key>"` puts the slot into a work step for taking the item apart (see below).

**Assembly-level fields** (next to `parts`):
```json
{ "askOnCreate": ["battery"],
  "steps": [{ "key": "bottom", "label": "Akku & Bodenabdeckung" }, { "key": "display", "label": "Display abnehmen" }] }
```
- `askOnCreate`: the slots asked in the **device check at creation** (create form and intake station).
  Left out = every slot (refurbishment); `[]` = none (catalogue: the laptop is not opened at intake).
- `steps`: the order in which the item is taken apart; slots without a `step` are "Weitere Teile".
- **Nesting:** give `targetSubcategory` its own `assembly/` file and the part has parts of its own
  (Laptop → Displayassembly → Webcam). The Einzelteile page shows each level indented under its part.

**`specs/<code>.json`**: `{ "version": 1, "subCategory": 2105, "fields": [{ "key": "Diagonale", "required": true, "description": "…" }] }`

---

## 5. Recipes

| I want to… | Do this |
|---|---|
| **Add a part type** | Admin → "Taxonomie verwalten": new subcategory under the right main category (next free code). Then add a slot pointing at it in the parent's `assembly/` file, and optionally `quality/` + `specs/` files for it. |
| **Add a question** | Add it to the right quality file (general = everyone, `group-<main>` = a whole main category, `<code>` = one kind). New, unique `id`. |
| **Make something matter more/less** | Change its `weight`. Then run `npm run quality:recompute` so stored items follow. |
| **Change what an answer is worth** | Change `states` (or the `scale` in general.json), then `npm run quality:recompute`. |
| **Make a defect decisive** | Add a `knockout` to that question or slot. |
| **Tune the grade bands** | `grading` in general.json (per deployment via the overlay), then `npm run quality:recompute`. |
| **Add a spec field** | Add it to `specs/<code>.json`; `required: true` makes it show as missing until filled. |
| **Switch a deployment's categories** | Put the seed in place (`TAXONOMY_SEED_FILE`), then on an existing DB: `npm run taxonomy:apply -- <seed>` and restart the mediator (§6). |
| **Upload a contract on a running system** | Admin → "Taxonomie verwalten" → contract upload per code (needs `CONTRACTS_OVERLAY_DIR`). It is validated first and refused with the reason if it would break something. |

After **any** contract edit: `npm run contracts:check` (with the deployment's `CONTRACTS_OVERLAY_DIR` and
`TAXONOMY_SEED_FILE` set). It also runs in the test suite.

---

## 6. Taxonomy changes on a live database

- The seed file is applied **only when the taxonomy tables are empty** (first start). After that the
  database is the truth and Admin edits win — changing the file alone changes nothing.
- `npm run taxonomy:apply -- <seed>` makes an existing DB match a file: adds/updates everything in it and
  **deactivates** everything else (hidden from pickers; items keep their codes; nothing is deleted).
  `--keep-others` leaves the rest active. Applying the other seed again switches back.
- Restart the mediator afterwards — it caches the taxonomy at startup.
- Inside a container (no npm/ts-node there): `node dist/backend/cli/apply-taxonomy.js <seed>` — likewise
  `check-contracts.js` and `recompute-quality-scores.js` (see `config/catalogue/README.md` for staging).
- `taxonomy:apply` refuses to move an existing subcategory to another main category (codes and parents are
  permanent).

---

## 7. Rules that protect existing data

| Never… | Because |
|---|---|
| change or reuse a **subcategory code** | items reference it; deactivate instead |
| rename a **slot `key`** once parts were catalogued | parts store it and derive their subcategory from it |
| rename a **question `id`** or an **answer value** | stored assessments keep the old answers; they would stop scoring |
| reuse a question `id` across general / group / subcategory / assembly | the validator refuses it — ids must be unique per item |
| give a weighted slot's question its own `qualityImpact`/`states` | the slot is scored through presence + its part; it would count twice |
| break the code convention (sub = main × 10 + n) | group contracts and the categorizer rely on it |

Bump `version` when you change questions — it is stored with each assessment.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Taxonomy still shows the old categories | Seed only fills an empty DB → `npm run taxonomy:apply -- <seed>`, restart. Check the stack actually sets `TAXONOMY_SEED_FILE` (e.g. include `docker-compose.catalogue.yml`). |
| Contract changes have no effect | Overlay not set or not mounted (`CONTRACTS_OVERLAY_DIR`); a same-named overlay file shadows the shipped one; restart after editing files directly. |
| Badge shows "?" after an assessment | Range too wide — too much unchecked (§3). Answer more of the device questions, or assess parts on the Einzelteile page. |
| All grades shifted after a contract change | Expected after weight/scale/band changes; `quality:recompute` applied them to stored items. |
| A part has no questions | Its slot's `targetSubcategory` has no quality file and no group file — add one. |
| Upload refused | The error names the problem (cycle, unknown target subcategory, duplicate id, value without state …). |
| `contracts:check` lists "unused in this taxonomy" | Contracts for categories this deployment doesn't have (e.g. refurbishment files in the catalogue) — fine. |
