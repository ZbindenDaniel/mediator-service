# CO₂ Impact Calculation

**Status:** Implemented (Phase 1)  
**Owner:** backend/lib/co2Calculator.ts, contracts/impact/co2.json

---

## Purpose

Estimates the CO₂ savings per item when a second-hand device is sold instead of a new one being manufactured. Displayed in item detail (instance tab) and aggregated in the overview stats card.

---

## Methodology

Based on ADEME 2022 lifecycle assessment data. Manufacturing dominates device CO₂ footprints (70–80% of total lifecycle), so reuse avoids most of the footprint.

### Formula

```
CO2_saved = max(0, E_new × R_reuse × L_factor − O_refurb)
```

| Variable | Value | Source |
|---|---|---|
| E_new | per-category, from contract (kg CO₂e) | ADEME 2022 / vendor PCF medians |
| R_reuse | 0.85 (global constant in contract) | ADEME 2022 conservative default |
| L_factor | min(1, max(0, TotalLife − age) / TypicalLife_new) | computed from Datum_erfasst |
| O_refurb | 5 / 10 / 20 kg (light / medium / heavy) | from contract; Quality → intensity mapping |

**Age:** years since `Datum_erfasst`. Default = 4 years when absent.  
**Quality → intensity:** 5–4 → light (5 kg), 3 or null → medium (10 kg), 1–2 → heavy (20 kg).

---

## Contract: `contracts/impact/co2.json`

Add or update category rows in this file. The backend caches it at first call; restart picks up changes.

```json
{
  "version": 1,
  "r_reuse": 0.85,
  "o_refurb_kg": { "light": 5, "medium": 10, "heavy": 20 },
  "quality_to_refurb_intensity": { "5": "light", "4": "light", "3": "medium", "2": "medium", "1": "heavy" },
  "default_age_yr": 4,
  "categories": [
    { "unterkategorie": 201, "label": "Laptop", "e_new_kg": 180, "typical_life_new_yr": 5, "total_achievable_life_yr": 8 }
  ]
}
```

To add a new device class: add one entry to `categories`. No code change required.

---

## Code Map

| File | Role |
|---|---|
| `contracts/impact/co2.json` | Coefficient data — edit to update values |
| `backend/lib/co2Calculator.ts` | Core calculation logic, contract caching |
| `models/co2.ts` | Shared `Co2CalculationResult` type |
| `models/item-detail.ts` | `co2Einsparung` field on `ItemDetailResponse` |
| `backend/actions/save-item.ts` | Computes and attaches co2Einsparung to item detail response |
| `backend/actions/overview.ts` | Aggregates totalCo2SavedKg from all items |
| `backend/db.ts` | `listItemsForCo2` prepared statement |
| `frontend/src/components/ItemDetail.tsx` | Reads co2Einsparung, renders CO₂ Einsparung row |
| `frontend/src/components/StatsCard.tsx` | Renders totalCo2SavedKg in stats list |
| `frontend/src/components/DashboardPanel.tsx` | Fetches overview, renders StatsCard |

---

## Display

**Item detail (instance tab):** `CO₂ Einsparung: ~N kg CO₂e` — shown only when > 0 and category is supported.

**Stats card (right panel, no entity selected):** `CO₂ gespart gesamt: ~N kg` — rounded to nearest 5 kg, shown only when > 0.

---

## Uncertainty & Caveats

- Estimates based on category medians. Per-model accuracy varies ±20–50%.
- Age is inferred from intake date (`Datum_erfasst`), not manufacture date.
- Refurb intensity is inferred from Quality grade, not actual repair work performed.
- Not a certified CO₂ offset or Scope 1/2/3 accounting figure.

---

## Deferred (Phase 2+)

- **DB column `co2_einsparung_kg` on `items`:** pre-compute and store so overview aggregation doesn't require in-memory iteration over all items. Add when item count makes the current approach slow.
- **SKU-level PCF override:** replace category medians with per-model vendor PCF data (Dell, HP, Cisco APIs).
- **Boavizta API integration:** dynamic E_new for unknown server configs.
- **Public storefront display:** surface savings on the Shopware product page.
- **Manufacture year field:** improve age accuracy beyond intake date.
- **ESG export:** quarterly CO₂ impact reporting.
