# Changelog: Item Lifecycle

Covers: item creation, editing, quality assessment, specs, accessories, spare parts, item list, item detail.

---

## 853. ✅ Component relocation now marks parent device incomplete; better Artikelbeschreibung suggestions
   - **Why:** (1) `move-item.ts` now checks if the relocated item was an `erfasst` (BoxID=NULL) component (`Zerlegt_aus` relation) before moving. If so, it inserts a quality assessment marking the parent as Ersatzteil (value=1, is_complete=false) and logs `SparePartRemoved` — mirroring `remove-from-device.ts`. This covers the "Entnehmen" path (which calls plain `/move` via `RelocateItemCard`) and any other relocation that bypasses the strict `remove-from-device` endpoint. (2) `SparepartSlotPopup` "Neu anlegen" description now pre-fills as `{deviceLabel} {specValues} {slotLabel}` (e.g. "Lenovo T14 CH Tastatur") instead of just `{deviceHersteller} {slotLabel}`.
   - **Deferred:** Nothing.

## 852. ✅ Accessories tab: popup transparency, toggle UX, Entnehmen modal, DB crash fix
   - **Why:** (1) `item_refs` INSERT had `CreatedAt`/`UpdatedAt` columns that don't exist — dropped them. (2) `SparepartSlotPopup` rendered a `.card` with `position:absolute` inside the portal's `.dialog-content`, causing transparent/broken appearance — removed the wrapper, search now uses slot label only, rows are clickable (no per-row confirm button), `RefSearchInput` always visible. (3) Portal `_extra` key lookup stripped suffix before `find()` so extra-instance popup works through the portal instead of inline. (4) Entnehmen inline table row form replaced with `RelocateItemCard` in a portal modal. (5) Ja/Nein toggle uses mint green (Ja active) / orange (Nein active); clicking the active state clears the answer — no separate release button.
   - **Deferred:** Nothing.

## 851. ✅ Accessories tab bug-fix round 2
   - **Why:** (1) `new-ref` INSERT used `"SubCategory"` which doesn't exist on `item_refs`; fixed to `"Unterkategorien_A"`. (2) `noLink: true` added to `AssemblyPart` and set on storage slots — SSD/HDD spec answers are sufficient without an item link; hides Erfassen button for storage. (3) "Nicht vorhanden" state now shows ✎ reset button that clears the answer and re-renders the question widget. (4) `canErfassen` now includes `removed` state — extracting a part no longer locks out re-cataloging. (5) Boolean Ja/Nein buttons in ZubehoerCard inline widget now use `quality-review-step__toggle-group` + `--active` CSS classes (same as QualityReviewStep) for proper toggle switch appearance. (6) `specQuestion` (e.g. drive_type) now renders inline for `present`/`unknown`/`removed` states.
   - **Deferred:** Nothing new.

## 850. ✅ Assembly contract, unified component UX, Zerlegen tab restructure
   - **Why:** Three overlapping contracts (quality, specs, disassembly) described component data redundantly. Consolidated: assembly contract owns all component questions (presence + specs); quality contract covers device health only; spec contract covers device-level agentic fields. ZubehoerCard restructured: component slots primary, "Weitere Verknüpfungen" collapsed. Slot states (unknown/present/empty/cataloged/removed) drive inline Erfassen flow. Three-path Erfassen: one-click when Ersatzteil ref known, popup search, "Neu anlegen" for unknown refs. Inline quality answering in slots. Intake API pre-fills assembly answers from scan data. Low-quality nudge in QualityReviewModal suggests component cataloging. Sold-as-is cascade deletes unextracted spare parts.
   - **Deferred:** Multiple linked items per slot (multipleAllowed UI beyond first instance); `keyboard_layout` inline answer in keyboard slot; contracts for categories beyond 201/102; removing RAM/Speicher/Akku from specs/201.json (still lists them — safe since assembly answers take precedence).
