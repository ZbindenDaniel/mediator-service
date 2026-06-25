# Changelog: QR Codes & Scanning

Covers: QR code generation, scanner workflows, scan audit logging, search-scan mode, return-to routing.

---

## 765. ✅ Four v3.0 release bugs fixed: mobile QR scan button added to header
   - **Why (mobile scan):** No QR scan button existed in the Header for general navigation. Added `QrScanButton` (mobile-only) to the header nav; after scan the scanner navigates to `/items/{id}` or `/boxes/{id}` which `ItemRoute`/`BoxRoute` handle with `setEntity` + `mobileShowDetail=true`.
   - **Deferred:** Artikel_Nummer attachment routing still goes to instance endpoint (label-only, unchanged from step 760).

## 752. ✅ Pre-release cleanup: QR search-scan CSS + EventLog empty state
   - **Why:** `.search-target-hint` / `.search-mismatch` classes were applied in `QrScannerPage` but had no CSS rules (deferred in step 751); added amber color for mismatch and muted gray for the search target hint, matching the existing `.qr-scanner` status palette. `ItemEventsTab` and `BoxDetail` events render silently produced an empty area when the events array was empty; added "Keine Aktivitäten." empty-state text to make the blank-vs-no-data distinction visible.
   - **Deferred:** If the events array is empty due to a deeper data-fetch regression (rather than genuinely no events), that path still needs investigation — the empty state now makes it visible instead of invisible.

## 751. ✅ QR search-scan mode: continuous scan resolves on target match with audio+vibration feedback
   - **Why:** Operators needed a "find this item/box" flow — scan QR codes until the right one is found, with instant tactile+audio confirmation. Reused the existing `QrScannerPage` + `QrScanButton` infrastructure; added a `searchTarget` URL param and `'search'` intent. On mismatch the camera stays open and a 1.5 s cooldown prevents re-triggering the same code while it's still in frame. Web Audio API + `navigator.vibrate` are used for feedback; both degrade gracefully if unavailable. "Finden" button added to the item instance tab (hidden when out-of-stock) and to the box/shelf tab-actions.
   - **Why (approach):** All new logic is behind a `searchTarget` guard — zero change to existing scan flows. Module-level feedback helpers avoid repeated AudioContext allocations. The `skipDetectionRef` cooldown ref (not state) avoids re-renders during the scan loop.
   - **Deferred:** No CSS added for `.search-target-hint` / `.search-mismatch` — these class names are in place for styling follow-up. The "Finden" button inherits `mobile-only` from QrScanButton (desktop operators can read the ID visually). No shelf-specific label override (uses `BoxID` for shelves).
