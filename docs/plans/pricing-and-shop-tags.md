# Instance pricing + Mietware shop tag

Status: **Design, not started** (todo 59). Decided with the operator on 2026-11-05.

## 1. Why

- **Price is per reference, quality is per instance.** `item_refs.Verkaufspreis` is the only price. A
  "Neuwertig" and an "Upcycling" unit of the same laptop sell for the same amount. Shopware already
  publishes one variant per instance with `Zustand` as an axis (`db.buildVariantGroups`), but the
  children inherit the parent's price.
- **Shop tags exist in Shopware, but the mediator never sets any.** The shop displays product tags. The
  first one we need is "rental item" (Mietware). More rules will follow, so the sync should be
  generic and not built just for Mietware.

## 2. Decisions (2026-11-05)

| # | Decision | Rejected alternative |
|---|---|---|
| D1 | **Base price on the reference + a global percentage per quality grade + optional override per instance.** | Percentage only (no escape hatch for special units such as retro); manual price per instance (doesn't scale) |
| D2 | The formula lives in **`contracts/quality/general.json`** (`pricing`), next to `grading`. A per-category formula can be added later in the subcategory quality contract. | Env variable / hardcoded table (operators can't change it; no validator) |
| D3 | The **instance price is computed when it's read, not stored.** A pure function in `models/pricing.ts` serves backend + frontend (same idea as `models/quality-score.ts`). | A persisted column (goes stale on every formula/base/grade change and needs a recompute job) |
| D4 | **Rental = a flag on the reference (`Mietware`), sent to the shop as a tag.** Every item can still be bought. We don't build rental prices or a rental flow now. | A taxonomy category "Miete" (an item can be for sale *and* for rent; it would use up the secondary category slot); a rental module |
| D5 | **No tracking of rented-out units.** If needed, use a shelf "ausser Haus". | Rental state per instance |
| D6 | **Tags are derived from data, never typed in.** The mediator only adds or removes the tags *it manages*. Tags created by hand in the shop admin survive. | Free-text tags in the mediator (duplicates/typos); replacing the shop's whole tag list (destroys manual tags) |
| D7 | Retro / dynamically priced items: **out of scope**. They are covered by the instance override (D1). | — |

## 3. Pricing model

### 3.1 Data

- `item_refs."Verkaufspreis"` **stays** and now means **base price = the price of a like-new unit
  (grade 5)**. Not renamed: ERP import/export (`sellprice`), Shopware, the review wizard, bulk
  Shopstatus and the list filter all read it. The change of meaning is documented in the UI
  ("Basispreis (neuwertig)").
- New `items."PreisOverride" REAL NULL`: a fixed price for this unit. `NULL` = use the formula. Additive
  migration (`ALTER TABLE items ADD COLUMN IF NOT EXISTS`).

### 3.2 Formula (`contracts/quality/general.json`)

**Linear in the grade, floor 20 %** (decided 2026-11-05, Q1/Q2): factor = grade / 5, so grades
1–5 → 20 / 40 / 60 / 80 / 100 % of the base price. Grade 1 (Ersatzteil) lands exactly on the floor; an
unknown grade gets the floor. Base CHF 500 → 100 / 200 / 300 / 400 / 500.

```json
"pricing": {
  "model": "linear-grade",
  "minFactor": 0.2,
  "rounding": { "step": 5, "mode": "nearest" }
}
```

The rounding step is still a placeholder (→ Q1b). The grade is used, not the quality score, because the score
is a range that moves with every assessment; the grade is the stable, already-calibrated band (#1004).

```ts
// models/pricing.ts — pure, shared by backend + frontend
resolveInstancePrice({ basePrice, grade, override, config }) →
  { price: number | null, source: 'override' | 'formula' | 'none', factor: number | null }
```

- `override` wins when it is a number > 0. `0`/empty = **no override** (Q3): overrides are the exception,
  never a way to give things away.
- `basePrice` null or ≤ 0 → `none` (same as `isUsablePrice`; the shop catches items without a price).
- factor = `max(minFactor, grade / 5)`; grade null/unknown → `minFactor` (Q2).
- Round to `step`.
- Later (deferred): a subcategory quality contract may carry its own `pricing` that replaces the global one.
  The resolver takes the merged contract the same way scoring does.

### 3.3 Consumers

| Consumer | Today | New |
|---|---|---|
| Instance tab (ItemDetail) | — | Base price · grade · factor → computed price; override field (edit + "reset") |
| Reference tab / form | "Verkaufspreis" | Label "Basispreis (neuwertig)", value unchanged |
| Shopware single-instance path | Product price = reference price | Product price = instance price |
| Shopware variants | Children inherit the parent's price | **Each child gets its own `price`** (instance price); parent keeps the base price. Verify the storefront "ab CHF …" display live |
| Labels / marketing sheet (`print-unified.ts:272`) | Reference price | Instance price for instance labels |
| Stats inventory value (`db.sumInventoryPriceValue`) | `Auf_Lager × ref price` in SQL | Sum of instance prices (compute in TS or mirror the factor table in SQL) |
| Item list price filter/sort | Reference price | Instance rows: instance price; grouped rows: base price (Q4) |
| ERP export (`sellprice`) | Reference price | **Unchanged = base price** (Kivitendo interaction stays as is, Q5) |
| Review wizard "Preis" / bulk Shopstatus | Sets the reference price | Unchanged; the label says "Basispreis" |
| Agentic pricing stage | Tries to find "a price" | Unchanged for now; when it's reworked, its target becomes the base price (like-new refurb). Separate topic (todo 0p pricing-stage notes) |

### 3.4 Triggers for the shop sync

Today only stock/location writes and `persistItem` enqueue a sync. A **grade change** (quality
review / `recomputeQualityScore*`), an **override change** and a **base-price change** must each
enqueue an `item-upsert` for the reference, or the shop price goes stale. A change to the formula in
`general.json` → an admin re-sync (`/api/admin/shopware` re-sync of all shop refs already exists).

## 4. Mietware flag + shop tags

### 4.1 Data + UI

- New `item_refs."Mietware" BOOLEAN NOT NULL DEFAULT FALSE` (additive migration, `ItemRef.Mietware`).
- Reference form: checkbox "Mietware". Bulk bar Shopstatus form: optional "Mietware ja/nein" (same
  pattern as `verkaufspreis` there). Item list: filter + small badge (nice to have).
- **Exported to the ERP and read back on import** (Q6): new column next to `shoparticle` in
  `export-items.ts` + importer alias (Kivitendo cvar name to confirm). Not touched by the agentic flow.

### 4.2 Tag derivation (extensible)

```ts
// models/shop-tags.ts
SHOP_TAG_RULES = [
  { tag: 'Mietware', applies: (ref) => ref.Mietware === true },
  // future: quality, CO₂, Ersatzteil, …
]
MANAGED_SHOP_TAGS = SHOP_TAG_RULES.map(r => r.tag)
deriveShopTags(ref, instances) → string[]
```

The tag display names stay in one place. Renaming one = changing the rule (the old name drops out of
`MANAGED_SHOP_TAGS`, so it has to be removed in the shop by hand. Acceptable, it's rare).

### 4.3 Shopware sync

- The snapshot (`getShopwareSyncSnapshot`) gets `tags: string[]` and `managedTags: string[]`.
- `adminClient.syncProductTags(productId, desired, managed)`, the same pattern as properties:
  `ensureTag(name)` (`/api/search/tag` by name, create if missing, cached) → read the product's current
  tags → PATCH to add missing ones, 404-tolerant `DELETE /api/product/{id}/tags/{tagId}` for
  **managed** tags that should no longer be there. Unmanaged tags are never touched (D6).
- Tags go on the **parent** product. Verify live that variant children inherit them in the storefront
  (Shopware product tag inheritance); if not, write them to the children too.
- Runs after properties, like categories. A failure uses the same retry classification and never
  blocks stock.
- Toggling `Mietware` enqueues an `item-upsert` (the reference save path, see §3.4).

## 5. Steps

1. **Pricing core:** `models/pricing.ts` + `general.json` `pricing` + validator (`contracts:check`:
   factors 0–1, grades 1–5, rounding step > 0) + unit tests.
2. **Override:** migration `items.PreisOverride`, `Item` model, save path (instance edit), event log.
3. **UI:** instance tab price block (computed / override), "Basispreis (neuwertig)" labels.
4. **Shopware price:** single-instance path uses the instance price; `syncVariants` writes the child
   `price`. Sync triggers from §3.4. Live check with the shop.
5. **Labels + stats + list filter** switch to the instance price.
6. **Mietware:** migration, model, ref form + bulk bar, enqueue on change.
7. **Shop tags:** `models/shop-tags.ts`, snapshot fields, `syncProductTags`, tests with the
   mocked admin client. Live check: tag appears on the product in the storefront and a manual tag survives.
8. Docs: `docs/detailed/shopware.md` (tags + variant prices), `docs/detailed/items.md` (price
   semantics), user help. Delete this plan.

Steps 1–5 (pricing) and 6–7 (Mietware/tags) are independent and can ship separately.

## 6. Open questions

Answered 2026-11-05: **Q1** linear in the grade, floor 20 % · **Q2** unknown grade → 20 % ·
**Q3** override 0 = no override · **Q4** grouped rows show the base price · **Q5** Kivitendo unchanged
(base price) · **Q6** Mietware goes to the ERP too.

Still open:
- **Q1b** Rounding: steps of CHF 5, or prices ending in .90?
- **Q6b** Kivitendo cvar name for Mietware.
- **Q7** Tag display name: exactly "Mietware", or what the shop theme expects? Not verifiable from the
  dev environment (shop host not reachable) — check in the Shopware admin / theme before step 7.

## 7. Deferred

- Pricing formula per category (subcategory quality contract), D2.
- Rental prices, rental orders, tracking rented-out units (D4/D5).
- Retro / dynamic pricing (D7).
- Reworking the agentic pricing stage toward the base price.
- Further tag rules (quality, CO₂, …): the mechanism is ready, the rules come case by case.
