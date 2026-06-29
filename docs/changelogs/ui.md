# Changelog: Frontend UI/UX

Covers: frontend layout, navigation, cross-cutting UI changes, mobile/desktop responsive behavior, help pages.

---

## 862. ✅ Marks filter shows all users' marks; BoxCount column for shelves in box list
   - **Why:** `UserMarksContext` only loaded marks for the current user; the "Markiert" filter was per-user. Added `GET /api/user-marks/all` endpoint + `getAllMarkedItemUUIDs()` DB helper; context now also fetches all marks on mount and exposes `allMarkedUUIDs`/`isMarkedByAnyone`. `ItemListPage` filter now uses `allMarkedUUIDs` so all users see items marked by anyone. Box list adds a "Behälter" column for shelf rows showing child box count; "Artikel" column shows `—` for shelves.
   - **Deferred:** The star icon in the item list still reflects only the current user's marks (toggling is always per-user). A separate visual treatment for "marked by someone else but not me" is not yet added.

## 862. ✅ Fix event BoxID filter 500 error; event type Created vs Updated; event metadata
   - **Why:** `listRecentActivitiesByBoxId` used `jsonb_build_object('from', $1)` without a type cast — Postgres could not determine parameter type and raised a 500. Fixed by adding `::text` cast. Also: `import-item.ts` checked `getItem` after persisting, so the item always existed and every event was `Updated`; moved check to before persist. `save-item.ts` always emitted `Updated` even for new refs; now uses `existingReference === null ? 'Created' : 'Updated'`. Both endpoints now include `{ source, artikelNummer, boxId }` in Meta.
   - **Deferred:** Nothing.

## 854. ✅ Panel-detail reference header: item/box label shown next to Liste button
   - **Why:** Operators had no visible context for which item/box was loaded in the detail panel. Added an always-visible `panel-detail-header` bar above the tabs: "← Liste" button on the left (arrow `←` rotated 180° via CSS transform to point right), and the current item/box reference label in the center (e.g. "Lenovo T14 Gen7 – 019345"). `PanelContext` exposes `panelDetailLabel`/`setPanelDetailLabel`; `ItemDetail` pushes `Artikelbeschreibung – Artikel_Nummer` and `BoxDetail` pushes `Label – BoxID` on load, cleared on unmount. Old `mobile-back-btn` CSS removed.
   - **Deferred:** Nothing.

## 849. ✅ Restore "← Liste" full-width list view on desktop
   - **Why:** The button was always intentional on desktop. The previous commit wrongly hid it with `display: none`. Added `@media (min-width: 901px)` rules: `.app-shell--mobile-list .app-shell__right { display: none }` and `.panel-main { flex: 0 0 100% }` so clicking "← Liste" actually collapses the detail panel and expands the list. Button styled for desktop with compact border/padding.
   - **Deferred:** Nothing.

## 842. ✅ User help pages: second-pass doc refinements based on detailed feedback
   - **Why:** Detailed per-line corrections: Erste-Schritte rewritten with correct tab order (Vorrat first), removed unnecessary browser hint, fixed UI text ("Review erforderlich"), added "Massenware (RAM, Netzteile, Kabel)", ERP section note to involve admin, "Dein Alltag" replaced with two distinct process flows (unknown item vs. known Artikelnummer). CO2-Berechnung: ADEME dataset linked, simplified label-based scoring explained. Drucker-Einrichtung: rewritten driver discovery flow (Admin → Neue Queue → Scannen, then PPD search by model number). Ersatzteile: Entnehmen now documents two scenarios (einlagern vs. direkt verkaufen — direkt verkaufen noted as planned); "Link entfernen" adds note about instance re-linking gap. Fehlerbehebung: WebDAV section clarified that image uploads are lost on failure (no local staging); 7a extended with inventory scanning hint. HilfePage.tsx: `inlineMarkdown` extended to render `[text](url)` as clickable links.
   - **Deferred:** Ersatzteile "direkt verkaufen" path (Qty=0 on Entnehmen) and instance reference re-linking both logged as new Priority 1 items in todo.md.

## 841. ✅ Reactivate user help pages + informal language rewrite + doc extensions
   - **Why:** Help pages were deactivated by removing the question-mark nav icon from Header.tsx. Restored the GoQuestion link. Rewrote all 6 German user docs (`docs/user/`) in informal "du" language for a friendlier tone. Extended Erste-Schritte (tabs explanation, daily workflow section, username-change tip), Fehlerbehebung (3 new sections: veraltete Daten, Seite lädt nicht, KI hängt; extended ERP-export recovery), and Ersatzteile-erfassen (reframed with conceptual intro explaining the Zerlegen philosophy, step-by-step laptop example, clarification of what happens to the source device).
   - **Deferred:** Nothing.

## 776. ✅ Admin page password-gated via ADMIN_SECRET; Bug 0c (tab icons) closed
   - **Why:** The `/admin` page was accessible to anyone on the network with no auth. Added `ADMIN_SECRET` env var support: backend returns 401 on all `/api/admin/*` requests unless the matching `Authorization: Bearer <secret>` header is present; when the var is unset, all admin endpoints remain open (no breaking change for existing deployments). Frontend probes `/api/admin/config` on mount and shows a password gate (`AdminGate`) when 401 is received; the token is stored in `sessionStorage` and threaded via props into `PrintQueueCard` and `SystemStatusCard`. Bug 0c closed — all tab icons were already correctly imported; `GoTools` was never used (the icon for that slot is `GoCpu`).
   - **Deferred:** `/api/agentic/restart-failed` and `/api/export/items` remain unprotected per the spec (only `/api/admin/*` routes are gated). A "Abmelden" button on the admin page to clear the session token is not added — clearing sessionStorage manually or closing the browser tab is sufficient.

## 771. ✅ Enrich event log descriptions: show from/to for movements, box source for removals, reviewer for KI events
   - **Why:** The "Aktion" column in the activities table and the item events tab previously showed only a static label (e.g. "Verschoben") — the `Meta` JSON field already contained rich context (BoxIDs, reviewer names, quantities) but was never surfaced. Added `formatEventDescription()` in `frontend/src/utils/eventDescription.tsx` to parse `Meta` per event type and render human-readable sentences (e.g. "Umgelagert von B-… nach B-…", "Entnommen aus B-… (3 → 2)", "Ki-Ergebnis freigegeben von Alice").
   - **Deferred:** Box location label resolution for item moves (only BoxIDs shown, not shelf labels — those would require a separate lookup). `Added` event meta enrichment not done (meta structure not confirmed). Box moves could optionally show the previous location too (not in current `Meta`).

## 770. ✅ Three smaller UI fixes: quality modal scrollable, OverviewPanel wrapper, ItemDetail data refresh + tab bar persistence
   - **Why (modal):** `.dialog-content` had no `max-height` or `overflow-y`, so quality assessment modals with many contract questions (e.g. subcategory 401) overflowed the viewport. Added `max-height: min(90vh, 680px); overflow-y: auto` to the class.
   - **Why (OverviewPanel):** `<OverviewPanel>` was rendered directly in `panel-detail` (which has `overflow: hidden`) without a scrollable wrapper, unlike ItemDetail/BoxDetail which both use `panel-tab-body`. Wrapped in `panel-tab-body` for consistent padding and scrollability.
   - **Why (data refresh):** After `ItemEdit` saved and called `setEntity('item', itemId) + navigate('/items')`, the `entityId` prop to `ItemDetail` was unchanged so its `load()` useEffect didn't re-run — stale data showed. Fixed by adding `loadRevision: number` to `PanelState`, incremented on every `setEntity` call, and using it as part of the `key` prop on `<ItemDetail>` in Layout so it always remounts with fresh data after selection.
   - **Why (tab bar):** `ItemDetail`'s loading/error early returns rendered without `<DetailTabBar>`, causing the tab bar to disappear during load (most noticeable after remount from the refresh fix). Changed both early returns to include `<DetailTabBar agenticNeedsReview={false}>` above a `panel-tab-body` wrapper.
   - **Deferred:** Nothing deferred.

## 769. ✅ Five UI shell bugs fixed: item-edit left-panel bleed, Lose Kartons removal, stubs shelf link, duplicate dashboard panel, OverviewPanel position
   - **Why (item edit panel):** After saving, `ItemEdit` called `navigate('/items/${itemId}')` which rendered `ItemRoute → ItemDetail` inside `panel-main` (left column). Fixed by calling `setEntity('item', itemId)` + `navigate('/items')` so `ItemDetail` renders in the right `panel-detail` via `Layout` and `ItemListPage` restores in the left panel.
   - **Why (Lose Kartons):** `NumberLooseBoxes` was removed from the backend and StubListPage in step 763 but was missed in `BoxDetail.tsx`. Removed `stubLooseBoxes` state, POST body field, useCallback dep, table column, and form field.
   - **Why (stubs shelf link):** `StubListPage` used `navigate('/boxes?entity=box&id=...')` which doesn't update `PanelContext` (it only hydrates from URL on mount). Replaced with `setEntity('box', shelfId) + setMainView('boxes')` to update panel state directly.
   - **Why (duplicate dashboard):** `Layout` rendered both `DashboardPanel` and `OverviewPanel` in `panel-detail`. They are functionally identical; `OverviewPanel` is the current version (also fetches printer/health). Removed `DashboardPanel` — one `StatsCard` now shows in the empty-state right panel.
   - **Deferred:** Nothing deferred.

## 766. ✅ Admin page at /admin with 6 operational sections: import, export, shelf creation, print queue, KI queue, system status
   - **Why:** Admin operations were scattered — shelf creation at a one-off URL, import buried in the items list, export only accessible via bulk-selection. Consolidating them into a single `/admin` page (gear icon in header nav) gives operators one place for all system-level tasks. Existing components (`ImportCard`, `ShelfCreateForm`) reused directly; export and agentic-restart needed only small new backend actions. The page renders in `panel-main` like `/hilfe`, keeping the panel shell intact.
   - **Deferred:** Auth gating (no auth layer exists in the app). Periodic backup trigger (todo item 39 — Phase 1 could add a manual button here). Batch label reprint from print queue (button exists but reprint endpoint not yet wired per-job). `/admin/shelves/new` now redirects to `/admin`.

## 762. ✅ Gamification stats: StatsCard restored to the right panel empty-state via self-fetching OverviewPanel; three fun derived stats added — KI-Trefferquote %, Angereichert %, Gesamt-Gewicht; "Artikel ohne Behälter" renamed to "Heimatlose Artikel"
   - **Why:** StatsCard existed but wasn't rendered anywhere. The new stats are computed from data already returned by /api/overview (KI-Trefferquote, Angereichert) plus one new SQL aggregate (sumInventoryWeightKg). All three rows hide gracefully when no data is available (no decided runs, no items, no weight data). OverviewPanel is a minimal self-fetching wrapper so Layout.tsx stays clean.
   - **Deferred:** Quality distribution breakdown (would need a new GROUP BY query and more display space). "Most stubborn item" (highest RetryCount) — cute idea but needs a more prominent UI slot.

## 765. ✅ Four v3.0 release bugs fixed: quality contracts missing in dist, attachments binding modal shown needlessly
   - **Why (contracts):** `scripts/build.js` did not copy `contracts/` to `dist/contracts/`. At runtime `backend/contracts/registry.ts` resolves `CONTRACTS_DIR` relative to `__dirname` which points inside `dist/`; without the copy the general and subcategory quality contracts returned 404, leaving the quality step empty. Fix: added `copyContracts()` to the build script.
   - **Why (attachments):** The binding modal appeared whenever `artikelNummer` was set (≥2 options), even though both "instance" and "artikel" options share the same backend endpoint (routing deferred in step 760). Modal now only shows when at least one option has `endpoint.kind === 'external'`.
   - **Deferred:** Artikel_Nummer attachment routing still goes to instance endpoint (label-only, unchanged from step 760).

## 757. ✅ Onboarding redirect + help page nav: route new users to Erste-Schritte, add prev/next doc buttons
   - **Why:** First-time users (no username in localStorage) were shown a bare dialog prompt with no context. Replaced with a redirect to `/hilfe?doc=Erste-Schritte` so they land on the onboarding guide. Username is collected inline on the help page (highlighted setup form) rather than via a floating dialog. Removed `ensureUser()` from Header — redirect in Layout covers first-run, double-click edit covers subsequent changes. Prev/next buttons at the bottom of each doc let users step through all three guides in order without touching the sidebar. `?doc=` search param drives active doc selection so browser back/forward works correctly.
   - **Deferred:** Username is not re-prompted if user clears localStorage manually (they'll be redirected to onboarding again, which is fine). No progress indicator across docs.

## 756. ✅ User-facing help page: German release checklist + onboarding guide served via `/api/user-docs` and `/hilfe`
   - **Why:** Operators needed accessible German-language documentation inside the app itself — a release checklist to verify functionality after each update, and an onboarding guide for new users. Documents live in `docs/user/` and are served as raw markdown by a new `/api/user-docs` backend endpoint. A new `/hilfe` frontend page fetches the doc list, renders inline markdown (headings, checkboxes, bold, code) without an added dependency, and is accessible via a question-mark icon in the header nav.
   - **Deferred:** Per-user checkbox state persistence (checkboxes reset on reload — for a printed checklist this is intentional). Adding more documents only requires dropping new `.md` files into `docs/user/` with no code changes.

## 743. ✅ Stabilize ItemDetail.tsx: removed dead code and duplicates left over from PR #949 extraction (3,452 → 2,827 lines, −625 lines)
   - **Why:** PR #949 extracted `AgenticStatusCard`, `item-tabs/`, and `lib/itemDetailFormatting` but left the originals in `ItemDetail.tsx`. Dead `AgenticStatusCard` component (unreferenced — `ItemKiTab` imports from the standalone file), duplicate utility functions identical to those in `lib/itemDetailFormatting`, duplicate type definitions shadowing `AgenticStatusCard.tsx`, and unused exports (`AGENTIC_REVIEW_PROMPT_SEQUENCE`) were all removed. `buildAgenticRestartRequestPayload` and `performItemDetailAgenticCancel` moved to `lib/agentic.ts` where they belong with the other agentic API helpers. TypeScript build remains clean.
   - **Deferred:** Hook extraction (`useItemAgenticActions`, `useItemMedia`) would reduce the main component body by another ~900 lines but is a larger diff — deferred to a follow-up. Other large files (`db.ts`, `importer.ts`, `ItemCreate.tsx`, backend agentic code) not addressed in this session.

## 748. ✅ Mobile UI: panel switcher with slide transition fixes list navigation and Einscannen visibility
   - **Why:** Two mobile bugs shared the same root cause — `panel-main` was CSS-hidden whenever an entity was selected, so list-page navigation and PlacementScanView both rendered invisibly. Fix avoids clearing entity on desktop (which would blank the right panel): added `mobileShowDetail: boolean` to PanelContext, set automatically by `setEntity`/`setCreateMode`/`setMultiSelection` and cleared by `clearSelection`. Layout applies `app-shell--mobile-detail` class from this flag only (desktop layout is unaffected). A "← Liste" back button at the top of the right panel lets users switch back to the list on mobile. Header list-nav links call `setMobileShowDetail(false)` so tapping a nav item always reveals the list. Full-screen routes (`/scan`, `/placement/*`) bypass the shell entirely via a Layout early-return. CSS uses `transform: translateX` slide instead of `display` toggling, giving a natural mobile feel.
   - **Deferred:** No animation easing beyond `0.25s ease`. The `mobile-back-btn` label is "← Liste" — could be made context-aware (e.g. "← Artikel" vs "← Behälter") in a follow-up.

## 742. ✅ Header search: ported SearchCard logic into Header.tsx with inline dropdown
   - **Why:** The nav search bar was navigating to `/items?q=...` but the search endpoint `/api/search` was not being called. Ported direct-ID navigation (I-*, B-*, S-* prefixes) and API text search from the old SearchCard into Header; results open in the right panel via `setEntity()` without a full-page nav. Dropdown uses click-outside (pointerdown) and Escape-key listeners. CSS added for dropdown/result/pill/desc classes.
   - **Deferred:** Browser history back/forward does not update the panel state (Issue 7 — PanelContext writes URL but doesn't hydrate from URL on popstate). Item-edit post-save renders in the left panel (Issue 10 — handleEdit navigates to full route).

## 741. ✅ Group B UX fixes: box Artikel tab button group, info tab summary
   - **Why:** "Neu"/"Hinzufügen" buttons were in a plain `.row` div below the table — moved to a `.tab-actions` group at the top of the Artikel tab (button group, rounded ends, consistent with other tabs). "Detail-Liste" link joined the group as a styled `.btn`. Old bottom row removed. Info tab now shows Artikel count (types + Stk if > 1) and total weight (summed from `items[].Gewicht_kg`; row hidden if all items lack weight data).
   - **Deferred:** Weight calculation multiplies each item's `Gewicht_kg` by 1 (not quantity) — bulk items with quantity > 1 could be off. Clarify with warehouse once bulk weight semantics are confirmed.

## 740. ✅ Group A UX fixes: print modal, AI tab order, box Behälter column, button radius, landing page
   - **Why:** Print dialog was transparent inside app-shell__right because `dialog-content card` picked up the panel's `.app-shell__right .card { background: none }` rule — removed `card` from the class. AI tab had close/delete buttons above the status card; swapped order (card first, actions below). Behälter column removed from BoxDetail item list (redundant — we're already inside that box). Button group first/last children now get matching border-radius (left-rounded / right-rounded / fully-rounded if single). Root `/` now redirects to `/items?entity=item&tab=create` so the landing view is always the item list with the new-item form open in the right panel.
   - **Deferred:** nothing deferred.

## 739. ✅ Cross-nav fix; tab icons; mobile tab scroll; header search; review modal portal; Umlagern modal
   - **Why:** Eight issues from round 3 UX pass. (1) Box/item cross-nav: `setMainView()` calls removed from ItemList and BoxDetail cross-entity buttons — `setEntity()` alone keeps the left panel stable. (2) Transparent "Label drucken" button: explicit `background: var(--bg-button, #f6f7f9)` added to `.tab-actions .btn` to override the base `background: transparent` rule. (3) Tab icons: DetailTabBar replaced text labels with react-icons/go icons (GoPackage, GoTag, GoCpu, GoFileMedia, GoPaperclip, GoTools, GoPulse, GoInfo, GoPencil); tabs now use `title` + `aria-label` for accessibility; `flex-wrap: nowrap` + `overflow-x: auto` on tab bar for horizontal scroll on mobile. (4) Header search: compact form added to `.header-nav`; `?q=` URL param wired into `parseItemListFiltersFromUrl` + `hasItemListUrlFilterParams` in ItemListPage. (5) Review modal z-index: `AgenticSpecFieldReviewModal` now rendered via `ReactDOM.createPortal` to `document.body` from ItemKiTab — escapes `position: sticky` stacking context of `app-shell__right`. (6) Review cancel labels: `askFlag` cancel changed from 'Nein' to 'Abbrechen' and now treats `false` (cancel pressed) as abort (`return null`) so every step has a clear abort path; shop_article step likewise changed. (7) Umlagern modal: `RelocateItemCard` (ItemInstanceTab) and `RelocateBoxCard` (BoxDetail) now portal into a `dialog-overlay` wrapper at body level; clicking overlay closes modal.
   - **Deferred:** Filter-clear button location (still in header — moving to list-top-right is a larger refactor of ItemListPage's filter bar). Nav-from-box-detail on mobile — `← Zurück` button should work since `clearSelection` is wired, but depth-of-stack issues may remain. Tab icons: GoInfo, GoPencil, GoFileMedia, GoPaperclip, GoTools are assumed available in react-icons v5.5.0 (Octicons v19); verify when build is run.

## 738. ✅ Button group for tab actions; multi-select action bar; BoxDetail tab restructure
   - **Why:** Tab actions were rendered as loose buttons (gap, rounded corners). Replaced with a connected button group via `.tab-actions` CSS (border-radius:0, margin-right:-1px to collapse shared borders). `PrintLabelButton` gained an `inline` prop so it renders just the trigger button without the card wrapper — required for placement inside the group. `BulkItemActionBar` was missing from the panel entirely after ActionPanel deletion; restored inside `MultiItemDetailPanel` in Layout reading from `BulkSelectionContext`. BoxDetail tabs changed to Info / Notizen / Artikel / Aktivitäten (removed Bilder, added Notizen); action buttons (PrintLabel inline, Umlagern toggle, Löschen) placed above tabs in the same button-group style; Umlagern toggles `showRelocate` state (mirrors ItemDetail pattern); Notizen tab receives the photo+note form (boxes) and the label+notes form (shelves), which were previously buried in the Info tab second column.
   - **Deferred:** Stubs tab for shelves unchanged (still appended by DetailTabBar for S- IDs). The images tab in BoxDetail previously gated on `isBoxRelocatable` — photo upload now lives in the Notizen tab for all boxes.

## 737. ✅ Restore action buttons in tabs; reorder tabs (instance first); fix mobile detail view
   - **Why:** ActionPanel deletion (step 733) removed all action buttons with no replacement. Buttons are now embedded directly in each tab: Vorrat tab gets PrintLabel + Umlagern + Entnehmen; Referenz tab gets Bearbeiten + Shopartikel; KI tab gets Abschliessen + Löschen via a `tab-actions` row above the card, and start/cancel/review restored by removing `hideInlineActions` from AgenticStatusCard. Tab order changed to instance-first (Vorrat, Referenz, KI, …) and default tab updated across PanelContext, DetailTabBar, and ItemDetail. Mobile: `app-shell--has-entity` CSS class swaps the layout on ≤900px — hides the list, shows the detail panel full-width with a "← Zurück" button to clear the selection and return to the list.
   - **Deferred:** "Create transport" button in instance tab — transport feature not yet implemented (todo #18). KI tab's "Abschliessen/Löschen" only appear when `canClose`/`canDelete` are true; if both are false the action row is hidden entirely (intentional — no ghost buttons).

## 736. ✅ Fix scroll, remap keys: up/down items, left/right tabs
   - **Why:** panel-tab-body lacked `flex:1 + overflow-y:auto` so content pushed past the panel boundary and the page scrolled. panel-detail flex reset from 82 to 1 after action panel removal. Key rebind: ArrowUp/Down for item neighbour nav, ArrowLeft/Right for tab nav (handled centrally in DetailTabBar).
   - **Deferred:** nothing deferred.

## 735. ✅ Close Gap 3: fix shell navigation, delete dead landing page
   - **Why:** BoxDetail's item-row click was doing a full-page `navigate('/items/:id')`, breaking the shell layout. Replaced with `setEntity + setMainView`. LandingPage had no route since step 726; SearchCard and RecentBoxesCard were its only consumers and are now deleted (326 lines gone).
   - **Deferred:** BoxList has a `navigate` fallback when no `onSelect` is provided, but BoxListPage always passes `onSelect` so this path is never reached.

## 734. ✅ BoxDetail: move DetailTabBar inside, strict tab gating
   - **Why:** Mirrors ItemDetail's tab pattern. `effectiveTab = activeTab ?? 'info'` replaces the `activeTab === null || activeTab === 'xxx'` guards. AddItemToBoxDialog moved outside the grid so QR-return triggers work regardless of active tab. Layout.tsx simplified to render BoxDetail directly.
   - **Deferred:** nothing deferred.

## 733. ✅ Delete ActionPanel, ItemActionsContext, BoxActionsContext
   - **Why:** Actions now live in their respective tabs; the dispatch layer that bridged ItemDetail/BoxDetail state into a separate ActionPanel panel is no longer needed. Removes 526 lines and two context files with no behavior change.
   - **Deferred:** nothing deferred.

## 732. ✅ ItemDetail: strip dead inline ZubehoerCard/AttachmentsCard, displayedEvents, resolveActorName, eventLabel import
   - **Why:** These existed only to support the legacy full-scroll view removed in step 731. Dead code removed in small commit batches to keep each diff reviewable.
   - **Deferred:** Remaining dead state (neighbor fetch, setItemActions, galleryAssets for tab-only view) — ActionPanel context must be removed first before those can go.

## 731. ✅ ItemDetail: remove legacy full-scroll view; always render in tab mode
   - **Why:** User confirmed tabs-only on all screen sizes; the fallthrough path that rendered a legacy single-scroll layout when activeTab was null is now replaced by `activeTab ?? 'reference'`. Reduces ItemDetail by ~430 lines and eliminates a divergent rendering path.
   - **Deferred:** Inline ZubehoerCard/AttachmentsCard (removed in step 732), and dead imports from the legacy path.

## 730. ✅ DetailTabBar: remove ItemActionsContext dependency; badge driven by prop
   - **Why:** First step toward deleting ItemActionsContext. Badge (`agenticNeedsReview`) is now an optional prop defaulting to false; no context read at the tab bar level. Badge will be reconnected once ItemDetail passes the value directly.
   - **Deferred:** Actually wiring the prop from ItemDetail — pending next batch.

## 729. ✅ Activities open detail panel; review tab merged into KI; accessories navigate right; AI stats removed from dashboard
   - **Activities**: `RecentEventsList` replaced all `<Link>` navigation with row-click handlers calling `setEntity('item'|'box', id)` (no `setMainView`), so clicking an event opens the item/box in the right detail panel while keeping the left panel on the activities list.
   - **Review tab removed**: `DetailTabBar` no longer conditionally inserts a "Review" tab. Review state is indicated by an amber dot badge on the KI tab. Old URLs with `tab=review` still render the KI content (DetailTabBar maps 'review' → 'ki' for the active-tab highlight).
   - **Review merged into KI action panel**: The action panel's `ki` case now also shows "Review durchführen" when `agenticNeedsReview` is true; the old separate `review` case is removed. `case 'review'` falls through to `case 'ki'` for backwards compat.
   - **Accessories links**: `ZubehoerCard` replaced all four `<Link to="/items/...">` elements with `<button className="link-btn">` calling `setEntity('item', id)`, opening items in the right detail panel.
   - **AI stats removed from dashboard**: `NoSelectionPanel` no longer passes `agentic` to `StatsCard`; aggregate AI run counts will belong to a future KI overview screen.
   - **Why:** `setEntity` without `setMainView` keeps the left panel stable; this matches the navigation principle that lists only change through nav links. Badge on KI tab keeps review discoverability without a separate tab. `link-btn` buttons preserve the panel paradigm for all cross-entity links.
   - **Deferred:** A dedicated KI/AI main view (global run overview) is needed to surface the aggregate agentic stats removed from the dashboard. Tracked in todo.md.

## 728. ✅ Box fetch deduplication, selected item highlight, panel navigation for box/shelf links
   - **Box fetch storm fixed**: `LocationTag.fetchBoxById` now uses a module-level in-flight deduplication map — concurrent callers for the same box ID share one promise instead of each firing a separate `GET /api/boxes/:id`. This eliminates the 50+ duplicate box fetches observed when switching items (many list rows share the same shelf box).
   - **Current item highlighted**: `ItemList` reads `entityId` from `usePanelContext()` and adds `item-list-row--selected` CSS class + `aria-selected` attribute to the matching row. Blue left-border + tinted background makes the selected item visible at a glance.
   - **Box/shelf links fixed**: `ItemList` replaced `<Link to="/boxes/:id">` for the Behälter and Lagerort columns with `<button className="link-btn">` that call `setEntity('box', id) + setMainView('boxes')`, opening the box in the detail panel instead of a full-page navigation.
   - **Why:** Module-level promise sharing is the lightest-weight deduplication — no persistent cache, no TTL management; the cache entry is cleared when the promise settles, so subsequent renders always get fresh data. Panel-navigation buttons preserve left-column list state (filters, selection) where `<Link>` caused a full route change that wiped it.
   - **Deferred:** Double `/api/items` fetch (ItemDetail neighbor fetch fires on every item change) — tracked in todo.md item 0. Filter init `useEffect` re-running on panel param changes — tracked in todo.md item 0b.

## 727. ✅ Shopstatus modal for single items + tab persistence across list navigation
   - **Shopstatus**: `ShopStatusForm` and `ShopStatusValues` exported from `BulkItemActionBar`; `handleShopStatus` added to `ItemDetail` using the same dialog+`/api/items/bulk/update-ref` pattern as bulk; `onShopStatus` threaded through `agenticHandlersRef` and `ItemActionsContext`; ActionPanel reference-case Shopstatus button now calls `actions?.onShopStatus?.()` instead of navigating to the edit page.
   - **Tab persistence (X-Y navigation)**: `PanelContext.setEntity` now preserves `activeTab` when switching to a new entity of the same type; only resets to `DEFAULT_TAB` when changing entity type. This enables navigating through all items on (e.g.) the `attachments` tab without the tab resetting on each click.
   - **Why:** Reusing the existing bulk modal avoids duplicating form UI and avoids a separate PATCH endpoint; single-item is just `itemIds: [id]`. Preserving tab on same-type navigation uses `setState(prev => ...)` — a one-line change with no architectural impact.
   - **Deferred:** nothing deferred.

## 726. ✅ Root route, routing independence, action panel wiring, and in-panel navigation fixes
   - **Root route**: `/` now renders `ItemListPage` directly (no more LandingPage as default); `MainView` type drops `'dashboard'` — `/` and `/items` both map to `'items'`.
   - **`setEntity` auto-tab**: calling `setEntity('item', id)` now sets `activeTab = 'reference'` automatically (boxes get `'info'`); clicking a list row immediately opens the shell tab view rather than the legacy full-page fallback.
   - **Routing independence**: `setMainView` now preserves panel search params (`entity`, `id`, `tab`) when switching main views, so the right column stays stable when navigating the left panel. Uses a `stateRef` to avoid re-creating `setMainView` on every state change.
   - **Instance navigation**: `handleInstanceNavigation` uses `setEntity` when in shell mode (`activeTab !== null`), keeping navigation within the panel instead of doing a full `/items/:id` route push.
   - **KI action panel**: all four KI actions now wired — Starten, Abbrechen, Abschliessen, Löschen (conditional on `agenticCanStart/Cancel/Close/Delete`); `agenticCanClose` and `agenticCanDelete` added to `ItemActionsContext` and registered in `ItemDetail.setItemActions`.
   - **Reference action panel**: Bearbeiten + Shopstatus (navigates to edit page) + KI-Sync (agentic start, conditional) + Vorheriger/Nächster nav.
   - **Images/Attachments tabs**: no action panel (return null) — inline controls in the tab body are sufficient.
   - **`btn--primary` / `btn--danger`**: CSS BEM modifiers added to styles.scss (were used in ActionPanel but undefined).
   - **Why:** `stateRef` pattern in `setMainView` avoids adding `state` to the `useCallback` dep array (which would recreate the callback on every keystroke); the ref is updated every render so it always reads current state. Auto-tab on `setEntity` removes the legacy full-page fallback for list-row clicks without changing the `PanelState` shape.
   - **Deferred:** Shopstatus action navigates to the full edit page rather than a dedicated quick-toggle; a PATCH endpoint for just `Shopartikel`/`Veröffentlicht_Status` would allow an inline toggle without a page transition.

## 725. ✅ Shell UX pass: landing page stripped, tabs cleaned, action panel wired
   - **LandingPage** stripped to RecentBoxesCard + RecentEventsCard only; SearchCard and StatsCard moved to a self-fetching `DashboardPanel` that renders in the action column when `mainView === 'dashboard'` and no entity is selected; ImportCard removed (deferred to admin).
   - **ItemReferenceTab** now shows only the reference data table + ShopBadge/ZubehoerBadge; nav buttons and item UUID title removed; ← → "Vorheriger/Nächster" + "Bearbeiten" buttons added to action panel `reference` case; neighbor nav in shell mode now calls `setEntity` instead of `navigate` to stay within the panel.
   - **KI tab** AgenticStatusCard rendered with `noCollapse hideInlineActions` — no toggle, always expanded, Start/Cancel/Review buttons suppressed in the card (they are in the action panel). Action panel KI case adds compact ← → nav buttons alongside the start button.
   - **Exemplar tab** renamed to **Vorrat** in DetailTabBar; RelocateItemCard gated behind `showRelocate` state (default false); action panel `instance` case gets "Umlagern" button that sets `showRelocate=true`; relocation resets to false after completion or on item load.
   - **CSS**: `.app-shell__right .card` strips background/border/shadow/padding on ≥900px so right-column content is flat (no nested boxes in a narrow panel); `border-left` added to `.app-shell__right`; `.action-panel__nav-row` flex row for nav button pairs; `.item-reference-tab__badges` flex row for status badges.
   - **Why:** Cards are a mobile affordance — in a 400px sticky column on a large screen they add visual noise without adding structure. Scoped to `app-shell__right` only so main-panel cards keep their styling. DashboardPanel fetches its own data separately from LandingPage rather than a shared context to avoid coupling — both fetches fire in parallel on mount and the response is small.
   - **Deferred:** ImportCard placement (admin section not yet defined). SearchCard in ActionPanel still navigates to full-page routes — wire through `setEntity` in a follow-up. Agentic search-term input hidden when `hideInlineActions=true` — needs to move to action panel when re-enabled.

## 724. ✅ Fix PanelContext search-params collision that caused list refetch on every tab switch
   - **Why:** `ItemListPage` re-reads filters from URL on every `searchParams` change; wiping all params dropped the `box` filter, making `currentFilters` change, which triggered `loadItems`. Merging instead of replacing fixes the root cause without any change to `ItemListPage`. isMounted guard is preserved (skips initial write since state was derived from URL at mount).
   - **Deferred:** Per-tab lazy loading (each tab fetching only its own data) — the backend `GET /api/items/:id` currently returns everything in one payload; splitting requires either a new backend partial-fetch API or lazy tab-mount fetches for secondary data (media, attachments, accessories, events). Tracked in todo.md.

## 723. ✅ Fixed detail panel tab layout, added KI tab, moved SpecFieldModalState to ItemKiTab
   - **Why:** `landing-grid` is a full-page 2-column grid; inside the narrow panel it caused overflow. `panel-tab-body` flex column replaces it for panel-mode rendering. The KI tab gives users a dedicated surface for the agentic status card without burying it inside the reference tab. `initiallyExpanded` avoids an extra click on the card that is the primary content of the KI tab.
   - **Deferred:** nothing deferred.

## 722. ✅ UI shell redesign — close all three structural gaps (tab content split + action panel + navigation)
   - **Why:** Early-return pattern avoids replacing the 413-line legacy JSX block (error-prone) while still gating tabs; the null-tab fallback preserves full-page deep links. Inline gating (not sub-components) used for BoxDetail because it is ~1100 lines vs ItemDetail's ~4000 — the added conditions are readable without extraction. `BoxActionsContext` mirrors `ItemActionsContext`'s two-context split to prevent BoxDetail (writer) from re-rendering when ActionPanel (reader) updates. Shell-compatible URLs (search params) used for RecentEvents/RecentBoxes navigation rather than calling `setEntity + setMainView` imperatively, because `<Link>` preserves browser-native behaviors (tab, right-click open-in-new-tab) that `<button onClick>` loses.
   - **Deferred:** `item × attachments` and `item × accessories` action panel slots not wired — both cards already have inline upload/add buttons so duplication adds little value; wiring requires ref-threading through multiple component layers. Box `images` tab only shows on relocatable boxes (`isBoxRelocatable`), so shelves show an empty images tab; deferred until shelf photo support is clarified. Items and boxes still load in both the main panel and detail panel on direct `/items/:id` or `/boxes/:id` routes (double-fetch) — collapsing deferred as planned.

## 719. ✅ Cross-entity navigation and multi-item selection (Steps 8–9 of UI shell redesign)
   - **Why:** `mainView` is derived (not stored) from the pathname so no synchronization is needed between router state and PanelContext state; `setMainView` wrapping `navigate` ensures the URL always reflects the current main view. The two-context split in `BulkSelectionContext` mirrors `ItemActionsContext` to avoid re-rendering `ItemListPage` (writer) when `ActionPanel` (reader) updates. `BulkItemActionBar` is reused unchanged in the action panel rather than duplicating its handlers, satisfying the "reuse handlers" requirement without extracting shared utilities. The multi-item summary shows only identity (count + Artikel-Nummern), not reference data, matching the spec.
   - **Deferred:** Header nav links still use `<Link>` (React Router) rather than calling `setMainView` — the effect is identical since `setMainView` wraps `navigate`, so no behavioral difference. Mobile fallback for bulk actions (action panel hidden below 900px) deferred — `BulkItemActionBar` was removed from the main panel; mobile bulk-action UX is a known deferred concern per the planning doc. "Restart agentic" and "create transport" bulk actions listed in the planning matrix are not yet wired (those endpoints/features don't exist in `BulkItemActionBar`).

## 717. ✅ Move item creation to right-column state and fix ItemDetail hooks violation (Step 7 of UI shell redesign)
   - **Why:** `setCreateMode` encapsulates the non-entity (entityId=null) create state without needing a sentinel value; the `panel-create` CSS class uses `flex: 1 1 0` so it expands to fill the entire right column height; `onSaved`/`onCancel` props keep `ItemCreate` reusable for both full-page and panel contexts. The hooks fix moves computations that were always derived from already-available state (`agentic`, `item`) to before the early returns, eliminating the render-count change that React detects as a violation.
   - **Deferred:** The "Weiter erfassen" dialog path (reset form after save) does not call `onCancel`/`onSaved` so it resets the form in-place rather than navigating — consistent with the existing UX. Multi-step cancel (escaping mid-wizard) only exposes the button on the `basicInfo` step; other steps inherit the existing back-of-form navigation.

## 716. ✅ Wire box selection to detail panel (Step 6 of UI shell redesign)
   - **Why:** Mirrors the exact same `onSelect` / `setEntity` / panel-render pattern as Step 3 (items) to keep the shell architecture consistent. `BoxRoute` `useEffect` mirrors `ItemRoute` so direct-URL deep links populate the panel without changing the existing `/boxes/:id` route. Shelf detection (`S-` prefix) for the stubs tab reuses the same `isShelf` heuristic already used in `BoxDetail`. `BoxActionPanel` defers items/images/events/stubs action wiring because those require `BoxDetail` internal state (same deferred pattern as item tabs beyond `reference`/`instance`/`review`).
   - **Deferred:** On `/boxes/:id`, `BoxDetail` renders in both main panel and detail panel (double-fetch) — same known limitation as items, collapsing deferred to a later step. Tab-specific content in the panel body (each box tab showing its own slice) is deferred. Action wiring for box items/images/events/stubs tabs deferred. The inventory tab (InventoryCheckView) is also deferred as stated in planning doc.

## 715. ✅ Build tab bar and action panel (Steps 4–5 of UI shell redesign)
   - **Why:** Two-context split prevents ItemDetail from re-rendering when ActionPanel reads updated actions — a single context would cause ItemDetail (context consumer) to re-render on every action state update it writes. The mutable `agenticHandlersRef` pattern avoids converting all agentic handlers to `useCallback` (which would require large dependency lists and invasive ItemDetail changes); stable wrapper functions in `setItemActions` always delegate to the latest ref value.
   - **Deferred:** Tab-specific content in ItemDetail (each tab showing its own content slice) is deferred to a later step — all tabs currently show the same `ItemDetail` body. Action buttons for images/attachments/accessories tabs are not wired (those slots return null for now). Box, transport, and stub entity tab sets and action panels are not yet implemented (only `item` entityType handled). Relocate in the instance action slot requires RelocateItemCard integration — deferred.

## 714. ✅ Wire ItemList selection to detail panel (Step 3 of UI shell redesign)
   - **Why:** `onSelect` prop keeps `ItemList` reusable (falls back to `navigate` when not provided). `Layout` is the natural owner of panel rendering since it holds the `.panel-detail` DOM region and already sits inside `PanelProvider`. `ItemRoute` effect fires after the route renders so the existing `/items/:id` page continues to work while also populating the panel.
   - **Deferred:** On `/items/:id`, `ItemDetail` renders in both the main panel and the detail panel (double-fetch); collapsing this to panel-only rendering is deferred to a future step. Panel search params conflict with item-list filter deep-link params (e.g. `?box=B-001`) — `PanelContext` replaces all search params on state change; this is a known limitation deferred to a later integration step. Tab switching and action panel wiring are Steps 4–5.

## 713. ✅ Create `PanelContext` (Step 2 of UI shell redesign)
   - **Why:** Flat shape avoids nesting that would complicate URL serialization; `isMounted` ref skips the initial URL write since state is derived from the URL at mount, preventing a no-op `setSearchParams` call. `PanelProvider` sits inside `Router` so it can call `useSearchParams` directly.
   - **Deferred:** No panels wired to this context yet — that is Steps 3+. Mobile layout and multi-selection entity-type enforcement are out of scope for this step.

## 712. ✅ Add two-column right-split CSS shell layout (Step 1 of UI shell redesign)
   - **Why:** Establishes the structural CSS regions needed by future steps that will wire state/context into the right panels; keeping panels empty now avoids any behavioral change for existing routes.
   - **Deferred:** State/context wiring, content routing into `.panel-detail` / `.panel-action` — explicitly out of scope for Step 1.

## 71. ✅ Create `docs/PLANNING_UI_ARCHITECTURE.md`: full view inventory with contents, flows, and cross-view navigation map, including planned transport/stub/inventory surfaces.
   - **Why:** The card layout and wide spacing no longer fit the growing information density. This document is the base for a UX redesign pass — it captures current state and upcoming additions before layout decisions are made.
   - **Deferred:** Layout/component redesign itself; that follows from UX decisions the user will derive from this document.

## 52. ✅ Align muted status text rows horizontally across the `Statistiken` card and further prioritize the pie by shrinking legend footprint to hover-only color dots.

## 51. ✅ Enlarge the `Statistiken` pie chart and compact the legend into bottom color-coded chips with hover-only value display to improve at-a-glance readability while keeping layout minimal.

## 50. ✅ Adjust `Statistiken` card layout so the agentic pie chart occupies the right half of the card at desktop widths, while preserving compact stacked behavior on smaller screens.

## 49. ✅ Add a minimal `Statistiken` pie-chart slice overview for agentic run states in `frontend/src/components/StatsCard.tsx` backed by a small aggregate payload in `backend/actions/overview.ts`, with guarded logging/error handling and a follow-up-ready shape for optional future layers (`shopArtikel`, quality).

## 50. ✅ Treat item-list deep-link query sessions as URL-authoritative (skip localStorage restoration when URL filters are present) and highlight active filter indicator with box-color background for provenance clarity.

## 49. ✅ Add URL query filter bootstrap on item list mount (URL `box`/`boxFilter` takes precedence over stored/default filters), with defensive parsing/logging and staged-input consistency preserved.
