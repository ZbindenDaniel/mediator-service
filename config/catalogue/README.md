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

The overlay lives in the `mediator-data` volume (`/var/lib/mediator/contracts-overlay`, writable by the app's
uid 33). Fill it — and refresh it after editing `config/catalogue/contracts/` — with:
```bash
F="-f docker-compose.yml -f docker-compose.catalogue.yml"
docker compose $F run --rm --no-deps -u 0 --entrypoint sh mediator -c \
  'mkdir -p /var/lib/mediator/contracts-overlay && cp -r /srv/catalogue/contracts/. /var/lib/mediator/contracts-overlay/ && chown -R 33:33 /var/lib/mediator/contracts-overlay'
docker compose $F restart mediator
```
Contract uploads made in Admin land in the volume, not in the repo; copying from the repo overwrites them.

**Staging / production host** (stack from `docker-compose.prod.yaml`): the image does not contain
`config/catalogue/`, so the files live in host folders next to the compose files and
`docker-compose.prod.catalogue.yaml` mounts them and sets `TAXONOMY_SEED_FILE`/`FEATURES_FILE`/`CONTRACTS_OVERLAY_DIR`
(don't set those in `.env`):
```bash
# laptop → host deploy dir (dir must be writable for you, e.g. group www-data + g+w)
scp -r config/catalogue docker-compose.prod.catalogue.yaml host:<deploy-dir>/
scp config/features.catalogue.example.json host:<deploy-dir>/catalogue/features.json
# host
mkdir -p contracts-overlay && [ -z "$(ls -A contracts-overlay)" ] && cp -r catalogue/contracts/. contracts-overlay/
sudo chown -R www-data:www-data catalogue contracts-overlay && sudo chmod -R g+w contracts-overlay   # uid 33 = app user
F="-f docker-compose.prod.yaml -f docker-compose.prod.catalogue.yaml"   # + the authentik override if used
docker compose $F up -d
# only if the database already has a taxonomy (a fresh DB is seeded on first start):
docker compose $F exec mediator node dist/backend/cli/apply-taxonomy.js /srv/catalogue/taxonomy.seed.json
docker compose $F restart mediator
```
The same CLIs run in any container: `node dist/backend/cli/check-contracts.js`, `node dist/backend/cli/recompute-quality-scores.js`.

**Without Docker:** `TAXONOMY_SEED_FILE=config/catalogue/taxonomy.seed.json`,
`CONTRACTS_OVERLAY_DIR=<writable copy of config/catalogue/contracts>`, `FEATURES_FILE=config/features.catalogue.example.json`.

Check: `CONTRACTS_OVERLAY_DIR=… TAXONOMY_SEED_FILE=… npm run contracts:check` — the shipped refurbishment contracts
show up as "unused in this taxonomy" (not errors). Jest validates this draft on every run.

## Rules
- Slot `key`s are immutable once parts were catalogued with them (see `contracts/assembly/README.md`)
- After changing weights on a running system: `npm run quality:recompute`
