# Todo

## Confirmed Decisions
- **Shopware integration (P0 + P1 done; see `docs/PLANNING_shopware_integration.md`).** Direction decided:
  **direct-to-Shopware**, create-if-missing, absolute stock. Read/search path live; **stock sync live** (#937) —
  Admin-API write client + dispatch client + worker started under `SHOPWARE_SYNC_ENABLED`. P0 (#935–936):
  unified config, API-key **or** client-credentials auth, `SHOPWARE_SALES_CHANNEL_ACCESS_KEY` rename, dead vars
  removed, enqueue-leak fixed, admin connection check + status/queue card.
  **P1 follow-ups:** queue **retention/trim** (succeeded rows accumulate); **sales-channel visibility** on
  created products (today invisible until published via the shop flow); **max-retry ceiling** for transient
  failures; dedup the product normaliser shared by store `client.ts` / admin `adminClient.ts` / agentic
  `tools/shopware.ts`.
  **P2a done (#938):** Langtext/Spezifikationen → Shopware properties (native storefront filters).
  **P2b done (#948):** push **all** Langtext as properties, but a group is `filterable` only when its key is a spec-contract field (`registry.getFilterableSpecKeys()` = union of `contracts/specs/*.json` keys) — stops the filter sidebar flooding. `ensurePropertyGroup` heals existing over-/under-filtered groups. Note (#942's earlier "contracts dropped") applied to *badges*; contracts are now used to curate filterability. Not expressible: per-category filterability of a shared field (Shopware's flag is global per group).
  **Policy+data fixes (#940):** shop-eligibility gate (`Shopartikel=1 AND approved` — ineligible items deactivated/skipped, never published), `Veröffentlicht_Status`→`active`, full product data (name/description/price/active) on create AND update, sales-channel visibility on create.
  **Open follow-ups:** (a) items **without agentic approval never sync** — decide if manual shop items need a path / make approval configurable like `ERP_SYNC_REQUIRE_APPROVAL`; (b) **backfill** pre-existing skeleton products (they self-correct only on next enqueue; visibility is create-only) — a bulk re-sync of shop refs; (c) name/description field mapping is a heuristic.
  **Variants done (#941):** ref → parent product, distinct InstanceSpecs combos → variant children (configurator + child products, per-variant summed stock, `ShopwareVariantId` persisted). Single-product fallback when <2 combos or any spec-less instance.
  **Variant follow-ups:** validate `configuratorSettings`/child-`options` write semantics on a live Shopware (as with P2a m2n); ragged specs (instance missing an axis) fall back to single-product; a lone combo's InstanceSpecs aren't surfaced as parent properties; no per-variant price.
  **#944/#946 (variant re-sync 1062 fixed):** #944 gave `configuratorSettings` entries a deterministic id; #946 completed it — `syncVariants` now searches existing `product-configurator-setting` rows and **reuses their ids** (a fresh id for an option that already has a row INSERTs → 1062), deterministic id only for new options, stale axes deleted. The `mkdir Permission denied` on image upload is a dockware container fs-permission issue (env, not code); storefront axis grouping is a Shopware presentation setting.
  **#942:** quality → variant axis (`Zustand`); admin **Shop-Sync** button + `POST /api/admin/shopware/sync` (enqueues all shop refs, also backfills). Contracts + CO₂ badges **dropped** (all properties come from items; no benefit).
  **Open — reverse/stock-back sync:** orders in Shopware must book out mediator stock. Recommended: `checkout.order.placed` webhook → map ordered variant → decrement a matching instance's `Auf_Lager`; poll fallback. Design in the runbook ("Reverse sync"); not built. Open: which instance to book out when a variant groups several (FIFO?), Shopware-side corrections.
  **#943 (P3 images done):** product images uploaded as binary (`lib/shopware-media.ts` + `adminClient.syncProductImages`), cover = Grafikname. Validate the `media` m2n + `coverId` write on a live shop; stale-image removal deferred.
  **#945 (image previews + itemUUID axis):** (a) media is now created in the **Product Media** default folder (`mediaFolderId` resolved via `/api/search/media-folder`) so Shopware generates thumbnails — fixes blank previews. (b) `itemUUID` is now a **variant axis** → one variant = one instance (no merging); any ref with ≥2 instances is a variant parent. Follow-ups: prune stale itemUUID property options; consider a non-filterable itemUUID group; live-validate thumbnails + the itemUUID configurator switch. The image `mkdir Permission denied` is a dockware host fs-permission issue, not code.
  **#947 (categories done):** product↔category links from the ref's `Hauptkategorien_A/Unterkategorien_A` (+ `_B`) codes → Shopware category names (`db.resolveShopwareCategoryNames` + `adminClient.syncProductCategories`). Per operator decision: **link-only to existing categories (never create)**, both A+B, additive (never removes a link). Follow-ups: stale-link reconciliation behind a flag; an explicit code→category-id mapping override for shops whose category names differ from the mediator labels (today unmatched names are skipped+logged — check the worker logs for `No Shopware category named "…"` to see misses).
  **Documents (decision pending):** (a) Shopware product downloads (customer-facing manuals), (b) media + custom-field link list, or (c) don't upload — external links in a custom field (internal docs). Not built.
  **Next (P4+):** accessory cross-selling → reverse stock-back sync.

- **ERP export approval gate:** Only approved items may be exported/synced to the ERP — exporting unreviewed items is too dangerous. Enforced as a single choke point in `stageItemsExport` for `erp` mode (covers `/api/sync/erp`, `/api/export/items?mode=erp`, `/api/export/data?mode=erp`) plus an early filter in `sync-erp`. Configurable via `ERP_SYNC_REQUIRE_APPROVAL` (default `true`); backup-mode exports are unaffected.
- **Nightly ERP sync scope:** Syncs only `item_refs` where any instance `UpdatedAt > LastSyncedAt` (or never synced). `LastSyncedAt` lives on `item_refs` (Artikel_Nummer level). Relocation-only instance changes will trigger a sync in v1 — accepted trade-off.
- **Item list conditional column:** A single date column slot appears only when sorting by `entryDate`, `lastSynced`, or `agenticLastRun`, showing the relevant date. Other sort keys show no date column.
- **Database:** PostgreSQL via `pg` (node-postgres). `DATABASE_URL` is required — no SQLite fallback. Local dev: Docker Compose Postgres service. Production: existing Postgres server, add a `mediator` database. Data migration from SQLite: `scripts/migrate-sqlite-to-postgres.ts`.
- **Multi-instance agentic safety (Phase 2, implemented):** `claimQueuedAgenticRuns` in `backend/db.ts` uses a CTE with `FOR UPDATE SKIP LOCKED` + immediate UPDATE in one atomic statement. Call site in `backend/agentic/index.ts` updated; redundant QUEUED→RUNNING re-check removed. See agentic changelog entry 858.

- **CO₂ recovery potential:** Label-based scoring (`irrelevant / low / medium / high`) replaces the old ADEME kg estimate. Formula: `score = E_new × (quality / 5)`; thresholds in `contracts/impact/co2.json` (v2). Quality assessment will be refined with longevity questions to sharpen the signal.

- **Batch run conflicts:** when an agentic run is already in progress, new start requests should be ignored (no parallel start via repeated triggers).
- **Qty=0 item visibility:** items with zero quantity should remain accessible only through explicit navigation (e.g., direct/scan/detail path), not broad default lists. A clear distinction between removed and deleted items has yet to be made.
- **Shop export rule:** `shop=true` is part of review outcome and only valid for approved reviews. When accepting 'in den Shop stellen?' during review, both `shopartikel` and `veröffentlicht_status` must be set.
- **Search-query tracking scope:** track/accumulate query count per run to answer: *"How many searches did it take to complete the run?"*
- **Transcript goal:** transcript should be complete, distinguishable by step/source, and collapsible for readability. Persistence should change to JSON first (saved to a new location); UI restructuring follows.
- **Dual-format field names:** `*_json` and `*_html`, e.g. `langtext_json`.

---

## Priority 2 — Intake station (deferred v2 items)

- **Components: manual "add unidentified" UI.** Backend deletion/graduation paths exist and
  intake auto-creates in-device components, but there is no explicit operator entry point in
  Zerlegen to add an unidentified (reference-less) component by hand. See
  [`docs/detailed/component-lifecycle.md`](docs/detailed/component-lifecycle.md).
- **Components: sever `Zerlegt_aus` link on sale/stock-removal.** The provenance link is kept
  after graduation; severing it when the extracted item is sold + stock-removed is deferred.
- **Components: verify intake image can read per-drive serials.** The serial (with `wwn`/`model`
  fallback) is the identity/report key; confirm the netboot image reads it for every drive type
  on the bench (some USB bridges hide it). Contract: [`intake-image.http`](docs/detailed/intake-image.http).
  Note: MAC-keyed uploads work as the serial-less fallback and now surface in the UI/serve too
  (media #915 upload, #916 fallback-chain listing) — a drive with no readable serial and
  machine-level/orphan wipe reports upload under `MAC:<mac>` and appear on the machine item.
- ✅ **External docs: surface MAC-keyed reports on the machine item.** Resolved via the fallback-chain
  model (media #916): `wipe-reports` is now `identifierTypes: ["serialNumber","macAddress"]`; the list,
  item-detail, and serve paths union files across accepted types via the shared `lib/external-docs.ts`.
  **Follow-ups:** (a) `intake-scans` has the same serial-less exposure for machine-level scans
  (memtest/battery) — opt it into the chain (config-only, no code) once confirmed the image keys those
  by MAC for serial-less devices; (b) filename collision across the serial and MAC folder lists both
  rows but serve returns the first type-order match — annotate the file URL with its identifier to fully
  disambiguate if it ever bites; (c) the list section header shows one identifier value even when files
  span both folders.
- **Intake: scan.txt augmentation of agentic extraction.** When `/complete` fires, if `items.SerialNumber` is set, look for Phase 2 test result files in `{intake-scans mountPath}/{serial}/` and prepend a summarized block (≤2000 chars) to the extraction prompt. Requires modifying `backend/agentic/flow/item-flow-extraction.ts`.
- **Intake: operator notification on completion.** Notify the operator (push notification or TUI display) when a device finishes the full pipeline (quality done + agentic run queued).
- **Intake: InstanceSpecs sync.** When a quality answer drives a spec change on a ref-sharing instance, propagate to all instances sharing the same Artikelnummer (pre-existing open question for the quality review flow too). Note: operators can now manually correct/add/delete a single instance's specs via the "Instanz bearbeiten" card (`PATCH /api/items/:id/instance` `InstanceSpecs`, full-replace — item-lifecycle #911); this edit is per-instance only and does not propagate.

---

## Priority 1 — Bugs & Active Work

- **In-device parts show a stale device name as Lagerort.** `catalog-spare-part.ts` (3 INSERTs) copies the parent's `Bezeichnung || Artikelbeschreibung` into `items."Location"`; `LocationTag` and `LOCATION_WITH_BOX_FALLBACK` prefer that string, so renaming the device leaves the old name on its parts (intake's `in-device-components.ts` already writes NULL). Plan: write NULL, derive `ParentItemUUID`/`ParentLabel` via the `Zerlegt_aus` join in the read queries, show "in ‹Gerät›" in `LocationTag`, clean up existing rows in the additive-migration batch. **Related, verify first:** `items."Location"` also caches the destination shelf at move time and `move-box.ts` never updates items, so items in a box that moved shelves likely show the old shelf — same cure (derive from `boxes."LocationId"`), but ERP export, Shopware payload and `itemGrouping` read the column.

0z5. **Intake asks RAM / storage despite the scan — ROOT-CAUSED; backend done, image fix handed off.**
  Root cause (intake #915): the netboot image's `build_scan_payload` (in `common.sh`, separate repo) reads
  disk `sizeGb` from `smartctl` `.user_capacity.bytes` — an **ATA/SATA-only** field, **empty for NVMe** and
  on smartctl open-fail — so `sizeGb:0` on modern NVMe laptops → `storageSize` signal null → `storage_gb`
  asked. The backend resolver and `phase1.sh` are both correct for a well-formed scan (verified). RAM
  (`/proc/meminfo`) already resolved; storage was the visible offender.
  - ✅ **In-repo (shipped):** `resolveIntakeQuestions` returns `detected` + `unresolvedAutoFill`; quality-step
    responses carry `detectedSpecs` (omit-but-inform); both build paths log `[intake] question resolution`
    (asked/detected/unresolvedAutoFill) so a mis-scan is diagnosable. Contract (`intake-image.http` + guide)
    now requires `lsblk`-sourced disk size.
  - ⏳ **Image repo (handed off):** patch `build_scan_payload` to source `sizeGb` from `lsblk -bdno SIZE`
    (bytes → GB); keep smartctl for identity only. This is the change that actually stops the storage prompt.
  - ⏳ **Optional image-side:** render the response's `detectedSpecs` as a read-only banner in `phase1.sh`.
  - ✅ **Operator-typed Artikelbeschreibung honoured (intake #916).** Was dropped due to a field-name
    mismatch (`findOrCreateRef` read `Kurzbeschreibung`, station sends `Artikelbeschreibung`) so the
    garbage scanned model always won; operator text is now authoritative.
  - ✅ **Every question skippable / "don't know" (intake #916).** Empty answers are treated as unanswered
    in the derive functions (no junk `RAM: " GB"`) and dropped from the intake merge. ⏳ **Image-side:** a
    small `phase1.sh` patch to let the operator press Enter to skip a select/boolean/text prompt (backend
    already accepts an omitted/empty answer).
  - **Follow-ups:** broaden `driveTypeLabel` tolerance for exotic `type` strings (`sata`/`""`); a per-run
    scan-quality metric off `unresolvedAutoFill`.

0z6. **Intake enrichment should key on `sku`, not the DMI product name.** `dmidecode -s system-product-name`
  returns generic junk on many HP/Lenovo laptops ("HP Notebook", "20XW"); the scan also captures `sku`
  (system-sku-number), which HP/Dell use as a full commercial identifier. When the agentic model-name
  enrichment runs, prefer `sku` as the lookup key over the product name. Separate from 0z5.

0z9. **Search: surface `relaxed: true` in the UI.** Since ui #958 `/api/search` returns weaker matches
  (below the 50 % token rule) instead of nothing and flags them `relaxed`. The ~8 frontend consumers
  (`Header`, `RefSearchInput`, `ItemMatchSelection`, `useSimilarItems`, `ArtikelNummerLookupStep`, …) ignore
  the flag; a small "keine genauen Treffer — ähnliche Ergebnisse" hint would tell the operator why the list
  looks loose.

0z8. **Intake: verify Phase-2 attachments reach the server.** Operator report (with intake #957): "attachments
  don't land on the server" for an Intel NUC. Not reproduced backend-side — the upload handler emits a
  `[media-audit]` line (start/success/error) for every `POST /api/items/SN:…/external-docs/<dir>`, and the
  device's server log showed none, so the request most likely never arrived (flow stalled at `select_ref`
  with 0 candidates — fixed in #957 — or a station-side upload failure). Next: re-run an intake on that
  device and grep the server log for `[media-audit]` + the serial; if absent, debug `phase2.sh` on the image.

0z7. **Add a CI JSON-lint over `contracts/`.** The invalid-JSON bug in `quality/201.json` (intake #914) was
  invisible because both contract loaders swallow parse errors and return `null`. A cheap `node -e JSON.parse`
  (or `jq empty`) sweep over `contracts/**/*.json` in CI would catch the next one at commit time.

0z4. **AI runs optimization — phased implementation** (design: `docs/PLANNING_ai_runs_optimization.md`).
  - ✅ **Phase 1a (shipped, agentic #915).** (5) Ollama `UND_ERR_HEADERS_TIMEOUT` fixed at the root — global undici dispatcher raises `headersTimeout`/`bodyTimeout` (`ensureModelHttpTimeouts`, env `MODEL_HTTP_HEADERS_TIMEOUT_MS`/`_BODY_TIMEOUT_MS`, default 10 min); retry demoted to genuine-drop fallback. (4B) The three queue→`failed` paths now emit a structured `from→to/reason` log + an `AgenticRunFailed` item event with a `category` tag (`recordQueueTerminalTransition`).
  - ✅ **Phase 1b (shipped, agentic #916, Thread 2A).** Stored search evidence (`LastSearchLinksJson`) now surfaced in the KI tab via `AgenticSearchSources` + a `Suchergebnisse (N)` row in `ItemDetail`. Source **removal** now shipped (agentic #923 — delete a bad link so it stops feeding reuse+grounding); pin/reorder + add-manual-link curation and a true per-run **query count** (needs schema, todo #24) remain follow-ups (#21/#22).
  - ✅ **Phase 3 (shipped, agentic #917, Thread 1/3).** Identity grounding: no new schema — reuses the run's `SearchQuery` anchor + known subcategory label to inject a "stay in the known device class" fragment into extraction + supervisor prompts, and reworded `extract.md` so it no longer licenses changing the device class. Stops the "PC → Pokémon card set" drift. Deferred: post-search relevance gate.
  - ✅ **Phase 4 (shipped, agentic #918, Thread 4).** Run history: `agentic_run_snapshots` (snapshot-before-run, retention keep-4 + always-last-approved), KI-tab "KI-Verlauf" timeline + field-level `computeSnapshotDiff` (Langtext key-by-key), and non-destructive manual restore (`GET/POST …/agentic/snapshots[/:id/restore]`). **Follow-up:** extend the same history to instance/intake fields (`InstanceSpecs`, serial/MAC) — operator confirmed this will be needed.
  - **Then — Phase 2 (state-machine, decision still open):** failure-aware queue (classify infra/transient/permanent + health window + throttle + bounded re-queue). Decide first-cut scope (full breaker vs bounded-requeue-only vs keep-terminal) when starting it.
  - **Open questions** (from the doc) still to brainstorm before their phases: grounding-anchor precedence, relevance-gate outcome, over-cap re-queue semantics, transition-trail storage, rework pre-state memory.

0z3. **Intake netboot image / station TUI emits a duplicated brand in `model`.** The scan reports `vendor="HP"` with the brand also embedded (sometimes doubled) inside `model` (e.g. `model="HP HP ProBook 470 G4"`), and the external station TUI further combines the echoed `vendor`+`model` when pre-filling the new-ref form. The backend deliberately no longer masks this (see 0z2) — fix it at the source: the netboot intake image should emit a clean `model` (brand once, or brand-free with `vendor` separate), and the TUI should stop concatenating `vendor` into the pre-filled `Kurzbeschreibung`. Contract: [`intake-image.http`](docs/detailed/intake-image.http).

0r. **Ersatzteile: "Hinzufügen" popup needs a close-on-backdrop-click escape for accessibility** — the new portal dialog closes on backdrop click already; verify with screen reader that `aria-modal` and focus-trap work correctly.

0u. **Assembly contract: multipleAllowed full UI.** The `multipleAllowed` flag on assembly parts (RAM, storage) is supported in the data model and ZubehoerCard shows a "+ weiteres" button when one is cataloged, but the multi-instance slot list (showing each linked instance separately) is not yet implemented. *Folds into Phase 6 (Einzelteile rows list each in-device instance).*
0v2. **Run `scripts/normalize-category-values.js` against production once (op step).** The read-side casts (agentic #906) now tolerate float-formatted category strings like `"201.0"`, but the legacy TEXT values are still non-canonical in the DB. Run the one-time cleanup on prod (`DATABASE_URL=… node scripts/normalize-category-values.js`) to canonicalize them; idempotent and safe to re-run.
0v3. **Seed category `guidance[]` for remaining subcategories.** The spec-contract `guidance[]` field (agentic #908) injects per-category prompt snippets into extraction + supervisor; only `201.json` (laptops) is seeded so far. Collect the recurring LLM mistakes per subcategory (e.g. HDD/monitor dimensions, server form factors) from operators/review history and add snippets to the other `contracts/specs/*.json`. No `version` bump needed (guidance is advisory). Consider promoting "do not mention X"-style suppression to a hard supervisor gate if prompt guidance proves leaky.
0w. **keyboard_layout specQuestion in keyboard slot.** Architecture supports `specQuestion` wiring for inline answers (e.g., keyboard layout in the keyboard slot), but the frontend ZubehoerCard does not yet render `specQuestion` inline — only the primary `question` is shown.

0m. **Ersatzteile Entnehmen: add "direkt verkaufen" path.** Currently Entnehmen always requires a Behälter-ID (storage location). When a spare part is sold immediately, no storage location is needed — instead the quantity should go to 0. UI change: show "Wird der Artikel eingelagert?" prompt in the Entnehmen flow; "Ja" → existing relocate flow; "Nein" → set Qty=0, no location required.
0n. **Ersatzteile: instance reference re-linking.** When a spare part instance is created via Hinzufügen but linked to the wrong item reference (wrong Artikelnummer), there's no way to re-link the instance to the correct reference without deleting it. Implement a "Referenz ändern" option in the Zerlegen slot (visible post-cataloging, before/after removal). *Folds into Phase 6 ("Artikel verknüpfen/ändern" on the Einzelteile right panel).*

0p. **Known test coverage gaps (from doc/test comparison):**
  - `restart-review-metadata.test.ts` covers 3 of 4 restart truth-table cases from `review-flow.md`; case 3 (`review` provided + `replaceReviewMetadata=true`) is not tested.
  - `item-flow-pricing.test.ts` threshold test uses values below both gates simultaneously — cannot verify the documented `confidence >= 0.6 AND evidenceCount >= 2` thresholds independently from the test alone.
  - Categorizer `__locked` field behavior (`item-flow.md`: "Locked fields are preserved and not overwritten") is asserted nowhere in the test suite; only appears as fixture setup data.
  - `backend/actions/agentic-delete.ts` HTTP handler still has no direct test; the underlying `deleteAgenticRun` service is now covered by `test/agentic-delete-reset.test.ts` (reset clears SearchQuery; not-started decline).
  - No production telemetry yet confirms the pricing stage actually hits the same unrecognized-shape failure mode as the categorizer did — the hardening in #872/0y is defensive; revisit once pricing transcripts are reviewed to see how often it triggers.
  - ✅ Follow-up `__searchQueries` under `skipSearch`: confirmed hard-blocked at `item-flow-extraction.ts:891` (converts to retry); `item-flow.md` corrected (was stale). `skipSearch` now also downgrades to a live search when no stored search exists (see agentic changelog #890).

0j. **Set PRINTER_QUEUE_MARKETING env var for A4 marketing sheets.** Without it, marketing sheet print jobs fall back to `PRINTER_QUEUE`. Operators should configure this to target the A4 printer.

1c. **Investigate remaining tester-reported bugs (need runtime testing):**
   - ✅ "KI lauf kann nicht geloescht werden" — root cause: `deleteAgenticRun` reset the run to `notStarted` but kept its `SearchQuery`, so the idle-fill dispatcher re-promoted it within ~5s. Fixed by clearing `SearchQuery`/`LastSearchLinksJson` on reset (OVERVIEW 876). Also fixed: Abschliessen never reached the backend (numeric-only Artikel_Nummer guard) and now always finalizes as Freigegeben.
   - "ki erfassung indefinite" — agentic capture stuck; stale-run recovery now reliably clears stuck RUNNING runs (fire-and-forget race fixed); auto-retry re-queues after backoff. If still stuck, check model service callback.
   - "bearbeiten fehler, KI-Status nicht angezeigt" — `save-item.ts` silently sets `agentic = null` on fetch error; check if `getAgenticRun` errors after migration
   - "list button broken" — unclear; may self-resolve now that box-detail is fixed
   - "artikel dupliziert nach umlagern" — likely stale frontend state; may self-resolve with box-detail fix (box item list can now reload after move)

2. **Fix agentic runs for references.** Agentic runs are broken for reference items. Runs can be started and run but immediately fall back to not started
   - **Investigation (needs runtime repro):** Traced start (`startAgenticRun` → `hasAgenticReference`), dispatch (`claimQueuedAgenticRuns` — no `items` JOIN, so reference-only rows *are* claimable), status read (`getAgenticStatus` → `getAgenticRun` by `Artikel_Nummer`), and list display (`listItemReferencesWithFilters`, `LEFT JOIN agentic_runs ... COALESCE(i."Artikel_Nummer", r."Artikel_Nummer")`). All handle a **numeric** `Artikel_Nummer` reference correctly on static reading — the "fall back to notStarted" is a display artifact of `COALESCE(ar."Status",'notStarted')` when the run-row JOIN misses. Suspected residual cases: (a) references with a **non-numeric / specially-formatted** `Artikel_Nummer` (e.g. created via `catalog-spare-part`/`remove-from-device`), or (b) already largely resolved by the #876 SearchQuery-reset / numeric-guard fixes and this entry is stale. Next step: reproduce against a real reference item and capture the exact id passed by the frontend + the `agentic_runs."Artikel_Nummer"` actually written.

3. **Ensure waiting agentic runs restart on application restart.** All runs in a waiting state should automatically resume when the app restarts. Waiting runs should wait (max. parallel runs has to be respected)

<!-- Not clarified:
 5. **Refine QR relocation flow.** Relocation still has edge-case issues in scan handoff/navigation. Moving an item to a box should behave consistently from both the box and item perspectives. Multi-scan and scan-until will be added in future iterations. **Goal:** stabilize intent and return-flow boundaries with targeted fixes, strong validation, and meaningful try/catch + logging at transition points. 

6. **Fix multi-scan item relocation bug.** Scanning multiple items during relocation causes state conflicts or navigation problems. **Goal:** ensure reliable scan-based workflows with proper state management and error recovery.
 -->

7. **Transform transcript persistence from HTML to JSON.** Store transcripts in a new location. UI restructuring of the transcript viewer (collapsible, step-separated) follows after persistence is changed. **Goal:** improve debuggability and enable structured transcript rendering.

---

## Priority 2 — Feature Improvements

- **Item list: spec filters per subcategory** (deferred from ui #1002). Once one subcategory is chosen, offer selects for its filterable spec fields (`registry.getFilterableSpecKeys()` / spec contracts) with the values present in the loaded items. Needs its own filter state, persistence and neighbor-navigation support; keep it to "select per field", no ranges.

**Parts catalogue Phase 6 (planned 2026-10-20, [plan §11](docs/PLANNING_PARTS_CATALOGUE.md)):** steps 6a–6f — ✅ 6a stable part IDs `C-<root Art>-<sub>-<####>` (graduation without re-key, #991); ✅ 6b contract fields + validator + shared question selector + slot scoring (#993); ✅ 6c slot-answer PATCH + carry-over on full save (#994); ✅ 6d–6f Einzelteile page, specs at creation, catalogue content (#996) — **open: browser walkthrough with the testers**; `askOnCreate`/`steps`/`refinedBy` + validator + shared question selector, slot scoring change (unassessed slots excluded), answer-merge PATCH + slot carry-over on full save, article specs at creation (warning only), Einzelteile page + Zubehör split (retires Zerlegen card + modal level stack, refurbishment parity first), catalogue content drafts. Team: work steps (F1), `refinedBy` + weights (F2, part of C1).
- **Intake disks → assembly slot.** Intake keys scanned components by device name (`nvme0n1`, `sda`), which matches no assembly slot key, so those parts get the `0` subcategory segment in their ID (`C-104523-0-0001`) and resolve no effective subcategory (no contracts). Map scan kind/bus to a slot (e.g. NVMe → `m2_1`, SATA → `drive_25_1`, refurbishment `storage`) at sync time. (#991)

**Style update (975) — follow-ups:**
- Check the new palette on the screens that looked bad (intake station, warehouse monitors); if wide-gamut screens still look loud, add a `@media (color-gamut: p3)` block lowering chroma further.
- ✅ ~~Field density in item tabs~~ — `DetailRows` (977). Still old layout: ZubehoerCard tables, stock table, `AgenticSnapshotsPanel` diff (`.responsive-row` rules can go once that moves over).
- `LoadingPage` rainbow emoji colours are still saturated hardcoded hex (left as-is: playful loader).
- Inline `style={{}}` colours in `PrinterQueuesCard`, `ZubehoerCard`, `SparepartSlotPopup` etc. follow the theme via alias tokens (`--color-error`, `--border`, …); move them into classes when those files are touched.

**Per-user item marking (step 779) — deferred items:**
- Bulk mark action in `BulkItemActionBar` not yet added.
- Note text not shown as tooltip on the star icon in the list — keep as tab-only for now.

19. ~~**Wire `item × attachments` action panel slot.**~~ Superseded — ActionPanel deleted; inline button in AttachmentsCard already covers the use case.

20. ~~**Wire `item × accessories` action panel slot.**~~ Superseded — ActionPanel deleted; inline RefSearchInput fields cover the use case.

21. **Box images tab empty for shelves.** Shelf boxes (`S-*`) are not `isBoxRelocatable`, so the images tab renders nothing. Revisit when shelf photo support is defined.

8. **Ensure shelf weight and item count are calculated correctly.** Current totals are incomplete or inaccurate. Aggregation should cover both nested boxes and loose items. **Goal:** align aggregation logic across backend/frontend models while reusing existing summary helpers.

9. **Agentic run substatus tracking.** Show substatus within a run (search → categorization → extraction) so the user can see where a run currently is.

10. **Agentic run: don't discard partial data on field failure.** When one field fails, persist the remaining gathered information and the search state rather than ditching everything. **Goal:** reduce re-work on partial failures.

11. **Agentic: assure category then start extraction with review info.** Enforce category confirmation before starting extraction and pass review context into the flow.

13. **Filter and sort boxes/shelves.** Add filter options (boxes only / shelves only, location dropdown) and sorting to the box/shelf list.

15. **Support text search fallback for relocate item/box (label search).** QR-only flows are brittle when labels/scans fail. Reuse existing search endpoints and add a low-overhead fallback without building a parallel relocation system.

16. **Enable item-list filtering by box.** Align with box-detail inventory presentation; consider reusing item-list views in box detail instead of maintaining separate inventory render logic. **Goal:** consolidate around reusable list components and reduce UI surface complexity.

17. **Add neighboring box navigation (prev/next).** Mirror existing item navigation patterns using existing sort order. **Goal:** reduce repeated return-to-list navigation during review flows.

18. **Implement transport boxes (T-).** Planning document at `docs/PLANNING_transport_boxes.md`. Phase 1: DB schema (`transports` + `transport_items` tables), models, CRUD + complete/cancel actions, TransportListPage + TransportDetail. Phase 2: creation entry points in BoxDetail/ShelfDetail/StubDetail/BulkActionBar + "Transport ausstehend" badges; pending transport surfaced on item instance view (§8.6). Phase 3: ERP/shop API + reference search + audit export. Note: `complete-transport` must also auto-resolve active `box_stubs` for the source shelf.

19a. **Implement stub boxes.** Planning document at `docs/PLANNING_STUB_BOXES.md`. Phase 1: `box_stubs` DB table + migration (incl. `PhotoPath` column), create/list/patch API actions, ShelfDetail `HasActiveStubs` badge + stub list section. Phase 2: dedicated Stub Management nav page (grouped by shelf with color distinction, photo thumbnail); stub detail includes "Transport erstellen" button pre-filling `SourceId = stub.ShelfId` (identical to shelf detail flow). Stub auto-resolve is handled by transport completion (item #18), not a separate action.

19b. **Implement inventory feature (passive cycle).** Planning document at `docs/PLANNING_INVENTORY.md`. Phase 1: `LastInventoryDate` on boxes, `MissingAt` on items, `inventory_sessions` table, `INVENTORY_CYCLE_DAYS` config, `inventoryPending` filter on box list. Phase 2: `/api/inventory/start|scan|complete|cancel`, `InventoryCheckView` with checklist + scan zone + Menge count inputs + acoustic feedback. Phase 3: passive trigger hook in `qr-scan` + interstitial prompt. Phase 4: missing items view, `InventoryFound` flow, session export. Active Inventory Day (UC-1) is deferred — not part of current scope.
   - **Note (storage #885):** A lightweight reconciliation *exit route* now exists on the placement scan flow (`PlacementScanView`): finishing a box scan surfaces unscanned recorded items and lets the operator remove their stock or clear their location. This is distinct from the full passive-cycle verification feature above (no sessions/`MissingAt`/passive triggers) but covers the "remove items that no longer exist" need for the scan-into-box workflow.

45. **Spec contracts: targeted enrich button in ItemKiTab.** When an item has missing required spec fields (visible as empty Langtext rows), add a "Gezielt anreichern" button in the KI tab that starts an agentic run pre-seeded with the missing field names as missingSpecFields. Requires fetching the spec contract client-side and computing the gap against the current Langtext.
47. **Spec pipeline: cpu persistence.** Intake `cpu` field is currently used only to pre-fill quality questions. Persisting it (e.g. to `items.InstanceSpecs`) would enable `Prozessor` coalescing from intake in `buildSpecContext`. Deferred from the contract-informed pipeline implementation. (Note: variant-key canonicalization now folds `CPU`→`Prozessor` in extraction/Langtext — agentic changelog #889 — but intake-value coalescing still needs the persisted field.)
48. **Review Step 3: ambiguous fields display.** The backend now computes `ambiguousFields` in `buildSpecContext` and threads them to the pipeline, but the review modal currently shows only the item's Langtext value as `currentValue` with `intakeValue` from `InstanceSpecs`. The conflict detection in the modal is client-side — verify it surfaces correctly once real intake conflict data is available.

49. **Persist skipSearch (and future rework mode) on `agentic_runs`.** The flag currently rides an in-memory `pendingSkipSearch` Set (`backend/agentic/index.ts`), lost on server restart and not restored by stale-resume/idle-fill. Add a `SkipSearch` column written at enqueue and read at dispatch so it survives restart; this column also becomes the backbone for the rework mechanism (#50). Deferred from agentic changelog #890 to keep that change reviewable.

50. **Rework mechanism.**
  - ✅ **Phase 1 — manual targeted rework (shipped).** "KI Überarbeitung" reuses the main pipeline to regenerate only operator-selected fields; `applyReworkPartialUpdate` preserves all other fields deterministically; categorizer/pricing skipped; UI is a field-picker + instruction modal in `ItemKiTab`. See agentic changelog #893.
  - ✅ **Phase 2a — deterministic idle contract-audit sweeper (shipped).** `sweepContractRework` in `dispatchQueuedAgenticRuns` runs only while idle and only when `AUTO_REWORK` is on (default off): stale items (stored `SpecContractVersion < current`) are re-stamped if complete, else a targeted rework is enqueued for the missing required fields (decision in `decideContractAuditAction`, no LLM). Self-limiting via the version stamp. See agentic changelog #894.
  - **Phase 2b — LLM standards auditor (planned, not built).** Add the language/style/wording audit as a one-shot LLM call guided by a runtime-editable `contracts/guidelines/standards.json` (read fresh, no redeploy); add a `LastAuditedAt` cursor for periodic re-checks (oldest-first, stamp every audit), a per-window budget cap, and an anti-thrash cap on consecutive auto-reworks per item.
  - **Deferred behavior:** on a rework **failure**, discard the changes and keep the prior `approved` state (today a failed rework lands in `failed` like any run). Resolved policy: reworked items otherwise follow the normal review/auto_approve path, no special-casing.
  - Row-level click-select + right-click on spec rows (nicer selection than the modal checkboxes) remain a follow-up.

51. **Auto-approve follow-ups.** `AUTO_APPROVE` (default off) + `AUTO_APPROVE_MIN_CONFIDENCE` (default 0.8) added (agentic changelog #892). Follow-ups: per-subcategory confidence threshold instead of one global value; optional auto-reject counterpart; a bulk "promote auto_approved → approved" action (currently uses per-item Abschliessen); and extend the KI-queue state filter to select `auto_approved` (aligns with #12 multiselect agent states).

55. **Instance agentic flow (design in progress — `docs/PLANNING_instance_flow.md`).** A per-`ItemUUID`
  flow that consumes intake evidence + `InstanceSpecs` and reconciles the device against its reference,
  emitting an operator-gated **reconciliation object** (never writes `item_refs`; ref changes only via
  operator-approved `rework`). **Re-validated after the "new pipeline" contract work (plan §17):** the
  `scope`-field idea is superseded — reference contracts were redefined around **capabilities**, so the
  revised plan uses a **separate instance-spec contract**; reconcile compares installed-value ↔
  capability; `INTAKE_TO_SPEC` is orphaned. Builds on shipped snapshots (#918)/search-sources (#916)/
  grounding (#917). Revised phasing: (0) stabilize/normalize the capability-oriented reference spec
  contracts; (1′) instance-spec contract + measured-signal binding; (2) instance-scope run history by
  extending `agentic_run_snapshots`; (3) reconcile step; (4) operator actions; (5) KI-Runs list; (6)
  automation. Open questions in the planning doc §13/§17.

55b. **Doc-debt: the spec-contract restructure shipped undocumented.** The reference spec contracts were
  redefined around model capabilities (`102.json` gained `RAM-Slots`/`RAM-Kapazität`/`RAM-Typ`;
  `201.json` stripped to Prozessor/Display/Anschlüsse) with no changelog Why (commits "new pipeline" /
  "cleanup and minor contract updates"). They are also **inconsistent** across compute subcategories
  (201 lacks storage/RAM-capability fields 102 has). Document the intent + normalize the shape; note
  that `INTAKE_TO_SPEC` (`ram_gb→RAM`/`storage_gb→Speicher`) is now orphaned for subcats whose contract
  dropped those keys (silent no-op in `buildSpecContext`).

42. **Quality search: `includeQuality` API param.** When set, search also matches against `derived_specs` in `quality_assessments` (Postgres JSON operators). Enables searching "16GB" to find matching Laptops.

44. **Quality assessment: link accessories (charger etc.) during assessment.** Feasibility confirmed — `item_relations` table (RelationType='Zubehör') and full CRUD API already exist. Chargers are separate items (cat 804/805). The assessment step could show an "Zubehör hinzufügen?" picker that creates `item_relations` records on save. No new table needed; add an optional `linked_accessories TEXT` JSON column to `quality_assessments` or just rely on `item_relations`. Effort: medium (new UI step + wiring to existing API).

20. **Enhance partial imports functionality.** Large imports currently fail completely on a single item error. Add granular error reporting and selective retry. **Goal:** make bulk import workflows resilient with clear per-item failure reporting.

21. **Make search links available in item UI.** Surface agentic search result links in item detail views and enable manual link management for references. **Goal:** improve agentic result transparency and allow manual curation.
   - ✅ **Surface (agentic #916):** stored `LastSearchLinksJson` shown in the KI tab as `Suchergebnisse (N)` via `AgenticSearchSources`.
   - ✅ **Remove (agentic #923):** operators can delete a bad search-result link so it stops feeding the reuse/grounding pipeline — `POST /api/item-refs/:id/agentic/search-links/delete` + `removeAgenticSearchLink` (targeted prune, does not reset the run). **Still deferred:** pin/reorder and **adding** a manual link (feeds the structured `WebLinks` field, #22); no URL normalization/dedupe on match.

22. **Add WebLinks field to ItemRef structure.** Extend ItemRef with structured WebLinks (Manual, Heise, Dell, etc.). **Goal:** standardize reference link storage with clear categorization and UI management.

23. **Normalize badly formatted search queries.** Enforce one canonical normalization boundary; emit concise telemetry. **Goal:** reduce result degradation and retries from malformed queries.

24. **Track total search queries per run.** Persist or compute a per-run count with minimal schema impact and clear log fields.

25. **Improve event log.** Make event log more useful and easier to navigate.
   - ✅ **Coverage gap fixed:** items/boxes often had zero events because device intake and the CSV importer (the two biggest creation sources) never called `logEvent`, and boxes created via `import-item`'s `runUpsertBox` + stubs logged nothing. Intake now logs Item `Created` + `QualityAssessed`; CSV import logs `Created`/`Updated` per instance; import-time box upsert logs Box `Created`; `create-stub` logs `StubCreated`; `quality-review` logs `QualityAssessed`. Reference-level agentic events (keyed by Artikel_Nummer) now surface on item history via `listEventsForItem(itemId, artikelNummer)`. Also fixed `bulk-move-items` calling async `bulkMoveItems` without `await`. See item-lifecycle changelog #888.
   - **Still unlogged (deferred):** successful prints (only `PrintFailed` logs), ERP sync, stub close, a distinct reference-created event. No history backfill for pre-existing items/boxes.

26. **Inconsistent locationTag display.** Audit and fix locationTag rendering across views so it is displayed consistently. Note: box links in ItemDetail now navigate via the panel shell (Steps 8–9) rather than hard-navigating; other views may still use plain `<Link>` to `/boxes/:id`.

27. **Improve pie chart.** The current chart is visually poor; redesign for clarity.

28. **Add price and image fields to itemList.** Show whether an item has a price and an image set; shrink the 'Artikel' column to create space.

29. **Declutter "Vorrat" area.** High information density increases user error and navigation time. **Goal:** simplify high-traffic screens incrementally by reusing existing components.

30. **Compact/collapsible flow cleanup for key views.** Target high-impact screens with reversible UI refinements to reduce visual weight on frequent operations.

30b. **Simple mode: make the kept set configurable / server-persisted.** A first cut shipped (ui #897): an "einfacher Modus" toggle in the user-settings dialog strips the UI to a curated essential set via a body CSS class stored in `localStorage`. It uses an opt-out model — new nav items/tabs are hidden by default unless marked `simple-keep`/`keepInSimple`. Follow-ups: let operators choose which surfaces to keep, and/or persist the preference server-side per username so it follows them across devices. Also optional: skip hidden tabs in `DetailTabBar` arrow-key navigation.

31. **Unified shelf view: combined box + loose items via one reusable list model (including Behälter context).** Fragmented shelf views force context switching and duplicate logic. **Goal:** unify rendering through shared list components with explicit aggregation rules.

32. **Add filtered activities view.** Unfiltered activity streams are hard to use for investigation. **Goal:** add focused filters using existing activity data paths.

34. **Round-trip shelf `Color` through box backup export/import.** Shelf colours (storage #960) live in `boxes."Color"` but aren't in `export-items.ts` `boxColumns` / `importer.ts` box field handling / `UPSERT_BOX_SQL`, so a restore into a fresh DB loses them (same-DB re-import keeps them via `COALESCE`).

35. **Revive commented-out item list tests.** `test/item-list-quality.test.ts` and `test/item-list-columns.test.ts` were disabled because jest couldn't resolve the bare `models` alias; the mapper now exists (ui #961), so they only need updating to the current `ItemListComputationOptions` shape.

---

## Priority 3 — Infrastructure & Platform

53. **New use case: spare-part cataloging (separate, multi-tenant deployment).**
   Feature-disposition plan + gap list in
   [`docs/PLANNING_NEW_USE_CASE.md`](docs/PLANNING_NEW_USE_CASE.md). Use case =
   thorough spare-part cataloging (catalogue every reusable part); disassembly/
   component lifecycle is the centerpiece to strengthen. **Laptop parts catalogue (#973 plan, #980 Phases 1–3 ✅):**
   [`docs/PLANNING_PARTS_CATALOGUE.md`](docs/PLANNING_PARTS_CATALOGUE.md) — percentage quality range,
   `multi` type, validator, effective subcategory built; **one quality system for all deployments (#982)**;
   catalogue taxonomy + part tree + specs drafted in `config/catalogue/`; **nested assessment built (#984)** —
   browser walkthrough pending. **Before the live refurbishment system: calibrate grade bands (plan C1).**
   Two greenfield
   workstreams gate it:
   - **G‑T1 Multi-tenancy (largest lift).** No `tenant`/`mandant`/`org_id`
     concept exists anywhere. **Phased plan ready:**
     [`docs/PLANNING_TENANCY.md`](docs/PLANNING_TENANCY.md) — identity-first:
     (1) Authentik forward-auth → `ctx.{user,tenant,role}` **✅ code done** (#960:
     `identity.ts` resolver + `ctx` injection + `resolveActor` on lifecycle
     handlers; proxy config templated, needs on-host verification before dropping
     Basic Auth); (2) **✅ 2a schema done** (#964: `tenants` table + nullable
     `TenantId` on logistics tables + `ContributedByTenant` on `item_refs` +
     `listTenants`/`getTenant`/`upsertTenant`; neutral) — **✅ 2b done** (#965:
     `GET /api/whoami` for observable identity; `resolveTenant(ctx)` stamps
     `TenantId` on create in `create-box`/`add-item`/`import-item`; upserts
     `COALESCE`-preserve an already-set owner, never reassign; startup seeds the
     `tenants` registry from the config map via `configuredTenants()`; still
     neutral until forward-auth is live); (3) class-aware scoping in
     `db.ts` **← next enforcement step** (needs the default-tenant decision +
     host-verified forward-auth; best verified against Postgres;
     before that, verify forward-auth locally then on the host per
     `docs/detailed/identity-provider.md` Part A/B incl. the spoof test).
     **Phase 1b ✅ built (#968, opt-in overrides; verified locally 2026-10-13, host pending).
     Phase 1 audit + Phase 4 admin role gating ✅ (#969, browser check pending).
     Deployment feature flags ✅ (#970, browser check pending).
     Org admin page ✅ (#971, browser check pending).
     Phase 3a writes ✅ (#976). Phase 3b reads ✅ (#979). Phase 3c item-detail
     actions hidden for foreign items ✅ (#981/#983). Two-org matrix ✅ (#1011,
     `tenancy-two-org-matrix.test.ts` — read+write layers across A/B/admin/no-login/
     no-org). DL2 global stock total ✅ resolved without code (subsumed by §2a
     shared-reads: reads aren't tenant-filtered, so grouped quantities already sum
     across orgs; matrix pins the "no instance dropped" invariant). Bulk bar blocks
     cross-org mass writes ✅ (#1012). Next (defined FE polish):** KI-tab action gating +
     create buttons hidden for no-org users (backend already 403s both; deferred, touches
     several components); per-org export (`/api/export/data` is unrestricted-only for now);
     **host verification of the opt-in forward-auth proxy** (local ✅ 2026-10-13; on-host
     pending) before Basic Auth is dropped, per `docs/detailed/identity-provider.md`
     Part A/B incl. the spoof test. **Phase 4 role model resolved (2026-10-27, `PLANNING_TENANCY.md` §7):**
     three cumulative tiers operator (`normal`) < tenant-admin (`super`) < super-admin
     (`platform-admin`). Shelf creation gated to tenant-admin+ ✅ (#1013,
     `canManageShelves`). No-work confirms: within-org deletion ungated (operators remove
     own instances), onboarding manual, grey zone stays shared. Reference curation ✅ (#1014, §7 M2 resolved):
     operators edit own-org refs, tenant-admins edit/delete any; `POST /api/references/<nr>/delete`
     with 409 in-use guard. Admin-panel split ✅ (#1015, §7 M1):
     `requireSuperAdminAuth` gates the deployment-wide endpoints (config, contracts, taxonomy, orgs,
     nightly-erp, shopware, printer queues/settings); `requireAdminAuth` admits `super` for the
     operational ones; `GET /api/admin/access` drives the page tier split. **Phase 4 essentially
     done** (role model + shelf gate #1013, reference curation #1014, admin split #1015); `super`
     user-management + self-registration ruled out for now (manual onboarding). **FE follow-ups:**
     delete-reference button placement; hide the shelf-create control for operators. Shop cleanup on
     ref-delete deferred. **Operator action pending:** host-verify the forward-auth proxy before
     dropping Basic Auth. Open: intake station
     rows get `defaultTenant` (per-station tenant?); SPA has no graceful
     session-expiry handling; (4) tenant/user
     admin + self-registration. Auth mechanism decided
     (forward-auth + Authentik broker). **Proposed
     (plan §12.3) — two-tier visibility** on
     the reference↔instance seam: `item_refs` = shared catalogue (no `TenantId`,
     read by all, writes guarded by `ContributedByTenant`); `items`/`boxes`/
     shelves/instance-quality/logistics-events = **`TenantId`, hard-isolated**
     (reads+writes filtered by `ctx.tenant`). Tenants+groups (normal/super/
     platform-admin) from Authentik; resolved once at the chokepoint; class-aware
     scoping in `db.ts`; additive nullable migration on logistics tables only.
     Super users create their tenant's shelves; nobody sees another warehouse.
     Catalogue view = shared ref + **global aggregate quantity** + own-tenant
     instances only (locations private). DL1/2/3 **resolved:** keep global-unique
     minted IDs (`BoxID`/shelf) + `TenantId` as a visibility column (no composite
     key); real follow-on = **per-tenant shelf locations** (`shelfLocations` is a
     global hardcoded list today, folds into §6 config externalization). Self-
     registration via org token = Authentik enrollment only, no data-model impact.
     Own phased plan.
   - **G‑FF1 Feature-flag / capability system.** No unified toggle exists (ad-hoc
     `*_ENABLED` env vars + client-side "simple mode" CSS). **Proposed (plan
     §12.2):** one capability manifest → backend hard-gate at the dispatch
     chokepoint (`server.ts:971`, `feature?` tag on `Action`) + frontend soft-hide
     via a served `GET /api/app-config` and a `useFeature` hook reusing the
     `simpleMode` CSS-class pattern. Coarse (1 flag/subsystem); prerequisite for
     opting out AI / printing / shopware / intake / stubs / kivitendo.
   - **Opt out:** AI flow, printing, intake API, shopware, stubs (remove-by-config);
     kivitendo, transport boxes, inventory (out). **Strengthen:** stock handling,
     traceability/event log, media (videos/text/wiki links), search. **Decide:**
     D1 scanning/QR (recommend keep), D2 CO₂ scoring (recommend drop).
   Category/config gaps found:
   - **G‑C1** Taxonomy lives in 4 hand‑synced copies (`models/item-categories.ts`,
     `frontend/src/data/itemCategories.ts` re‑export, `docs/data_struct.md` LLM
     reference, `INTAKE_CATEGORIES`) — no generator enforces consistency.
     **Phased plan ready:** [`docs/PLANNING_TAXONOMY_EXTERNALIZATION.md`](docs/PLANNING_TAXONOMY_EXTERNALIZATION.md)
     — **runtime, DB-backed data object** (loaded at startup, served via
     `GET /api/taxonomy`, seeded into DB from a shipped default, editable via admin
     CRUD). Build-time codegen rejected: we ship one image, so it would force one
     image per taxonomy. Backend stays synchronous via a startup cache
     (`getItemCategories()`); frontend moves to a boot-fetch provider.
     **Phase 1 ✅** (#937): backend loader+cache+validation, `GET /api/taxonomy`,
     categorizer/intake/lookup consumers rerouted, seed shipped to dist; fixed
     All-in-One→302 (printer) bug via a new `109 All-in-One`. **Phase 2 ✅** (#938):
     `TaxonomyProvider` fetches `/api/taxonomy` at boot; all FE consumers use
     `useTaxonomy()`; static `frontend/src/data/itemCategories.ts` deleted — FE no
     longer imports the taxonomy at build time. **Phase 3 ✅** (#957): DB tables
     `taxonomy_categories`/`taxonomy_subcategories` + `initTaxonomy()` (seed-on-init
     from the file, then DB is authoritative; sync seed-file fallback; never
     throws); `reloadTaxonomyFromDb()` for edits. **Phase 4 ✅** (#958): `/admin/taxonomy`
     editor + `/api/admin/taxonomy` CRUD (live via `reloadTaxonomyFromDb`; codes
     immutable) + file-based **contract overlay** (`CONTRACTS_OVERLAY_DIR`,
     `admin-contracts` PUT/DELETE, download→edit→re-upload UI). **Taxonomy
     externalization workstream complete** (G‑C1 closed). Follow-ups: in-use count
     display, in-browser contract editor, reparenting, a dedicated 109 quality
     contract.
   - **G‑C2 / G‑K2** Taxonomy and contract files are a flat global namespace — no
     scoping, so two use cases cannot coexist on one instance without new design.
   - **G‑F1 / G‑F2** No use‑case/domain/tenant dimension exists in config at all;
     "change the config for a use case" is greenfield.
   - **G‑K3** ✅ resolved on main (the `disassembly/`→`assembly/` doc drift was
     fixed by the intake-image/contract-docs sync work).
   - Domain hardcodes to revisit for a new use case: `models/shelf-locations.ts`
     (revamp sites), ERP booking group `453` (`backend/config.ts:366`),
     `ERP_IMPORT_FORM_*`, `contracts/impact/co2.json`.

33c. **Wire Authentik forward-auth enforcement (follow-up to stack add, OVERVIEW 898).** Authentik now runs in the `docker-compose.yml` stack but nothing consumes it yet. Next: (1) proxy forward-auth — nginx `auth_request` against the Authentik outpost in `config/nginx/mediator.conf` (dev), Traefik `forwardAuth` middleware label in `docker-compose.prod.yaml` (prod), plus adding the Authentik services to the prod compose; drop nginx Basic Auth once it works. (2) Backend: a helper generalizing `backend/utils/admin-auth.ts` that resolves `{username, groups, role}` from `X-authentik-username`/`X-authentik-groups` into `ActionContext`; replace the `/api/admin/*` check with a `mediator-admin` group check (keep `ADMIN_SECRET` as break-glass fallback). Design the role check as a **config-driven group→capability map**, not a hardcoded binary, so extra roles (`intake`, `erp`, `readonly`, …) are a config line + an Authentik group. (3) Populate the free-text `Actor`/`Username` fields from the authenticated user. (4) In Authentik itself: create the Proxy Provider, the `mediator-admin` group (everyone-else authenticated = user), and the embedded outpost. Note the deploy workflow only rolls `mediator`, so bringing the Authentik services up on the host needs a manual `docker compose up -d` or a workflow change.

34. **Add WebDAV folder for temporary media, transcripts, and service-related data.** Support the new transcript persistence location and other temporary media storage needs.
34b. **Media health: periodic background check.** `/api/media/health` is currently on-demand (polled when admin page loads). A recurring server-side probe (e.g. every 5 min) that logs a warning when reachability drops would surface WebDAV failures without requiring an operator to open the admin page.

35. **Create boxes from scans.** When a box is deleted but is later physically scanned, it should be recreated.

36. **Automatic printer server handling after restart.** Manual restart recovery causes avoidable downtime. **Goal:** add startup/reconnect checks with actionable logging.

37. **Declutter QR/relocation logging.** Logs are cluttered with low-value entries. Demote noisy events to `debug` level or remove them; keep only operationally relevant fields. No compliance requirements mandate retaining these.

38. **Standardize relocation logs with explicit `from → to` semantics.** Ambiguous move logs hinder audits and incident reconstruction. **Goal:** unify event payload fields with minimal schema changes.

39. **Periodic backup automation.** Missing regular backups raises data-loss risk. **Goal:** implement a lightweight scheduled backup flow with success/failure reporting.

---

## Open Questions

### Still Open

- **Public item list without login (parked 2026-10-21):** customers browsing what's available. Unauthenticated requests are currently *unrestricted* (`ownership.ts` `isUnrestricted`), so a login exception on existing routes would expose box/shelf and actors. If picked up: dedicated `/api/public/*` with a column allowlist, proxy route that blanks the identity headers (like `/api/intake/`), opt-in flag, public media route, server-side paging. Open: which deployments, which items, which fields (price, org), ordering by mailto vs stored requests.

- **Startup path check (#989):** misconfigured `.env` paths surface one by one as stack traces (seed ENOENT is fatal, inbox EACCES isn't). A single startup summary of configured paths that are missing/unwritable would make container deploys easier to debug.
- **Production host gets an expired 2023 cert for `gitea.revamp-it.ch` (#988):** the public server's cert is valid, so the host resolves/routes to another endpoint (split DNS, `/etc/hosts`, NAT loopback). Check with the commands in `docs/detailed/deployment.md` §4 and fix DNS or the internal cert. Also: the CI workflows (`docker-publish.yaml`, `deploy.yaml`) and the `docker-compose.prod.yaml` default image still target the internal Gitea / ghcr, not `gitea.revamp-it.ch/revamp-it`.
- **Empty fields hidden by default (#977):** `DetailRows` folds empty fields behind a toggle. During cataloguing, seeing what's missing may matter more; should the toggle state be remembered, or default to "show" on some screens?
- **Tab-action order (#975):** should the primary action (e.g. Bearbeiten) always come first in `.tab-actions`? Currently Etikett leads in the instance tab. Up for discussion.
- **Admin cards don't validate API responses (#974 finding):** e.g. `SystemStatusCard` renders `/api/media/health` without checking `res.ok`/shape; an unexpected body (`imageProbe` missing) throws during render and, without an error boundary, blanks the whole page. Add response checks + an error boundary around admin cards.
- **Refurbishment grade bands set, testers to fine-tune (#1004):** `contracts/quality/general.json` now 5 ≥ 95 %, 4 ≥ 85 %, 3 ≥ 60 %, 2 ≥ 40 %; grade-2 knock-out caps moved 0.39 → 0.59. Over all 1,728 non-knock-out laptop answer combinations, 84 % keep their old grade and none drops; the rest rise one band. Testers calibrate further (bands or weights), then `npm run quality:recompute` on deploy. The catalogue overlay (`config/catalogue/`) still has the old bands. **Also check:** keyboard `Top` scores 0.75 like `Gut` (`contracts/quality/201.json`), so no laptop reaches 100 % — intended, or a migration artefact from `qualityImpact`?
- **Switch the test stack to the catalogue config (#985):** `docker compose -f docker-compose.yml -f docker-compose.catalogue.yml up -d --build`, then `npm run taxonomy:apply -- config/catalogue/taxonomy.seed.json` and restart the mediator (see `config/catalogue/README.md`).
- **Walk the nested assessment through in a browser (#984):** on a disposable DB with the `config/catalogue/` overlay — Laptop → Displayassembly → Webcam, save/discard/reload mid-tree. Only component-tested so far.
- **Low-score nudge after a quality review keys on the pessimistic own grade (#984):** with many unanswered questions it shows "Qualität 1/5 — Einzelteile katalogisieren?" for items that are merely unassessed; base it on the derived item grade (or drop it in the catalogue deployment).
- **Item lists don't show the % range yet (#982/#983):** the instance tab does (#983); lists/badges still show only the grade. Show the range small next to it and sort by the lower bound (plan Q9).
- **Item views prefer article quality over instance quality (#973):** `COALESCE(r."Quality", i."Quality")` in `db.ts` item select. Matters again since #982 derives instance grades — an article-level grade hides them. Investigate why the article wins before flipping.
- **Feature-flag gaps (#970):** image upload in create/edit forms isn't covered by `item-images`; box notes stay editable in the box edit form with `box-notes` off; old `SHOPWARE_SYNC_ENABLED`/`ERP_SYNC_ENABLED` not folded into the manifest. Fine for the POC; decide if the catalogue deployment needs them.
- **Platform-admin model:** `PLANNING_NEW_USE_CASE.md` §12.3 says platform admins are the `super` users of a designated admin tenant; the implementation (`identity.ts`) uses a separate `platformAdminGroup` (`mediator-admin`). Settle when defining `super` powers.

- **Revive flag-based review metrics (deferred).** The review wizard makes one explicit approve/reject decision and, on reject, feeds a concrete before→after correction diff + notes into the next run (chosen over deriving flags — a diff is richer and unambiguous). Consequence: `bad_format` / `wrong_physical_dimensions` / `information_present` are sent at non-blocking defaults, so `AgenticReviewMetricsRows` (`% Schlecht formatiert / Falsche Dimensionen / Info unvollständig`) now reads all-positive. If those dashboards are still wanted, derive the flags **purely for metrics** (e.g. text edited ⇒ bad_format, dimension edited ⇒ wrong_physical_dimensions, required spec blanked ⇒ information_present=false), decoupled from the re-run path. Not needed for extraction quality.
- For the **laptop parts catalogue** (plan §10, updated #983): calibrate grade bands (C1, later); "Fest verbaut" counted or excluded; Displayassembly sold whole?; rework the drafted weights, taxonomy and part specs in `config/catalogue/`.
- For **spare parts `drive_type`**, should this question move to the disassembly contract storage slot (needs `qualityQuestion[]` array support on parts) or stay in quality/201.json as a follow-up spec question? Currently stays in quality/201.json (TBD).
- For **spare parts bidirectional suggestions**, when a device's quality check says "PS missing", should the system surface matching PS units in inventory for the operator? Deferred to phase 2 — needs structured spec matching.
- For **shelf totals**, should weight/item count include nested boxes only, loose items only, or both?
> Actually, the weight of a shelf is not interesting. 
- For **optional basic-form fields**, should contract changes be backend-first or can the frontend collect them before backend persistence is ready?
- For **text-search relocation fallback**, should label search be exact-first, fuzzy-first, or reuse current global search behavior as-is?
- For **search-query normalization**, where should canonical normalization live — frontend, backend, or both with backend as final authority?
- For **periodic backups**, what recovery targets (RPO/RTO) are required?
- For **PWA**, is offline capability required now or is installability enough for the first phase?
- For **embeddings**, which primary use case should the spike optimize for — search relevance, deduplication, or review assistance?
- For **the price formula**, where should it apply first — UI preview, export pipeline, ERP sync, or all?
- For **loading page emojis**, which emojis / what style?

### Answered

- **QR relocation failure cases:** moving an item to a box should work the same from the perspective of a box and an item. Multi-scan and scan-until will be added in future iterations.
- **Dual-format field names:** `*_json` and `*_html`, e.g. `langtext_json`.
- **Transcript persistence:** change persistence first (save as JSON to a new location); UI restructuring follows.
- **Relocation/QR logging:** it is about usability, not compliance. Noisy logs can be demoted to `debug` level or removed.
