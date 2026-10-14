# config/catalogue/ — spare-part catalogue deployment (DRAFT)

**Status: draft for the team to rework** (2026-10-14). Weights, knock-outs, the part list and the
taxonomy codes are proposals, to be tuned on the test environment before real use. Plan and open
questions: [`docs/PLANNING_PARTS_CATALOGUE.md`](../../docs/PLANNING_PARTS_CATALOGUE.md).

## Contents
- `taxonomy.seed.json` — **only** Laptop + its components: Hauptkategorie **20 Laptop** (201 Laptop) and
  **210 Laptop-Komponenten** (2101–2132, incl. Mainboard 2127, Prozessor 2128, Arbeitsspeicher 2129,
  Festplatte/SSD 2130, WLAN-Karte 2131, Akku 2132 — kept inside 210 instead of reusing the generic 60x/90x/710/206
  codes, so the taxonomy has nothing else and group-210 covers every part)
- `contracts/` — contract overlay:
  - `quality/general.json` — scale + grading only, no device-wide questions (conditions live on the parts)
  - `quality/group-210.json` — every component: condition (weighted) + part number (FRU)
  - `quality/201.json` — laptop-level only (boots?); `2102|2103|2104|2132.json` — palmrest (keys when the keyboard is
    built in), bottom case (rubber feet), keyboard (layout, missing keys), battery health
  - `assembly/201|2101|2102|2103|2115|2120.json` — the part tree with weights; display assembly, mainboard, CPU, panel
    knock out at "Ersatzteil" when missing/broken
  - `specs/2101–2132.json` — article specs per part type: identifying fields + `FRU` + `Kompatible Modelle`

## Use
**Docker (test environment):**
```bash
docker compose -f docker-compose.yml -f docker-compose.catalogue.yml up -d --build
# existing database: the seed only fills an EMPTY taxonomy → apply it once from the host, then restart
npm run taxonomy:apply -- config/catalogue/taxonomy.seed.json
docker compose -f docker-compose.yml -f docker-compose.catalogue.yml restart mediator
```
`taxonomy:apply` upserts the file and **deactivates** every other category (hidden from pickers; items keep
their codes; nothing is deleted). `--keep-others` leaves them active. Re-applying `config/taxonomy.seed.json`
switches back (and deactivates 210).

The compose override bind-mounts `config/catalogue/contracts` as the writable overlay, so contract edits made in
Admin land in the repo — handy on the test environment. For a real deployment mount a persistent non-repo copy.

**Without Docker:** `TAXONOMY_SEED_FILE=config/catalogue/taxonomy.seed.json`,
`CONTRACTS_OVERLAY_DIR=<writable copy of config/catalogue/contracts>`, `FEATURES_FILE=config/features.catalogue.example.json`.

Check: `CONTRACTS_OVERLAY_DIR=… TAXONOMY_SEED_FILE=… npm run contracts:check` — the shipped refurbishment contracts
show up as "unused in this taxonomy" (not errors). Jest validates this draft on every run.

## Rules
- Slot `key`s are immutable once parts were catalogued with them (see `contracts/assembly/README.md`)
- After changing weights on a running system: `npm run quality:recompute`
