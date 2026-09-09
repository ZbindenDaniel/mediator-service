# Intake image guide — producing a complete item

Practical reference for writing the netboot intake script. Pairs with the runnable request
contract in [`intake-image.http`](intake-image.http); the flow itself is in
[`intake.md`](intake.md); components in [`component-lifecycle.md`](component-lifecycle.md).

The goal: by the end of Phase 1 the item should be **complete** — quality assessed, required
specs filled, accessories recorded. Three of the four channels the script controls feed this.

## 1. Flow in one glance

```
GET  /api/intake/categories                      # bootable categories for the "new ref" TUI
POST /api/intake/start                           # scan → select_ref | quality | phase2
POST /api/intake/{key}/answer  {type:'ref'}      # pick/create Artikelnummer → returns quality questions
POST /api/intake/{key}/answer  {type:'quality'}  # answers + specs → item complete
POST /api/intake/{key}/complete                  # trigger agentic enrichment
# Phase 2 (async): upload test artefacts under SN:{serial}/ and SN:{diskSerial}/
```

`{key}` is `SN:{serial}` (or `MAC:{mac}` when no serial). Auth: `X-Intake-Token` on all
`/api/intake/*` routes. The `/api/contracts/*` routes are open (no token).

## `select_ref` — new instance or an existing one?

`/start` matches a booted device to an existing item **by serial/MAC**. Items catalogued before
the intake API (or by hand) usually have neither on file, so that lookup misses and the flow lands
on `select_ref` — historically the only choice there was "create a new instance", which produced a
duplicate of the device already in stock.

To avoid that, each `select_ref` candidate now carries **`matchableInstances`**: existing instances
of that reference with **no serial and no MAC** (excluding in-device components and zero-stock
items) — the exact devices that *could* be the one on the bench. The TUI should:

1. Operator picks a reference candidate.
2. If it has `matchableInstances`, ask **"new device or one of these existing ones?"** — show each
   by `boxLabel`/`location` + `quality` so the operator can recognise the shelf unit.
3. **New** → send `{ type:'ref', artikelNummer }` as before (mints a new instance).
   **Existing** → send `{ type:'ref', artikelNummer, useItemUUID:'<the instance>' }` — the scanned
   serial/MAC + scan are bound to that instance and the flow continues to `quality` on it.

The whole feature is **additive**: a script that ignores `matchableInstances` and never sends
`useItemUUID` behaves exactly as before. Guards: `useItemUUID` must belong to `artikelNummer` and
must not already carry a *different* serial/MAC (else `409`); re-sending the same identity is
idempotent.

## The questionnaire is auto-trimmed — you render what comes back

At intake the server answers everything it already knows and returns **only the questions a human
must decide**. Two contract-declared mechanisms (see the contract JSON, no code):
- **`autoFill: "<signal>"`** on a question → the server answers it from the scan (signals:
  `ram`, `storageSize`, `storageType`, `battery`) and drops it. Numeric signals snap to the
  question's own `values`.
- **`skipAtIntake: true`** on a question → "a booted device implies this"; assumed present and
  dropped (e.g. `has_fan`, `has_display`, `has_mainboard`).

So for a laptop, what remains are the **human-judgment** questions — cosmetic (Verfärbungen/
Kleberückstände, Kratzer), OS, keyboard layout + condition, display condition, swollen battery,
hinges, dusty fan — while RAM, storage, drive type, battery %, and the boot-implied presence
checks are resolved from the scan. The script needs **no change** for this: it already renders `qualityQuestions`
generically, so a shorter list just renders shorter, and the scan it already sends (persisted at
the ref step) is what the server resolves from. Adding/removing an auto-resolved question later is
a contract-JSON edit. (A `showIf` pointing at an auto-answered question is resolved server-side —
the dependent is asked or dropped based on the auto value — so you never need the script to know
about auto-answers.)

### `detectedSpecs` — show the operator what the scan filled in (optional to render)
Alongside `qualityQuestions`, the `quality`-step responses (`/start` step 2 and the `ref` answer)
now carry **`detectedSpecs: [{ label, value }]`** — the scan-answered specs the server resolved
instead of asking (RAM, Speicher, Speichertyp, Akku). Render them as a short read-only banner so
the operator sees the machine's known specs even though there was no question, e.g.:

```
Aus Scan übernommen:  RAM 8 GB · Speicher 256 GB · Speichertyp NVMe SSD · Akku Gut (>80%)
```

It is informational only — there is nothing to answer. If a spec you expected is **missing** from
`detectedSpecs` (and instead appears as a question), the scan didn't carry it — see the disk-size
warning under "The generic `components[]` object".

## 2. Specs — how to fill them

Specs at intake are written to the **instance** (`items.InstanceSpecs`); ref-level
Spezifikationen are filled later by agentic. Three sources merge, lowest precedence first:

1. **Scan-derived** (automatic) — the server back-fills `Prozessor`, `RAM`, `Speicher`,
   `Speichertyp` from the scan ("present because the device booted"). The scan is persisted at the
   ref step, so this works even if the quality call omits `scanPayload`; echoing it still works and
   takes precedence.
2. **Questionnaire-derived** — any answered question carrying a `specField` becomes a spec.
3. **`instanceSpecs`** (explicit, highest precedence) — a **free-form** map the script sends
   directly. This is your main lever: send everything you auto-detected.

> **Spec-name alignment is manual / by convention.** There is no automatic key aliasing at
> intake — a spec only counts toward completeness if its key exactly matches the spec
> contract. Use the canonical keys below. (An agentic-side canonicalizer maps a few CPU→Prozessor
> variants later, but do not rely on it here.)

### Canonical spec keys
Fetch the authoritative list per subcategory: **`GET /api/contracts/specs/{subcategory}`**
(each field has `key`, `required`, `description`). Example — **Laptop (201)**:

| Key | Required | From |
|---|---|---|
| `Prozessor` | ✅ | scan `cpu` |
| `RAM` | ✅ | scan `ramMb` → "8 GB" |
| `Speicher` | ✅ | scan `disks[0].sizeGb` → "256 GB" |
| `Speichertyp` | — | scan `disks[0].type` → "NVMe SSD" |
| `Display` | — | operator / instanceSpecs |
| `Betriebssystem` | — | operator / instanceSpecs |
| `Akku` | — | `battery_condition` answer |
| `Tastatur-Layout` | — | `keyboard_layout` answer |

Send specs with the same casing/spelling as the contract keys (German, exact).

## 3. Accessories — now part of the questionnaire

The quality step now also returns **assembly (accessory) questions** for the subcategory.
They come back in the `qualityQuestions` array of the `ref` answer (and `/start`'s `quality`
step); you can also fetch them directly: **`GET /api/contracts/assembly/{subcategory}`**.

Each assembly part yields up to two questions:
- a **presence** question (e.g. `has_fan`, boolean) — a "no" drops quality (a missing part
  makes the device an Ersatzteil), and
- optionally a **spec** question (e.g. `keyboard_layout`, `ram_gb`, `drive_type`) — its answer
  fills a spec.

Answer them in the same `qualityAnswers` map by question `id`. Presence answers are
`"true"`/`"false"`; selects are the option string. Several are pre-filled from the scan
(`ram_gb`, `storage_gb`, `drive_type`, `battery_condition`) via `defaultValue` — confirm or
override.

### Every question is skippable — "don't know" is valid
**No intake question is mandatory.** To skip one, either **omit its `id`** from `qualityAnswers`
or send an **empty string** (`""`). The server treats both as *unanswered*: a skipped question
never contributes to the quality score and never produces a spec (so a skipped `ram_gb` will not
write `RAM: " GB"`). A skipped answer also never overrides a value the scan already resolved.
The station TUI should let the operator press **Enter on an empty prompt to skip** any question
(select, boolean, or text) — see the `phase1.sh` skip patch in the intake changelog (#916).

### Accessories as *specs* vs. accessories as *linked items*
- Most accessories are captured as **specs/presence answers** (above) — no separate item is
  created. This is the default and avoids identity-less clutter.
- A detected sub-device becomes a **linked component item** automatically **iff it has a usable
  serial** (see [component-lifecycle.md](component-lifecycle.md)). Disks qualify; most PCI cards
  (GPU/NIC) do not and stay spec/presence. Slots like `storage` are also marked `noLink`
  (spec-only) in the contract.

### The generic `components[]` object
The scan carries a `components[]` array — one entry per detected sub-device, extensible for the
future:

```jsonc
{ "kind": "gpu",     // 'disk' | 'gpu' | 'network' | 'pci' | 'memory' | … (open)
  "slotKey": "gpu",  // the assembly slot it fills (optional)
  "serial": null,    // usable → auto-created as an item; absent → assembly info only
  "wwn": null, "vendor": "NVIDIA", "model": "GT 710", "type": null, "sizeGb": null,
  "attributes": {}   // open bag for anything the image learns later
}
```

- `disks[]` is a **shorthand** for `kind:'disk'` components (`name` → `slotKey`); both fold into
  one list server-side. Send either or both.
- **Serial present & usable** → materialized as an in-device item; its serial keys its Phase-2 reports.
- **Serialless** (typical PCI) → not created. Its `slotKey` pre-fills the assembly questions by
  convention: `has_<slotKey>` → `"true"` and `<slotKey>_model` → its `model`. So a detected GPU
  tagged `slotKey:"gpu"` pre-answers a `has_gpu` question (operator confirms) — only if the
  subcategory's assembly contract defines that slot.

### ⚠️ Disk `sizeGb` MUST come from `lsblk`, not `smartctl`
`sizeGb` drives the `storageSize` signal that auto-answers (and drops) the `storage_gb` question.
The server treats `sizeGb <= 0` as **unknown** and therefore **asks the operator** for storage.

Source the size from the block device, not from SMART:

- ✅ **`lsblk -bdno SIZE /dev/<name>`** (bytes) → `/ 1073741824 | floor`. `lsblk` reports capacity
  for every block device — SATA, NVMe, eMMC, USB — regardless of transport.
- ❌ **`smartctl` `.user_capacity.bytes`** is an **ATA/SATA** field. It is **empty for NVMe**
  (SMART reports NVMe capacity under `nvme_total_capacity` / namespace fields) and empty whenever
  `smartctl` open-fails (some USB bridges), so it yields `sizeGb: 0` on exactly the modern NVMe
  laptops we intake — which is why storage kept being asked. Keep `smartctl` for **identity only**
  (`serial` / `wwn` / `model` / protocol→`type`); take **size** from `lsblk`.

**Self-check:** the server logs one `[intake] question resolution` line per questionnaire build. If
`unresolvedAutoFill` contains `{ id: "storage_gb", autoFill: "storageSize" }`, the scan sent no
usable size — fix the image, not the contract.

## 4. Putting it together — a complete quality answer

```jsonc
POST /api/intake/SN:PF1ABCDE/answer
{
  "type": "quality",
  "qualityAnswers": {
    "cosmetic": "B",
    "has_fan": "true", "has_keyboard": "true", "keyboard_layout": "CH",
    "has_display": "true", "battery_condition": "Gut (>80%)",
    "ram_gb": "8", "storage_gb": "256", "drive_type": "NVMe SSD", "has_mainboard": "true"
  },
  "instanceSpecs": {                     // canonical keys; win over scan/questionnaire
    "Prozessor": "Intel i5-8350U",
    "RAM": "8 GB DDR4",
    "Speicher": "256 GB NVMe",
    "Display": "14\" FHD (1920x1080)",
    "Betriebssystem": "—"
  },
  "scanPayload": { /* echo the /start scan so required specs back-fill if omitted above */ }
}
```

The response returns `nextStep: 'phase2'` with the quality summary. The item now has quality,
specs, and accessory answers — a complete Phase-1 item.

## Contract → script sync

What changes on the script side when you edit a contract. The rule of thumb: the script renders
`qualityQuestions` **generically** (ref selection and the like stay explicit), so most contract
edits need no script change.

**What the script receives.** Only `qualityQuestions` (on `/start`'s `quality` step and the
`ref` answer). Each entry is exactly:

```ts
{ id, type: 'select' | 'boolean' | 'text', question,
  values?, suggestions?, specField?, defaultValue?, showIf? }
```

Nothing else crosses the wire — see "what does *not* reach the script" below.

**Which contract feeds what:**

| You edit | Script sees |
|---|---|
| `quality/general.json` | its questions, for every device |
| `quality/{subcat}.json` | its questions, for that subcategory |
| `assembly/{subcat}.json` | each part's `question` **and** `specQuestion` as questions |
| `specs/{subcat}.json` | **nothing** — not a questionnaire; defines which spec *keys* count as complete |

Question order: general → subcategory → assembly.

**Edits that need NO script change** (given generic rendering):
- add / remove / reword / reorder a quality or assembly question;
- change a select's `values` (the new list flows through in `values`);
- retune `qualityImpact` or change `specValue` — these are **server-side only**; the server scores
  quality and derives specs from the raw answers, so the script never sees them.
- add/remove **`autoFill`** or **`skipAtIntake`** on a question — the server just returns a shorter
  (or longer) list; the script renders whatever comes back. Auto-resolved answers are applied
  server-side, so they still contribute to quality and specs.

**Edits that DO need script attention:**
- **New required key in `specs/{subcat}.json`** — not a question. The script must fill it, either
  from the scan via `instanceSpecs` or by a question carrying that `specField`, or the item reads
  as incomplete downstream. Authoritative list: `GET /api/contracts/specs/{subcat}`.
- **A new `showIf` on a question** — the script must only ask/submit it when the referenced
  question's answer equals `showIf.value`. This is the one piece of question logic the script owns.
- **A new question `type`** — only `select`/`boolean`/`text` exist today; another type needs a
  renderer branch.

**Answer format the script must send** (in `qualityAnswers`, keyed by question `id`):
- `boolean` → `"true"` / `"false"`
- `select` → the exact option string from `values`
- `text` → free string (optionally one of `suggestions`)

The server maps answers → specs and quality via the contract; the script does **not** compute
specs from questions.

**What does *not* reach the script** (by design — the service knows, the TUI doesn't need to):
- question-level `required` (dropped from the surfaced shape);
- `qualityImpact`, `specValue` (server-side scoring/derivation);
- assembly part metadata `targetSubcategory`, `noLink`, `multipleAllowed`, `label`
  (`assemblyToQualityContract` flattens each part to just its `question`/`specQuestion`); a
  `multipleAllowed` slot therefore still flows as a single question.

## Notes & open items
- **Required specs auto-present:** because the device booted it is functional (the intake
  general contract already drops the "funktionsfähig?" question); the three scan-derived
  required specs fill automatically when you echo `scanPayload`.
- **Duplication on re-intake:** an item is matched by serial/MAC — a device previously
  cataloged **without** a serial won't match and would create a second record. Capture serials
  on manual catalog to avoid this. Re-intake of a matched item merges specs (per-key overwrite)
  and skips the quality step once assessed.
- **Future nested catalogues** (a display made of hinges/LCD/housing) fit the model: relations
  nest arbitrarily and each subcategory can have its own assembly contract. Deep non-serialed
  sub-parts are captured as specs or manual components, not auto-created.
