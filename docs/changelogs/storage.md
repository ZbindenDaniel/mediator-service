# Changelog: Storage & Locations

Covers: boxes, shelves, locations, relocation, stubs, inventory cycles, box hierarchy, placement.

---

## 809. ✅ Fix nginx 429s on item detail: split rate-limit zones for API vs browser-facing routes
   - **Why:** The `auth_limit` zone (5r/s burst=10) was applied globally to all requests. Loading one item's instances fires one `/api/boxes/:id` request per distinct box simultaneously — easily 10–15 concurrent requests — which exceeded the burst. The limit was meant for brute-force protection on the basic-auth login prompt, not for SPA API traffic. Fixed by: (1) adding a permissive `api_limit` zone (100r/s burst=300) applied to `/api/` and `/api/admin/` locations; (2) restricting the strict `auth_limit` (5r/s burst=20) to the `location /` block only.
   - **Deferred:** Per-instance box fetches in LocationTag are still N individual requests; batching them would be a further improvement but isn't blocking.

## 808. ✅ Intermittent box/item "not found": add keep-alive pool config + BoxDetail key + logging
   - **Why:** Pool had no `connectionTimeoutMillis` or `keepAlive`; stale/idle connections after the default 10s idle timeout may produce silent failures. Added `keepAlive: true`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`. Added diagnostic logging in `getBox` and `save-item` 404 path to surface the real cause if it recurs. Added `key={entityId-loadRevision}` to `BoxDetail` in Layout so it remounts cleanly on each navigation like `ItemDetail`.
   - **Deferred:** True root cause still unconfirmed — logging will surface it on next occurrence.

## 807. ✅ Fix item_ref_relations and item_relations CreatedAt/UpdatedAt NOT NULL constraint violations
   - **Why:** `item-relations.ts` INSERT statements omitted `"CreatedAt"` (both tables) and `"UpdatedAt"` (item_relations), both defined as TEXT NOT NULL. Fixed by adding `NOW()` for both.
   - **Deferred:** Nothing.

## 806. ✅ Fix item_attachments CreatedAt NOT NULL constraint violation
   - **Why:** INSERT in `item-attachments.ts` omitted `"CreatedAt"` column which is TEXT NOT NULL. Fixed by adding `"CreatedAt", NOW()` to the INSERT.
   - **Deferred:** Nothing.

## 804. ✅ Fix box list ItemCount always 0 on initial load (was missing await on queryHelper calls)
   - **Why:** same as entry 801 — the await fix was already applied; this entry documents the COUNT cast fix.

## 802. ✅ Fix box list ItemCount always 0: cast COUNT() to integer in listBoxes queries
   - **Why:** PostgreSQL `COUNT()` returns bigint; the `pg` driver returns it as a JavaScript string (e.g. `"5"`). The frontend's `Number.isFinite(box.ItemCount)` guard is `false` for strings, so the display always fell back to `0`. Fixed by adding `::int` cast to both the `LIST_BOXES_SQL` constant and the `byType` inline query.
   - **Deferred:** Nothing.

## 801. ✅ Fix box list showing no entries: add missing await to listBoxes helper calls
   - **Why:** `list-boxes.ts` called `queryHelper.all()` and `queryHelper.byType()` without `await`. Both return Promises; `JSON.stringify(Promise)` serializes as `{}`, so the frontend received `{ boxes: {} }` instead of an array.
   - **Deferred:** Nothing.

## 795. ✅ Migrate box-detail.ts from SQLite .get()/.all() to async Postgres helpers
   - **Why:** `box-detail.ts` was the last action still using the old SQLite prepared-statement pattern — checking `typeof ctx.getBox.get === 'function'` and calling `.get(id)` / `.all(id)` synchronously. All four helpers (`getBox`, `itemsByBox`, `listEventsForBox`, `boxesByLocation`) are plain `async function(arg)` after the Postgres migration. Also changed shelf-contained-items loading from a synchronous `.flatMap(itemsHelper.all(id))` loop to `Promise.all(ids.map(ctx.itemsByBox))`.
   - **Deferred:** Nothing.

## 792. ✅ Fix post-migration bugs: box-detail 500, create-stub missing await, logEvent not awaited
   - **Why:** `box-detail.ts` was still guarding with `typeof ctx.getBox.get !== 'function'` — an SQLite statement check that always fires on async functions, returning 500 for every box/shelf request. This broke the box/crate tab, relocation UI, and item list after moves (stale frontend state). `create-stub.ts` called `ctx.createStub()` without await, silently losing DB errors. All `ctx.logEvent()` call sites across 12 action files lacked `await`, causing move/delete events to be silently dropped or recorded late.
   - **Deferred:** Several tester-reported issues still need investigation at runtime: "KI lauf kann nicht geloescht werden", "ki erfassung indefinite", "bearbeiten fehler", "list button broken", item duplication after move (now more likely to self-resolve with box-detail fixed). All noted in todo.md.

## 774. ✅ Fix BoxDetail shelf LocationTag navigating into the main shell
   - **Why:** The "Standort" row in BoxDetail used `<Link to="/boxes/:shelfId">` which triggered React Router to render BoxDetail inside `panel-main` (via BoxRoute), causing shelf tabs to appear in the main shell and BoxDetail to render twice (main + right panel). Replaced with a `<button>` that calls `setEntity('box', normalizedLocationId)` — the same pattern already used in ItemList for shelf/box column buttons.
   - **Deferred:** Nothing deferred.

## 753. ✅ Box item list: add Standort column showing shelf location via LocationTag
   - **Why:** Backend already returned `Location`/`ShelfLabel` on each item; no column displayed it. Operators had to leave the items tab and check the info tab to know which shelf a box (and its items) was on. Reused the `<LocationTag item={} itemId={}>` pattern from ItemList. Column marked `optional-column` so it collapses on narrow screens.
   - **Deferred:** Nothing deferred.

## 744. ✅ Placement actions: scan items into boxes and boxes onto shelves via QR callback loop
   - **Why:** Operators needed a fast mobile flow to physically organise stock without a dedicated scanner device. Reused the existing `/scan` QrScannerPage callback pattern (returnTo + location.state.qrReturn) — no inline camera code, no new hooks. Each scan is one atomic round-trip; the URL carries the target, each `qrReturn` payload carries the scan result; all state is ephemeral React component state (no sessionStorage needed).
   - **Deferred:** No persistent scan-history list per session — each mount handles one scan result. Operators who need an audit trail can check the event log. No new backend endpoints were added.

## 36. ✅ Drop shelf-ID legacy compatibility: enforce only `S-<location>-<floor>-<index>` in print/import/relocation and remove shelf category filtering/selection from create/list flows.

## 35. ✅ Remove shelf category from minted/default shelf IDs (now `S-<location>-<floor>-<index>`), keep legacy parsing compatibility for print/import flows, and relax shelf-create payload category requirement while preserving logging/error handling.
