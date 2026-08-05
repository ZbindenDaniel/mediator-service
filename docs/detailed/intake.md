# Device Intake Station

Operator-driven cataloging flow for donated devices booted from a minimal Alpine Linux netboot image.

## Architecture overview

Phase 1 (catalog, foreground) and Phase 2 (automated tests, background) are fully independent. Either can run first, in parallel, or alone. They share only the device identifier (serial or MAC address).

**Phase 1** — Operator at the station TUI: scan serial, confirm hardware specs, select/create item reference, answer quality questions. Ends with a printed label.

**Phase 2** — Automated: memtest, SMART, wipe, battery. Results uploaded to WebDAV via the existing external-docs API. No operator interaction needed.

## State machine

The intake station identifies itself by serial or MAC. On each boot it calls `/api/intake/start`. The server routes to the correct step based on DB state — already-completed steps are skipped automatically.

| Step | Condition | Response |
|------|-----------|----------|
| `select_ref` | No `items` row with this serial/MAC | `{ nextStep: 'select_ref', candidates: [...] }` |
| `quality` | Item exists, no quality assessment | `{ nextStep: 'quality', itemUUID, qualityQuestions: [...] }` |
| `phase2` | Item exists, quality assessment done | `{ nextStep: 'phase2', item: { ... } }` |

Step 3 (`phase2`) is always returned on subsequent boots — Phase 2 can upload and call `/complete` again to re-trigger agentic with richer data.

## intakeKey

Format: `SN:{serial}` or `MAC:{mac}` (MAC fallback when serial is unavailable).

No serial + no MAC → 422 error. The key is stable across reboots and station switches.

## API

### `GET /api/intake/categories`

Returns selectable device categories for the TUI dropdown. Only **bootable** devices
are listed (a device must boot the netboot image to reach this step), so monitors and
external screens are excluded. `hauptkategorienA` follows the canonical taxonomy (10/20/…).

```json
{
  "categories": [
    { "hauptkategorienA": 20, "unterkategorienA": 201, "label": "Laptop" },
    ...
  ]
}
```

### `POST /api/intake/start`

State machine router. Body: `IntakeScanPayload` + `serial`/`mac`.

```json
{ "serial": "PF1ABCDE", "mac": null, "vendor": "HP", "model": "EliteBook 840",
  "cpu": "Intel i5-8350U", "ramMb": 8192,
  "disks": [{ "name": "nvme0n1", "sizeGb": 256, "type": "nvme", "serial": "S3Z9NX0M12345", "wwn": "eui.0025385...", "model": "SAMSUNG MZVLB256" }],
  "batteryPercent": 87 }
```

Detected sub-devices are reported in a generic `components[]` array (`disks[]` is a shorthand
for `kind:'disk'`, folded in server-side). Each should carry a `serial` (with `wwn`/`model` as
fallback keys) when it has one: at the **ref** step the server materializes one in-device
component per sub-device **with a usable serial** (see [component lifecycle](component-lifecycle.md));
serialless ones (e.g. PCI cards) fill assembly info via question pre-fill instead. The full image
request contract is in [`intake-image.http`](intake-image.http).

The `select_ref` response echoes the scanned identity as `scan: { vendor, model }` so the
TUI can pre-fill the new-reference fields from what was already scanned.

### `POST /api/intake/{intakeKey}/answer`

Two types dispatched by `type` field:

**`type: 'ref'`** — select or create an item reference.

```json
{
  "type": "ref",
  "artikelNummer": "12345",
  "scanPayload": { ... }
}
```

Or create a new reference:

```json
{
  "type": "ref",
  "newRef": {
    "Hersteller": "HP",
    "Kurzbeschreibung": "EliteBook 840 G5",
    "Hauptkategorien_A": 20,
    "Unterkategorien_A": 201
  },
  "scanPayload": { ... }
}
```

`Kurzbeschreibung` is the model name and is **optional** — when omitted it defaults to
`scanPayload.model`. `Artikelbeschreibung` is composed as `Hersteller + Kurzbeschreibung`.

Response: `{ nextStep: 'quality', itemUUID, qualityQuestions: [...] }`

**`type: 'quality'`** — submit quality answers.

```json
{
  "type": "quality",
  "qualityAnswers": { "cosmetic": "B", "drive_type": "NVMe SSD", ... },
  "instanceSpecs": { "RAM": "8 GB DDR4", "SSD": "256 GB NVMe" }
}
```

Response: `{ nextStep: 'phase2', summary: { itemUUID, artikelNummer, quality, qualityTag, ... } }`

### `POST /api/intake/{intakeKey}/complete`

Triggers the agentic enrichment run. Idempotent: calling it again restarts agentic only if the previous run is not already in a terminal good state.

Response: `{ done: true, itemUUID, agentic: { ... } }`

### Phase 2 file uploads

Phase 2 reuses the existing external-docs write endpoint. The `:itemUUID` segment accepts an `SN:` or `MAC:` prefix — the handler detects it, skips the DB lookup, and resolves the storage path from the identifier directly:

```
POST /api/items/SN:PF1ABCDE/external-docs/intake-scans
X-Filename: memtest.txt
```

Files land at `{mountPath}/{serial}/{filename}`. The item does not need to exist yet. Add an `intake-scans` entry to your `ALT_DOC_DIRS_FILE` JSON config:

```json
{ "name": "intake-scans", "mountPath": "/mnt/intake-scans", "identifierType": "serialNumber", "docType": "Intake-Scan", "writable": true }
```

## Authentication

All `/api/intake/*` routes require `X-Intake-Token: {INTAKE_TOKEN}`. When `INTAKE_TOKEN` is unset, all requests are accepted (development mode).

The `/api/items/*` external-docs endpoint uses its existing auth — no change.

## Quality questions

`qualityQuestions` merges three contracts for the item's subcategory: the **general** quality
contract, the **subcategory** quality contract, and the **assembly (accessory)** contract
(`contracts/assembly/{subcat}.json`) — the latter contributes accessory questions (presence +
spec) so the quality step drives both quality and specs, producing a complete item. The same
contracts are individually fetchable at `GET /api/contracts/{quality|specs|assembly}/…` (open,
no token). Answers come back in `qualityAnswers` (keyed by question `id`); `instanceSpecs` carries
free-form specs using the canonical `contracts/specs/{subcat}.json` keys. Full script-author
reference incl. the contract→script sync surface: [`intake-image-guide.md`](intake-image-guide.md).

When routing to the `quality` step, the server pre-fills `defaultValue` on questions whose `specField` overlaps with reliable scan fields:

| Question ID | Scan field | Mapping |
|-------------|-----------|---------|
| `drive_type` | `disks[0].type` | `nvme` → `NVMe SSD`, `ssd` → `SSD`, `hdd` → `HDD`, `emmc` → `eMMC` |
| `ram_gb` | `ramMb` | rounded to nearest 2/4/8/16/32/64/128 |
| `storage_gb` | `disks[0].sizeGb` | rounded to nearest 128/256/512/1000/2000 |
| `battery_condition` | `batteryPercent` | ≥80 → `Gut (>80%)`, ≥50 → `Mittel (50–80%)`, else `Schwach (<50%)` |

The operator confirms or overrides each pre-filled value in the TUI. Beyond these questionnaire
pre-fills, echoing `scanPayload` in the quality answer back-fills the canonical required specs
(`Prozessor`/`RAM`/`Speicher`/`Speichertyp`) directly.

## Concurrent devices

Multiple devices on the same station switch are fully independent — each has a different serial/MAC, so their intake flows never interfere.

## Crash recovery

Because the intakeKey encodes the device's own serial/MAC (not a session ID), a device can reboot at any point and resume from the correct step simply by calling `/start` again.
