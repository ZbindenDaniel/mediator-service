# Proposal: main-category spec contracts

These are **drafts**, not live. They exist so we can raise spec-contract coverage from ~12 subcategory
files to the whole catalogue without authoring ~140 per-subcategory contracts.

## How the fallback works (shipped)

`getSpecContract(sub)` now layers a shared **main-category** file over the subcategory's own file,
mirroring how `getQualityContract` already layers `quality/group-<haupt>.json`:

- `specs/<sub>.json` present, no group → the subcategory file (unchanged behaviour).
- `specs/group-<maincat>.json` present, no subcategory file → the group contract covers that subcategory.
- both present → **merged**: the subcategory's fields lead and **win on a key conflict** (a subcategory is
  more specific than its category default); group-only fields are appended.
- neither → `null` (no contract, as before).

The group key is `group-<Hauptkategorie>` (e.g. `group-90` for 901/905). It is **inert until a
`specs/group-*.json` file exists**, so shipping the mechanism changed nothing on its own.

## How to activate a proposal

1. Review/adjust the draft here.
2. Move it to `contracts/specs/group-<maincat>.json` **or** upload it via the admin contracts editor
   (which clears the contract cache so it takes effect immediately — editing a file on disk alone is
   cached per process until a restart).
3. Bump the version when you later change it, so the self-heal sweep re-processes affected items.

Required fields drive `missing_required` findings and the self-heal sweep, so keep `required: true` to
fields that are genuinely universal for the category and usually extractable — everything else
`required: false` (desired).

## Coverage map (main category → has a group proposal? existing subcategory files)

| Cat | Name | Existing sub files | Group proposal | Notes |
|----|------|--------------------|----------------|-------|
| 10 | Computer/Komplettsysteme | 102,103,105,109 | ✅ group-10 | homogeneous — good fit |
| 20 | Laptop/Zubehör | 201,204 | — | mostly covered by subs |
| 30 | Drucker/Fax/Scanner | 301 | ⚠️ not drafted | **mixed** (printer vs scanner vs fax) — a single required set is awkward; prefer per-sub or a minimal group |
| 40 | Monitor/Beamer/Kamera | 401 | ⚠️ not drafted | **mixed** — only `Auflösung`/`Anschluss` generalize; keep minimal |
| 50 | Tastatur/Maus/VR | — | ⚠️ needs domain input | no sub files yet |
| 60 | Mainboard/CPU/RAM | 601 | ⚠️ not drafted | **mixed** (board vs CPU vs module) — keep minimal |
| 70 | Steckkarten | 701 | ✅ group-70 (generic) | 701 keeps its richer file |
| 80 | Gehäuse/Netzteile/USV/… | — | ⚠️ needs domain input | very mixed |
| 90 | Festplatten/Flashcards/Sticks | 901,905 | ✅ group-90 | homogeneous — good fit |
| 100+ | (further categories) | — | ⚠️ needs domain input | |

**The honest caveat:** main-category contracts shine for *homogeneous* categories (90 storage, 10
computers) where the whole category shares specs. For *mixed* categories (30, 40, 60, 80) a single
required-field set mis-fits some members, so those are better served by a **minimal** group (few/no
required fields — enough to enable a data-quality grade without false `missing_required` noise) plus
per-subcategory files where it matters. The three drafts here are the clean, homogeneous wins; the mixed
ones are flagged for a quick domain pass rather than guessed at.
