# CO₂ Recovery Potential

**Status:** Implemented (Phase 2 — label-based scoring)
**Owner:** `backend/lib/co2Calculator.ts`, `contracts/impact/co2.json`

---

## Purpose

Ranks items by how much CO₂ is avoided when a second-hand device is reused instead of a new one being manufactured. The result is a label (`high` / `medium` / `low` / `irrelevant`) plus a numeric score (kg CO₂), displayed in the item detail view and aggregated in the overview stats card.

---

## Methodology

Manufacturing dominates device CO₂ footprints (70–80% of total lifecycle). Reusing a device avoids most of that. The score scales with device category (manufacturing CO₂ baseline) and item quality (higher quality → more remaining life → greater savings potential).

### Formula

```
score = E_new_kg × (quality / 5)
```

| Variable | Meaning |
|---|---|
| `E_new_kg` | Manufacturing CO₂ baseline for this device category (from contract) |
| `quality` | Item quality grade 1–5 (null treated as 0 → score = 0 → `irrelevant`) |

### Label thresholds (from contract `thresholds` field)

| Label | Score range |
|---|---|
| `high` | ≥ 150 kg |
| `medium` | ≥ 75 kg |
| `low` | ≥ 25 kg |
| `irrelevant` | < 25 kg or category not in contract |

Thresholds are configurable in `contracts/impact/co2.json`. No code change required.

---

## Contract: `contracts/impact/co2.json`

```json
{
  "version": 2,
  "thresholds": { "high": 150, "medium": 75, "low": 25 },
  "categories": [
    { "unterkategorie": 201, "label": "Laptop", "e_new_kg": 180 }
  ]
}
```

To add a new device class: add an entry to `categories` with `unterkategorie` (integer code) and `e_new_kg` (manufacturing CO₂ in kg). The backend caches the contract at first call; a server restart picks up changes.

---

## Code Map

| File | Role |
|---|---|
| `contracts/impact/co2.json` | Coefficient data — edit to update thresholds and categories |
| `backend/lib/co2Calculator.ts` | Core calculation: loads contract, applies formula, maps to label |
| `models/co2.ts` | `Co2ImpactResult` type: `{ label, score, eNewKg, source }` |
| `backend/actions/save-item.ts` | Computes and attaches `co2Impact` to the item detail response |
| `backend/actions/overview.ts` | Aggregates `co2LabelCounts` and `co2ScoreSums` per label from all items |
| `backend/db.ts` | `listItemsForCo2()` — lightweight query returning category + quality for all items |
| `frontend/src/components/ItemDetail.tsx` | Reads `co2Impact.label` and `co2Impact.score`, renders "Hohes Potenzial (~220 kg CO₂)" |
| `frontend/src/components/OverviewPanel.tsx` | Fetches overview, passes `co2LabelCounts` and `co2ScoreSums` to StatsCard |
| `frontend/src/components/StatsCard.tsx` | Renders per-label counts with average score, e.g. "Hohes Potenzial: 15 (~195 kg CO₂)" |

---

## Display

**Item detail:** `CO₂ Potenzial: Hohes Potenzial (~220 kg CO₂)` — shown only when label ≠ `irrelevant`. The score is the raw result of the formula (before label mapping), giving operators a concrete reference number.

**Stats card (overview panel):** Per-label counts with the average score across items in that label bucket:
```
CO₂ Potenzial: Hohes Potenzial: 15 (~195 kg CO₂)  Mittleres Potenzial: 8 (~90 kg CO₂)
```
`irrelevant` items are intentionally omitted from the overview display.

---

## Uncertainty & Caveats

- Estimates based on category medians. Per-model accuracy varies ±20–50%.
- Quality grade drives the score — a quality-5 item in a low-E_new category may score lower than a quality-3 item in a high-E_new category.
- Items without a quality grade receive score = 0 and are labelled `irrelevant`.
- Not a certified CO₂ offset or Scope 1/2/3 accounting figure.

---

## Deferred (Phase 3+)

- **DB column `co2_score` on `items`:** pre-compute and store so overview aggregation doesn't require in-memory iteration over all items. Add when item count makes the current approach slow (current: one pass per `/api/overview` request).
- **SKU-level PCF override:** replace category medians with per-model vendor PCF data.
- **Boavizta API integration:** dynamic E_new for unknown server configs.
- **Public storefront display:** surface potential on the Shopware product page.
- **ESG export:** quarterly CO₂ impact reporting.
