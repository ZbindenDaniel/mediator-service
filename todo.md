# Todo

## Confirmed Decisions
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
- **Components: contract signal for parent→Ersatzteil.** `remove-from-device` honors
  `markParentAsSpare` but nothing yet supplies it from a contract/Auftrag — decide whether it is
  a parent field or an operator toggle at Zerlegung and wire it. The API never auto-marks without
  the flag.
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

0za. ✅ **Admin "Backup" was not a restorable snapshot + emitted env-dependent HTML (erp-sync #931).**
  The Backup button routed to `/api/export/items?mode=backup`, which emitted only items+boxes (no agentic
  runs, no events) and resolved Langtext via `LANGTEXT_EXPORT_FORMAT` — so setting that env to `html` (for
  the ERP boundary) made *backups* emit HTML cells that break on re-import. Fixed: Backup now routes to
  `/api/export/data?format=zip&entities=items,boxes,agentic,events&mode=backup` (all four CSVs the importer
  ingests); backup Langtext is **always** JSON (env override confined to ERP); backup is uncapped (was
  truncating agentic/events at 500). Also fixed three latent `export-data` bugs (boxes/agentic/events queries
  used unquoted CamelCase identifiers → threw against the real schema) and added `LastSearchLinksJson` to the
  agentic export so search evidence survives restore.
  **Follow-ups (deferred):** (a) no JSON restore importer — restore stays CSV/ZIP-based (operator's call that a
  backup "should be CSV"); (b) `manual_import`≡`backup` and `automatic_import`≡`erp` internally — the 4-button
  UI could be collapsed/relabeled to the 2 real regimes; (c) `/api/export/data` is unauthenticated — gate under
  the Authentik/role model (33c) if backups need access control.

0z9. ✅ **Admin "Datenexport" downloaded nothing + Abbrechen was a silent no-op (erp-sync #927 / agentic #919).**
  (a) `ExportCard` never sent the `actor` query param the `/api/export/items` endpoint requires, so every
  download 400'd and the `if(!res.ok) throw`→`logError` catch swallowed it (no download, no message). Now
  resolves the operator via `ensureUser()`, appends `&actor=…`, and shows an inline error on failure.
  (b) `persistAgenticRunCancellation` kept the `!/^\d+$/` numeric-only Artikel_Nummer guard (already removed
  from close in #876) — it silently rejected non-numeric refs client-side, so "Abbrechen" did nothing on
  spare-part/component refs. Guard dropped (kept `I-` instance guard). The **delete** path was investigated
  and found already correct in-tree (wired, routed, `deleteAgenticRun` unit-tested, resets stick via #876's
  `SearchQuery`-clear) — the residual silent-no-op was the cancel guard, now fixed.
0z8. ✅ **Queued agentic runs promoted to running then cancelled immediately (should wait for a slot).**
  Root cause: `499d8a4` ("Multi-instance agentic safety") removed the atomic running-count gate that the
  queued→running promotion used to run *inside its own transaction* (it left an over-scheduled run `queued`
  to wait). Cap enforcement then relied only on the dispatcher's non-atomic `availableSlots = MAX − runningCount`
  read, and the dispatch `setInterval` (`server.ts`) has no reentrancy guard — so a tick outlasting the 5 s
  interval overlaps the next, both read the same low count, both `claimQueuedAgenticRuns`, and together over-fill
  the running slots; the over-cap sweep then flipped the excess to terminal `failed` (`over-cap-cancelled`). Fixed
  in three layers: (1) reentrancy guard on the dispatch loop; (2) `claimQueuedAgenticRuns(limit, maxRunning?)` clamps
  its `LIMIT` to the free slots inside the same atomic statement; (3) the over-cap net now **requeues** the freshest
  excess to `queued` (keeping the oldest/in-progress running) instead of failing it, so a run that can't run yet waits.
  See agentic changelog #919. **Deferred:** no Postgres advisory lock for a fully serializable multi-instance claim
  (deployment is single-instance; the requeue-not-fail net covers any residual race).

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

0z1. ✅ **Agentic search-token burn + auto-retry of failed/cancelled runs.** (a) The keep-busy dispatcher used a plain `SELECT` (`fetchIdleFillAgenticRuns`) that re-selected the same `notStarted`+`SearchQuery` runs on every 5s tick, re-billing identical Tavily searches; replaced with an atomic `claimIdleFillAgenticRuns` (`FOR UPDATE SKIP LOCKED`) so each run is claimed/dispatched exactly once (changelog #908). (b) Keep-busy now also retries settled `failed`/`cancelled` runs (cooldown-gated), and search reuse moved into the invoker as one decision — reuse stored `LastSearchLinksJson` when present, search live only when none exist (or a reviewer flagged missing specs). Search results are persisted the moment they're retrieved (`persistAgenticSearchLinks`) so a later failure still leaves them for a search-free retry. An item hits the search provider at most once until reset (changelog #909). **Deferred:** `retryCooldownMinutes` (60) not yet config-exposed; no hard cap on total auto-retries of a permanently-broken item; auto-retrying user-`cancelled` runs may want a flag. **Superseded by #913** (see 0z2): the auto-dispatcher no longer retries `failed`/`cancelled` runs at all (so operator stops are durable and there is no unbounded retry), failures are terminal, and the deferred cooldown/ceiling concerns no longer apply.

0z2. ✅ **Agentic auto-dispatcher hardening (incident: ~1000 queries in minutes + un-stoppable runs).** Demoted keep-busy to feed **only** `notStarted` → `queued` (`claimNotStartedAgenticRuns`), capped at N running + N waiting (`MAX_WAITING_RUNS = MAX_CONCURRENT_RUNNING_RUNS`); it no longer resurrects `failed`/`cancelled` runs (operator stops now hold) and no longer resets `RetryCount`. Failed runs (and stale-run recovery) are now **terminal** — no auto-requeue. Added admin kill switch `agentic_auto_dispatch_enabled` (`/api/admin/agentic-dispatch` + Admin page card). In-process resilience added so terminal-failure doesn't over-fail on transient blips: Tavily retry + shorter timeout, per-plan tolerance in `collectSearchContexts` (partial results survive + persist), Ollama `keepAlive` + transient-retry (undici header timeout). See changelog #913. **Deferred:** kill switch scopes to the auto-feeder only (no global dispatch emergency-stop); `MAX_WAITING_RUNS` hardwired to the running cap; Ollama undici `headersTimeout` mitigated via keepAlive+retry rather than a custom dispatcher (✅ now resolved in #915 — a global undici dispatcher raises the timeout); failed runs need manual re-trigger (intentional).

0z2. ✅ **Intake reference matching failed on identical names + "HP HP HP" brand triplication.** `/api/intake/start`'s `findRefCandidates` ran a bespoke `Kurzbeschreibung`-only substring query, but imported refs keep the model in `Artikelbeschreibung` (importer maps `notes → Kurzbeschreibung`), so every ERP-imported ref missed — the operator was pushed to create a duplicate. Compounded by an unconditional `[Hersteller, model].join(' ')` that prepended the brand onto a model that already contained it. Fixed: intake now **reuses the same reference matcher as manual creation** — the token-based fuzzy search behind `/api/search?scope=refs` was extracted to `searchItemReferences()` (in `backend/actions/search.ts`) and `findRefCandidates` calls it; the new-ref name (and the `intake-complete` agentic hand-off) no longer prepend `Hersteller`. No token-dedup workaround was added — the duplicated brand in `model` is a source bug (see 0z3). See intake changelog #913. **Deferred:** no backfill of existing duplicate refs.

0z3. **Intake netboot image / station TUI emits a duplicated brand in `model`.** The scan reports `vendor="HP"` with the brand also embedded (sometimes doubled) inside `model` (e.g. `model="HP HP ProBook 470 G4"`), and the external station TUI further combines the echoed `vendor`+`model` when pre-filling the new-ref form. The backend deliberately no longer masks this (see 0z2) — fix it at the source: the netboot intake image should emit a clean `model` (brand once, or brand-free with `vendor` separate), and the TUI should stop concatenating `vendor` into the pre-filled `Kurzbeschreibung`. Contract: [`intake-image.http`](docs/detailed/intake-image.http).

0z1. ✅ **Agentic search-token burn + auto-retry of failed/cancelled runs.** (a) The keep-busy dispatcher used a plain `SELECT` (`fetchIdleFillAgenticRuns`) that re-selected the same `notStarted`+`SearchQuery` runs on every 5s tick, re-billing identical Tavily searches; replaced with an atomic `claimIdleFillAgenticRuns` (`FOR UPDATE SKIP LOCKED`) so each run is claimed/dispatched exactly once (changelog #908). (b) Keep-busy now also retries settled `failed`/`cancelled` runs (cooldown-gated), and search reuse moved into the invoker as one decision — reuse stored `LastSearchLinksJson` when present, search live only when none exist (or a reviewer flagged missing specs). Search results are persisted the moment they're retrieved (`persistAgenticSearchLinks`) so a later failure still leaves them for a search-free retry. An item hits the search provider at most once until reset (changelog #909). **Deferred:** `retryCooldownMinutes` (60) not yet config-exposed; no hard cap on total auto-retries of a permanently-broken item; auto-retrying user-`cancelled` runs may want a flag.

0z0. ✅ **Hardware barcode scanners submitted the focused form on scan.** Keyboard-wedge scanners type the barcode then send a trailing Enter, which triggered native form submission across ~15 screens. Fixed with a global capture-phase `keydown` guard in `App.tsx` backed by a pure keystroke-timing detector (`frontend/src/utils/scannerDetection.ts`): a machine-fast burst ending in Enter is detected and only that Enter is cancelled, so the value fills but nothing submits; human Enter-to-submit is unchanged. See scanning changelog #882.

0y0. ✅ **Production initDb crash-loop: `column "Artikel_Nummer" does not exist`.** The #877 change added `Scope`/`Artikel_Nummer` to `item_attachments` (in the `CREATE TABLE` body + a second-batch `ALTER`), but also placed `idx_item_attachments_artikel ON item_attachments("Artikel_Nummer")` in the **first** schema batch. On existing DBs the table predates the column, `CREATE TABLE IF NOT EXISTS` is a no-op, and the first-batch index aborts the whole batch → `initDb()` rejects → `process.exit(1)` → crash-loop; the never-reached second batch also left `Confidence` unadded (secondary error). Fixed by removing the premature first-batch index — the identical index is already created in the second batch right after the ALTER (`backend/db.ts`, see docs-infra changelog #881).
0y1. ✅ **Leaked ERP sync credentials removed and rotated.** The kivitendo `csvimport` login/password (and controller/WebDAV URLs) were hardcoded in `backend/scripts/erp-sync.sh`; they are now sourced from env (`ERP_IMPORT_USERNAME`/`PASSWORD`/`URL`, `ERP_WEBDAV_SHOPBILDER_URL`) and the old password has been rotated on the ERP side. The pre-rotation password remains in git history but is now dead. See erp-sync changelog #880.
0y2. ✅ **Container "mediator is unhealthy" on existing databases.** The `events.Meta`→jsonb migration in `initDb()` cast every legacy `Meta` value to jsonb unconditionally on each boot; one non-JSON/empty legacy row threw `invalid input syntax for type json`, rejecting the schema batch → `process.exit(1)` → healthcheck never passed. Fresh DBs (CI/first run) passed because the table was empty. Fixed: guarded, one-time migration that sanitizes non-JSON legacy `Meta` to NULL before the cast (`backend/db.ts`, see docs-infra changelog #878).

0x. ✅ **Product-level attachments now shared across all instances.** `item_attachments` gained `Scope`/`Artikel_Nummer` columns; the "Artikel (Produktebene)" upload sends `X-Attachment-Scope: product`, is stored under `products/<artikelnummer>/`, and every instance of the product lists and can delete it (delete-for-all). Previously the choice only wrote a cosmetic `artikel:` label. The binding modal now also appears when a product option exists (renewed purpose for 0g). **Deferred:** no backfill of pre-existing `artikel:`-labeled rows — they stay instance-bound until re-uploaded. See media changelog.

0t. ✅ **Agentic delete silent failure + "← Liste" button on desktop fixed** (see OVERVIEW 848).

0s. ✅ **Lagerort link, duplicate fetch, price/image columns fixed** (see OVERVIEW 847).

0q. ✅ **7 UI/UX bugs fixed** (quality save on kandidat path, accessories popup portal, description carry-forward, help pages in Docker, stats enrichment label, QA toggle CSS, quality GET await).

0r. **Ersatzteile: "Hinzufügen" popup needs a close-on-backdrop-click escape for accessibility** — the new portal dialog closes on backdrop click already; verify with screen reader that `aria-modal` and focus-trap work correctly.

0u. **Assembly contract: multipleAllowed full UI.** The `multipleAllowed` flag on assembly parts (RAM, storage) is supported in the data model and ZubehoerCard shows a "+ weiteres" button when one is cataloged, but the multi-instance slot list (showing each linked instance separately) is not yet implemented.
0v2. **Run `scripts/normalize-category-values.js` against production once (op step).** The read-side casts (agentic #906) now tolerate float-formatted category strings like `"201.0"`, but the legacy TEXT values are still non-canonical in the DB. Run the one-time cleanup on prod (`DATABASE_URL=… node scripts/normalize-category-values.js`) to canonicalize them; idempotent and safe to re-run.
0v. **Specs/201.json: remove duplicate component fields.** `RAM`, `Speicher`, and `Akku` remain in `contracts/specs/201.json` even though assembly answers now drive these. Safe for now but should be cleaned up to avoid confusion in agentic extraction.
0v3. **Seed category `guidance[]` for remaining subcategories.** The spec-contract `guidance[]` field (agentic #908) injects per-category prompt snippets into extraction + supervisor; only `201.json` (laptops) is seeded so far. Collect the recurring LLM mistakes per subcategory (e.g. HDD/monitor dimensions, server form factors) from operators/review history and add snippets to the other `contracts/specs/*.json`. No `version` bump needed (guidance is advisory). Consider promoting "do not mention X"-style suppression to a hard supervisor gate if prompt guidance proves leaky.
0w. **keyboard_layout specQuestion in keyboard slot.** Architecture supports `specQuestion` wiring for inline answers (e.g., keyboard layout in the keyboard slot), but the frontend ZubehoerCard does not yet render `specQuestion` inline — only the primary `question` is shown.

0k. ✅ **Test suite re-hardened: 637 tests passing.** Added coverage for `cancellation.ts`, `utils/json.ts`, `flow/prompts.ts`, `lib/itemGrouping.ts`, `result-handler.ts`, `forward-agentic-trigger.ts`, `models/quality.ts`. Fixed inverted `deriveAiPriorityFromAssessment` (high quality was mapped to low priority). 9 skipped; 0 failing.
0l. ✅ **Test rewrites complete (14 files).** All csv-ingest-* and related test files rewritten to Postgres mock pattern and removed from `testPathIgnorePatterns`. `export-items.test.ts` remains excluded (requires live Postgres). The `describe.skip` suites (kivitendo-schema, produkt-schema, shared-artikelnummer, langtext-contract, list-items-for-export-order, item-category-roundtrip, item-persistence-reference-behavior, save-item-quality) need a Postgres test DB in CI to be meaningful — tracked as a future item. Many frontend component tests still deferred (React + complex deps).
0m. **Ersatzteile Entnehmen: add "direkt verkaufen" path.** Currently Entnehmen always requires a Behälter-ID (storage location). When a spare part is sold immediately, no storage location is needed — instead the quantity should go to 0. UI change: show "Wird der Artikel eingelagert?" prompt in the Entnehmen flow; "Ja" → existing relocate flow; "Nein" → set Qty=0, no location required.
0n. **Ersatzteile: instance reference re-linking.** When a spare part instance is created via Hinzufügen but linked to the wrong item reference (wrong Artikelnummer), there's no way to re-link the instance to the correct reference without deleting it. Implement a "Referenz ändern" option in the Zerlegen slot (visible post-cataloging, before/after removal).
0-1. ✅ **Confirmed: empty-completion failures ARE context-window overflow (root-caused via extraction, agentic #922).** The same failure mode surfaced across the pipeline — `EXTRACTION_FAILED` with `lastValidationIssues: null` + `itemContentPreview: ''` + repeated `json match missing`. Two causes: (a) `invoker.ts`'s `ChatOllama` set **no `num_ctx`**, so Ollama's default 2048-token window silently left-truncated the ~6-7k-token prompt → empty completion; (b) extraction was fed the **raw, unbounded** search blob (16k+ chars) while the categorizer got the sanitized aggregate. Fixed: `MODEL_NUM_CTX` (default 8192) + optional `MODEL_FORMAT_JSON` on the Ollama client; deterministic `condenseSearchText` (spec-line-preserving, 12k-char budget) on the extraction context; and traceability (`json match missing` → `warn` with `rawLength`/`hadThinkBlock`/snippet, terminal reason `EMPTY_OR_NO_JSON` not null). **Follow-up:** verify the categorizer path benefits too (it already uses the sanitized aggregate, but confirm 8192 `num_ctx` clears its residual empty-completion cases); consider the deferred LLM summarize stage only if condensation telemetry shows lost signal.

1i. ✅ **Extraction discarded fully-good responses when a later search-context pass drifted off-schema.** Production log: extraction succeeded on pass 1, then failed schema validation on pass 2 across all 3 retry attempts, with output keys degrading German-synonym → mixed-case → fully-English datasheet labels rather than converging — burning the whole run despite the data being present under wrong key names. Added `attemptSchemaCorrection()` that reuses the existing JSON-correction agent (no new agent) to salvage a wrong-shaped-but-complete response inline without consuming an extraction attempt; `json-correction.md`'s rule was reframed from "do not rename fields" to "conform to the canonical schema", which permits remapping onto canonical keys. Also replaced the raw zod-issue JSON dump in retry messages with a plain-language "Missing required field(s): X, Y — use these EXACT key names" hint. See changelog #875.
0z. ✅ **Prompt audit found spec-contract field descriptions were computed and discarded.** `contracts/specs/<subcategory>.json` fields carry a `description` per key, loaded by `buildSpecContext()`, but only the bare key name reached the extraction prompt's "missing_spec" guidance (e.g. model saw `RAM` with no hint of expected format). Fixed: `SpecContext.missingFieldDescriptions` threaded through to `deriveReviewAdjustedTargetSchemaFormat`, which now renders `RAM (Memory in GB)`. Audited every other prompt file for the same output-shape ambiguity that caused 0y below — only `categorizer.md` had it. See changelog #873.

0y. ✅ **Categorizer silently returned null categories on a valid-JSON-wrong-shape model response.** A production run had the model return `{ "assigned_categories": { "primary": 1603, "secondary": 1602 } }` instead of the four flat category fields; the permissive passthrough zod schema accepted it, the stage resolved an empty patch, and the run completed with all categories `null` with no warning anywhere. Fixed in `item-flow-categorizer.ts`: added a canonical-shape check that throws `CATEGORIZER_UNRECOGNIZED_SHAPE` instead of silently succeeding, plus a targeted remap for the observed `assigned_categories.primary/secondary` shape. Applied the same shape-recognition hardening to `item-flow-pricing.ts` (suspected of the identical silent-null failure mode for "the pricing stage never returns anything"); an unrecognized-shape pricing response now gets one repair-pass retry before falling back to `null`, and is logged distinctly from genuine no-evidence responses. New tests: `item-flow-categorizer.test.ts` (new file), `item-flow-pricing.test.ts` (2 new cases).

0p. **Known test coverage gaps (from doc/test comparison):**
  - `restart-review-metadata.test.ts` covers 3 of 4 restart truth-table cases from `review-flow.md`; case 3 (`review` provided + `replaceReviewMetadata=true`) is not tested.
  - `item-flow-pricing.test.ts` threshold test uses values below both gates simultaneously — cannot verify the documented `confidence >= 0.6 AND evidenceCount >= 2` thresholds independently from the test alone.
  - Categorizer `__locked` field behavior (`item-flow.md`: "Locked fields are preserved and not overwritten") is asserted nowhere in the test suite; only appears as fixture setup data.
  - `backend/actions/agentic-delete.ts` HTTP handler still has no direct test; the underlying `deleteAgenticRun` service is now covered by `test/agentic-delete-reset.test.ts` (reset clears SearchQuery; not-started decline).
  - No production telemetry yet confirms the pricing stage actually hits the same unrecognized-shape failure mode as the categorizer did — the hardening in #872/0y is defensive; revisit once pricing transcripts are reviewed to see how often it triggers.
  - ✅ Follow-up `__searchQueries` under `skipSearch`: confirmed hard-blocked at `item-flow-extraction.ts:891` (converts to retry); `item-flow.md` corrected (was stale). `skipSearch` now also downgrades to a live search when no stored search exists (see agentic changelog #890).

0f. ✅ **Quality contracts missing in production build.** `scripts/build.js` now copies `contracts/` → `dist/contracts/` so the backend registry can find general and subcategory quality contracts at runtime.
0g. ✅ **Attachments binding modal shown without purpose.** Modal now only appears when at least one writable external dir (ALT_DOC_DIRS) is available; without external dirs, files upload directly with no modal.
0h. ✅ **Review flow only showed Ja/Abbrechen.** Extended dialog system with `confirmThreeWay`; `askFlag` now offers Ja/Nein/Abbrechen so reviewers can flag individual steps as wrong without aborting the review.
0i. ✅ **Mobile QR scan navigation missing.** Added `QrScanButton` (mobile-only) to Header nav for direct label-scan → item/box navigation on mobile.
0e. ✅ **Fix mobile navigation to lists and Einscannen visibility.** `mobileShowDetail` state in PanelContext drives `app-shell--mobile-detail` CSS class; slide transition replaces display-toggle; back button added; full-screen bypass for scan/placement routes.

0c. ✅ **Tab icons confirmed.** All icons (`GoInfo`, `GoPencil`, `GoFileMedia`, `GoPaperclip`, `GoCpu`) are imported and used in `DetailTabBar.tsx`; `GoTools` was never used — `GoCpu` is the actual icon for that slot. No code change needed.
0j. **Set PRINTER_QUEUE_MARKETING env var for A4 marketing sheets.** Without it, marketing sheet print jobs fall back to `PRINTER_QUEUE`. Operators should configure this to target the A4 printer.

0d. ✅ **Move filter-clear button into ItemListPage list header (top-right).** Done — filter-reset button added to both ItemListPage and BoxListPage; removed from Header.


0. **Eliminate duplicate `/api/items` fetch on item selection.** When switching items via the list, ItemDetail's neighbor-resolution `useEffect` (`[itemId, neighborContext]`) fetches `/api/items` independently from the list fetch in `ItemListPage`. Fix: `handleItemSelect` in `ItemListPage` should encode `prev=<prevId>&next=<nextId>` as URL params when calling `setEntity` so ItemDetail reads them from `searchParams` and skips its own fetch (the `prev`/`next` params are already supported by ItemDetail's `neighborContext` memoization).

0b. ✅ **Filter state resets intermittently when switching items.** Fixed — filter-init useEffect now deps on `[boxParam, qParam]` instead of full `[searchParams]`, so PanelContext entity/tab URL writes no longer retrigger it.

1. ✅ **Fix eventLog display on item and box detail.** Empty state added; BoxID filter 500 fixed (::text cast in listRecentActivitiesByBoxId).
1e. ✅ **Stub deletion** fixed: id parsing bug in close-stub.ts; StubListPage now uses dialogService.confirm and checks res.ok.
1f. ✅ **Marks visibility** — marks now visible to all users; allMarkedUUIDs loaded globally; filter uses all marks.
1g. ✅ **Shelf BoxCount** — box list query adds BoxCount via child JOIN; BoxList shows Behälter count for shelves.
1h. ✅ **Created vs Updated events** — import-item checks existence before persist; save-item uses existingReference to decide; both add structured Meta.

1c. **Investigate remaining tester-reported bugs (need runtime testing):**
   - ✅ "KI lauf kann nicht geloescht werden" — root cause: `deleteAgenticRun` reset the run to `notStarted` but kept its `SearchQuery`, so the idle-fill dispatcher re-promoted it within ~5s. Fixed by clearing `SearchQuery`/`LastSearchLinksJson` on reset (OVERVIEW 876). Also fixed: Abschliessen never reached the backend (numeric-only Artikel_Nummer guard) and now always finalizes as Freigegeben.
   - "ki erfassung indefinite" — agentic capture stuck; stale-run recovery now reliably clears stuck RUNNING runs (fire-and-forget race fixed); auto-retry re-queues after backoff. If still stuck, check model service callback.
   - "bearbeiten fehler, KI-Status nicht angezeigt" — `save-item.ts` silently sets `agentic = null` on fetch error; check if `getAgenticRun` errors after migration
   - "list button broken" — unclear; may self-resolve now that box-detail is fixed
   - "artikel dupliziert nach umlagern" — likely stale frontend state; may self-resolve with box-detail fix (box item list can now reload after move)

1d. ✅ **Zerlegen: Empty slots blocked Hinzufügen even though a part can always be added.** If the quality assessment said a part was absent (e.g. "RAM: nicht vorhanden"), the slot entered `Empty` state and the Hinzufügen button was hidden. This is wrong — a missing part can be installed later (e.g. RAM added to restore a device). Fixed in `ZubehoerCard.tsx`: button guard changed from `state === 'potential'` to `state === 'potential' || state === 'empty'`. User guide updated to match.

1b. ✅ **Restore bulk-action controls.** `BulkItemActionBar` restored inside `MultiItemDetailPanel` in Layout; reads `selectedIds` from PanelContext and `selectedItems/onClearSelection/onActionComplete` from `BulkSelectionContext`.

2. **Fix agentic runs for references.** Agentic runs are broken for reference items. Runs can be started and run but immediately fall back to not started
   - **Investigation (needs runtime repro):** Traced start (`startAgenticRun` → `hasAgenticReference`), dispatch (`claimQueuedAgenticRuns` — no `items` JOIN, so reference-only rows *are* claimable), status read (`getAgenticStatus` → `getAgenticRun` by `Artikel_Nummer`), and list display (`listItemReferencesWithFilters`, `LEFT JOIN agentic_runs ... COALESCE(i."Artikel_Nummer", r."Artikel_Nummer")`). All handle a **numeric** `Artikel_Nummer` reference correctly on static reading — the "fall back to notStarted" is a display artifact of `COALESCE(ar."Status",'notStarted')` when the run-row JOIN misses. Suspected residual cases: (a) references with a **non-numeric / specially-formatted** `Artikel_Nummer` (e.g. created via `catalog-spare-part`/`remove-from-device`), or (b) already largely resolved by the #876 SearchQuery-reset / numeric-guard fixes and this entry is stale. Next step: reproduce against a real reference item and capture the exact id passed by the frontend + the `agentic_runs."Artikel_Nummer"` actually written.

2a. ✅ **Creating an instance of an existing reference re-ran an approved/in-review agentic run (agentic #924).** `import-item` correctly declined to re-seed (`hasExistingAgenticRun` guard), so the frontend fired its own `POST /api/agentic/run`; `forwardAgenticTrigger` restarted every non-active run — including `approved`/`review`/`auto_approved` — clobbering the result. Now it restarts only a `notStarted` run from that automatic path; active/settled runs are returned untouched (200). Explicit operator restarts (dedicated `…/agentic/restart` → `restartAgenticRun`) are unaffected. Note: bulk "KI starten" and the ItemDetail start button share this choke point and now likewise skip settled runs instead of restarting them (aligned with "failures are terminal, restart is explicit").

3. **Ensure waiting agentic runs restart on application restart.** All runs in a waiting state should automatically resume when the app restarts. Waiting runs should wait (max. parallel runs has to be respected)

4. ✅ **Fix AUTO_PRINT_ITEM_LABEL for multiple instances.** Success dialog now renders one PrintLabelButton per Stk instance using all `responseItems` UUIDs.

<!-- Not clarified:
 5. **Refine QR relocation flow.** Relocation still has edge-case issues in scan handoff/navigation. Moving an item to a box should behave consistently from both the box and item perspectives. Multi-scan and scan-until will be added in future iterations. **Goal:** stabilize intent and return-flow boundaries with targeted fixes, strong validation, and meaningful try/catch + logging at transition points. 

6. **Fix multi-scan item relocation bug.** Scanning multiple items during relocation causes state conflicts or navigation problems. **Goal:** ensure reliable scan-based workflows with proper state management and error recovery.
 -->

7. **Transform transcript persistence from HTML to JSON.** Store transcripts in a new location. UI restructuring of the transcript viewer (collapsible, step-separated) follows after persistence is changed. **Goal:** improve debuggability and enable structured transcript rendering.

8. ✅ **Fix shelf location display in box item list.** Standort column added to BoxDetail item list using `LocationTag`; backend was already returning Location/ShelfLabel per item.

---

## Priority 2 — Feature Improvements

**Per-user item marking (step 779) — deferred items:**
- CSS polish for `.mark-btn` added; amber accent color is hardcoded (`#f59e0b`) — wire to a CSS variable once a warning/accent token is established.
- Bulk mark action in `BulkItemActionBar` not yet added.
- Note text not shown as tooltip on the star icon in the list — keep as tab-only for now.

22. ✅ **Apply tab-gating to BoxDetail.** Done — each box tab now shows only its content slice; DetailTabBar renders inside BoxDetail.

19. ~~**Wire `item × attachments` action panel slot.**~~ Superseded — ActionPanel deleted; inline button in AttachmentsCard already covers the use case.

20. ~~**Wire `item × accessories` action panel slot.**~~ Superseded — ActionPanel deleted; inline RefSearchInput fields cover the use case.

21. **Box images tab empty for shelves.** Shelf boxes (`S-*`) are not `isBoxRelocatable`, so the images tab renders nothing. Revisit when shelf photo support is defined.

8. **Ensure shelf weight and item count are calculated correctly.** Current totals are incomplete or inaccurate. Aggregation should cover both nested boxes and loose items. **Goal:** align aggregation logic across backend/frontend models while reusing existing summary helpers.

9. **Agentic run substatus tracking.** Show substatus within a run (search → categorization → extraction) so the user can see where a run currently is.

10. **Agentic run: don't discard partial data on field failure.** When one field fails, persist the remaining gathered information and the search state rather than ditching everything. **Goal:** reduce re-work on partial failures.

11. **Agentic: assure category then start extraction with review info.** Enforce category confirmation before starting extraction and pass review context into the flow.

12. ✅ **Multiselect agent states.** Item-list Ki-Status filter is now a checkbox multi-select (default: every status except 'Freigegeben'). Legacy single-value localStorage/URL shape is migrated on load; empty selection = show none via `__none__` sentinel; backend filters via `= ANY($4::TEXT[])`. See ui changelog #887.

13. **Filter and sort boxes/shelves.** Add filter options (boxes only / shelves only, location dropdown) and sorting to the box/shelf list.

14. ✅ **Populate EAN / surface instance identifiers.** EAN display now routes to the instance tab (alongside SN/MAC). SerialNumber and MacAddress are captured in the create form and persisted via import-item. Remaining gap: editing SN/MAC on existing instances requires a separate instance-update path (not yet built).

15. **Support text search fallback for relocate item/box (label search).** QR-only flows are brittle when labels/scans fail. Reuse existing search endpoints and add a low-overhead fallback without building a parallel relocation system.

16. **Enable item-list filtering by box.** Align with box-detail inventory presentation; consider reusing item-list views in box detail instead of maintaining separate inventory render logic. **Goal:** consolidate around reusable list components and reduce UI surface complexity.

17. **Add neighboring box navigation (prev/next).** Mirror existing item navigation patterns using existing sort order. **Goal:** reduce repeated return-to-list navigation during review flows.

18. **Implement transport boxes (T-).** Planning document at `docs/PLANNING_transport_boxes.md`. Phase 1: DB schema (`transports` + `transport_items` tables), models, CRUD + complete/cancel actions, TransportListPage + TransportDetail. Phase 2: creation entry points in BoxDetail/ShelfDetail/StubDetail/BulkActionBar + "Transport ausstehend" badges; pending transport surfaced on item instance view (§8.6). Phase 3: ERP/shop API + reference search + audit export. Note: `complete-transport` must also auto-resolve active `box_stubs` for the source shelf.

19a. **Implement stub boxes.** Planning document at `docs/PLANNING_STUB_BOXES.md`. Phase 1: `box_stubs` DB table + migration (incl. `PhotoPath` column), create/list/patch API actions, ShelfDetail `HasActiveStubs` badge + stub list section. Phase 2: dedicated Stub Management nav page (grouped by shelf with color distinction, photo thumbnail); stub detail includes "Transport erstellen" button pre-filling `SourceId = stub.ShelfId` (identical to shelf detail flow). Stub auto-resolve is handled by transport completion (item #18), not a separate action.

19b. **Implement inventory feature (passive cycle).** Planning document at `docs/PLANNING_INVENTORY.md`. Phase 1: `LastInventoryDate` on boxes, `MissingAt` on items, `inventory_sessions` table, `INVENTORY_CYCLE_DAYS` config, `inventoryPending` filter on box list. Phase 2: `/api/inventory/start|scan|complete|cancel`, `InventoryCheckView` with checklist + scan zone + Menge count inputs + acoustic feedback. Phase 3: passive trigger hook in `qr-scan` + interstitial prompt. Phase 4: missing items view, `InventoryFound` flow, session export. Active Inventory Day (UC-1) is deferred — not part of current scope.
   - **Note (storage #885):** A lightweight reconciliation *exit route* now exists on the placement scan flow (`PlacementScanView`): finishing a box scan surfaces unscanned recorded items and lets the operator remove their stock or clear their location. This is distinct from the full passive-cycle verification feature above (no sessions/`MissingAt`/passive triggers) but covers the "remove items that no longer exist" need for the scan-into-box workflow.

19. ✅ **Add instance specification fields (RAM, SSD, OS).** Now driven by quality contracts: `specField`/`specValue` in each question contributes to Langtext automatically after quality review. Subcategory contract 201 (Laptop) covers keyboard layout, RAM, storage, battery.

40. ✅ **Quality contract: add remaining subcategory contracts.** Now covers: 102, 201, 301, 302, 401, 701, 103, 105, 204, 1802. Remaining low-volume subcategories (101/104/106/108 PC variants, 103 variants) deferred — 102 contract covers the same assessment pattern.
44. ✅ **Spec contracts: add remaining subcategory contracts.** Now covers: 102, 103, 105, 201, 204, 301, 401, 601, 701. `Hersteller` omitted from all new contracts (first-class ItemRef field). Remaining niche subcategories (702, 1203, 1204, etc.) not added — low inventory volume.
45. **Spec contracts: targeted enrich button in ItemKiTab.** When an item has missing required spec fields (visible as empty Langtext rows), add a "Gezielt anreichern" button in the KI tab that starts an agentic run pre-seeded with the missing field names as missingSpecFields. Requires fetching the spec contract client-side and computing the gap against the current Langtext.
46. ✅ **Spec contracts: contract version stamping.** `SpecContractVersion INTEGER` added to `agentic_runs` (additive), stamped on each completed run from `getSpecContract(sub).version`. Powers the idle contract-audit sweeper (#50 Phase 2a). See agentic changelog #894.
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

52. **Pre-existing failing tests (not caused by the #889–894 work; documented for cleanup).** `schema-contract-compatibility.test.ts` asserts the supervisor prompt contains `schema-contract.md`, but the current `supervisor.md` was rewritten to a description-quality focus and no longer references it — the test expectation is stale. `test/agentic-direct-dispatch.test.ts` and `test/agentic-startup-resume.test.ts` fail in the local esbuild harness because the scheduled `invokeModel` isn't observed (`toHaveBeenCalledTimes(1)` → 0); verify against CI's Postgres/jest setup. All three fail identically on a clean tree.
   - ✅ **Harness `toMatchObject` gap fixed (testing #907):** the custom harness never implemented `toMatchObject` though 16 call sites use it; added it as a recursive subset matcher. Removed one spurious failure ("moves box placement"); local failing count 10→9.
   - **Still failing locally (9):** esbuild harness can't resolve named exports from bundled `../../agentic` (`deleteAgenticRun`/`checkAgenticHealth is not a function`), plus mock/env gaps (`window is not defined`, missing `.env`/media fixtures, `ts-jest` preset not found). Suspected CI-green (jest+Postgres); needs verification against CI rather than product-code changes.
   - **`intake-specs-assembly.test.ts` — "human-judgment condition questions" fails on a clean tree** (found during intake #912). `loadSubCategoryContract(201)` (the `lib/quality-contracts` loader) returns `null` under jest so `sub!.questions` throws, while the `contracts/registry` loader used by the same suite resolves fine — a path-resolution mismatch between the two contract loaders in the test env, not a product bug. Reconcile the loaders' base-dir resolution (or the test's expectation) so the subcategory contract loads under jest.

41. ✅ **Quality re-check from ItemDetail.** "Neu bewerten" button added to instance tab `tab-actions`; opens `QualityReviewModal` wrapping `QualityReviewStep`. Results stored in `items.InstanceSpecs` (per-instance) and `quality_assessments`.

41b. ✅ **Quality assessment visibility & flow.** Quality questions are now all optional (submit without answering all). Multiple Stk creation skips quality (each item gets an amber missing-quality prompt). Success dialog shows quality badge or note. Item list has Alle/Mit Bewertung/Ohne Bewertung filter dropdown.

42. **Quality search: `includeQuality` API param.** When set, search also matches against `derived_specs` in `quality_assessments` (Postgres JSON operators). Enables searching "16GB" to find matching Laptops.

42b. ✅ **Search covers instance identifiers (SerialNumber, MacAddress, EAN).** Header search now finds items by serial number, MAC address, or EAN barcode. Both token-presence (LIKE) and exact-match (=) checks added to SQL; JS scoring updated. Reference (dedupe) search also includes EAN.

43. ✅ **Quality contracts: `text` question type (datalist combobox) implemented.** `select` / `boolean` / `text` now supported. `range` (numeric slider) still deferred.

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

---

## Priority 3 — Infrastructure & Platform

53. **New use case: spare-part cataloging (separate, multi-tenant deployment).**
   Feature-disposition plan + gap list in
   [`docs/PLANNING_NEW_USE_CASE.md`](docs/PLANNING_NEW_USE_CASE.md). Use case =
   thorough spare-part cataloging (catalogue every reusable part); disassembly/
   component lifecycle is the centerpiece to strengthen. Two greenfield
   workstreams gate it:
   - **G‑T1 Multi-tenancy (largest lift).** No `tenant`/`mandant`/`org_id`
     concept exists anywhere. **Proposed (plan §12.3) — two-tier visibility** on
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
     reference, `INTAKE_CATEGORIES`) — no generator enforces consistency. Add a
     build‑time generator to de‑risk any category change.
   - **G‑C2 / G‑K2** Taxonomy and contract files are a flat global namespace — no
     scoping, so two use cases cannot coexist on one instance without new design.
   - **G‑F1 / G‑F2** No use‑case/domain/tenant dimension exists in config at all;
     "change the config for a use case" is greenfield.
   - **G‑K3** ✅ resolved on main (the `disassembly/`→`assembly/` doc drift was
     fixed by the intake-image/contract-docs sync work).
   - Domain hardcodes to revisit for a new use case: `models/shelf-locations.ts`
     (revamp sites), ERP booking group `453` (`backend/config.ts:366`),
     `ERP_IMPORT_FORM_*`, `contracts/impact/co2.json`.



33. ✅ **Admin mode / admin page for operational controls.** `/admin` page with import, export, shelf creation, print queue, KI queue, and system status. Gear icon in header nav. Old `/admin/shelves/new` redirects to `/admin`.

33b. ✅ **Admin page: add password protection via ADMIN_SECRET.** If `ADMIN_SECRET` env var is set, backend rejects all `/api/admin/*` requests without a matching `Authorization: Bearer <secret>` header. Frontend shows a password gate on `/admin` that stores the entered value in `sessionStorage` and threads it through admin API calls (`/api/admin/label-queue`, `/api/admin/config`). Existing non-admin endpoints (`/api/overview`, `/api/export/items`, etc.) stay unprotected.

33c. **Wire Authentik forward-auth enforcement (follow-up to stack add, OVERVIEW 898).** Authentik now runs in the `docker-compose.yml` stack but nothing consumes it yet. Next: (1) proxy forward-auth — nginx `auth_request` against the Authentik outpost in `config/nginx/mediator.conf` (dev), Traefik `forwardAuth` middleware label in `docker-compose.prod.yaml` (prod), plus adding the Authentik services to the prod compose; drop nginx Basic Auth once it works. (2) Backend: a helper generalizing `backend/utils/admin-auth.ts` that resolves `{username, groups, role}` from `X-authentik-username`/`X-authentik-groups` into `ActionContext`; replace the `/api/admin/*` check with a `mediator-admin` group check (keep `ADMIN_SECRET` as break-glass fallback). Design the role check as a **config-driven group→capability map**, not a hardcoded binary, so extra roles (`intake`, `erp`, `readonly`, …) are a config line + an Authentik group. (3) Populate the free-text `Actor`/`Username` fields from the authenticated user. (4) In Authentik itself: create the Proxy Provider, the `mediator-admin` group (everyone-else authenticated = user), and the embedded outpost. Note the deploy workflow only rolls `mediator`, so bringing the Authentik services up on the host needs a manual `docker compose up -d` or a workflow change.

34. **Add WebDAV folder for temporary media, transcripts, and service-related data.** Support the new transcript persistence location and other temporary media storage needs.
34b. **Media health: periodic background check.** `/api/media/health` is currently on-demand (polled when admin page loads). A recurring server-side probe (e.g. every 5 min) that logs a warning when reachability drops would surface WebDAV failures without requiring an operator to open the admin page.

35. **Create boxes from scans.** When a box is deleted but is later physically scanned, it should be recreated.

36. **Automatic printer server handling after restart.** Manual restart recovery causes avoidable downtime. **Goal:** add startup/reconnect checks with actionable logging.

37. **Declutter QR/relocation logging.** Logs are cluttered with low-value entries. Demote noisy events to `debug` level or remove them; keep only operationally relevant fields. No compliance requirements mandate retaining these.

38. **Standardize relocation logs with explicit `from → to` semantics.** Ambiguous move logs hinder audits and incident reconstruction. **Goal:** unify event payload fields with minimal schema changes.

39. **Periodic backup automation.** Missing regular backups raises data-loss risk. **Goal:** implement a lightweight scheduled backup flow with success/failure reporting.

39b. ✅ **CD: manual deploy workflow.** `.gitea/workflows/deploy.yaml` (`workflow_dispatch`) SSHes to the Docker host and rolls the `mediator` compose service onto a chosen image tag (SSH push-deploy, option 1). `docker-compose.prod.yaml` image parametrized to `${MEDIATOR_IMAGE:-…}`. Needs `DEPLOY_SSH_HOST/USER/KEY` secrets and a runner that can reach the host on the SSH port (LAN VM → LAN-resident `act_runner`). See docs-infra changelog #896. **Still open:** (1) automatic deploy-on-tag behind an approval gate (kept manual for now by request); (2) rolling postgres/cups from CI (currently assumed pre-provisioned); (3) pinned known_hosts instead of TOFU `accept-new`; (4) full **ghcr.io → Gitea registry cutover** for `docker-compos-V2_2.yaml` and `scripts/reploy.sh` (both still hardcode `ghcr.io`).

40. ✅ **Postgres migration complete.** `DATABASE_URL` required; no SQLite fallback. Migration script: `scripts/migrate-sqlite-to-postgres.ts`. Multi-instance agentic safety (`SELECT FOR UPDATE SKIP LOCKED`) implemented in `claimQueuedAgenticRuns`.

---

## Open Questions

### Still Open

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
