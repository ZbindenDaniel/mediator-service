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

| Cat | Name | Existing sub files | Group proposal | Required set | Notes |
|----|------|--------------------|----------------|-------------|-------|
| 10 | Computer/Komplettsysteme | 102,103,105,109 | ✅ group-10 | Prozessor* | homogeneous — good fit |
| 20 | Laptop/Zubehör | 201,204 | ✅ group-20 | none (minimal) | mixed (laptops+accessories); subs override |
| 30 | Drucker/Fax/Scanner | 301 | ✅ group-30 | none (minimal) | mixed; sanity-check `Gerätetyp` |
| 40 | Monitor/Beamer/Kamera | 401 | ✅ group-40 | none (minimal) | mixed; only resolution/connection generalize |
| 50 | Tastatur/Maus/VR | — | ✅ group-50 | none (minimal) | mixed input devices |
| 60 | Mainboard/CPU/RAM | 601 | ✅ group-60 | none (minimal) | mixed (board/CPU/module); 601 overrides |
| 70 | Steckkarten | 701 | ✅ group-70 | Schnittstelle* | generic; 701 keeps its richer file |
| 80 | Gehäuse/Netzteile/USV/… | — | ✅ group-80 | none (minimal) | very mixed |
| 90 | Festplatten/Flashcards/Sticks | 901,905 | ✅ group-90 | Speichertyp*, Speicher* | homogeneous — good fit |
| 100+ | (further main categories, if any) | — | ⚠️ needs taxonomy check | — | confirm these exist as real top-level categories before drafting |

All 9 labelled main categories (10–90) now have a draft. **The honest caveat:** main-category contracts
shine for *homogeneous* categories (90 storage, 10 computers, 70 cards) where the whole category shares
specs — those get real required fields. For *mixed* categories (20/30/40/50/60/80) a single required set
mis-fits some members, so those drafts are deliberately **minimal** (no required fields): they still give
every subcategory a data-quality grade + canonical key names and remove the "no contract → never swept"
exception, without false `missing_required` noise. Promote a field to `required` per-category once you
confirm it's universal there.

**Before activating:** sanity-check each `required` choice, then move the file into `contracts/specs/`
(or upload via the admin contracts editor) and reload. The homogeneous three (10/70/90) are the ones that
will actually drive reworks; the minimal six mostly unlock grading/coverage.
