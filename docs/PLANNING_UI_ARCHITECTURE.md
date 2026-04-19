# UI Architecture & View Planning

_Status: Draft · Date: 2026-04-19_

---

## Purpose

This document maps every view in the application — what it contains, which flows it participates in, and how it connects to other views. It is the foundation for a UX redesign that moves away from the current card-heavy, wide-spacing layout toward a denser, more information-efficient interface.

Upcoming features (transport, stub boxes, inventory) are included so the redesign can account for them from the start.

---

## Navigation Structure (current)

```
Header (persistent)
├── Home               → /
├── + Artikel          → /items/new
├── Artikelliste       → /items
├── Behälterliste      → /boxes
└── Aktivitäten        → /activities

Hidden / direct-access only
├── /items/:id         ItemDetail
├── /items/:id/edit    ItemEdit
├── /boxes/:id         BoxDetail
├── /boxes/:id/edit    BoxEdit
├── /scan              QrScannerPage
├── /chat              ChatPlaceholder
└── /admin/shelves/new ShelfCreateForm
```

**Planned additions (transport + stubs):**
```
Header additions
├── Transporte         → /transports        (new)
└── Lagerbegehung      → /stubs             (new)
```

---

## Views Index

| # | View | Route | Type |
|---|------|-------|------|
| 1 | LandingPage | `/` | Dashboard |
| 2 | ItemListPage | `/items` | List |
| 3 | ItemCreate | `/items/new` | Form / Wizard |
| 4 | ItemDetail | `/items/:id` | Detail |
| 5 | ItemEdit | `/items/:id/edit` | Form |
| 6 | BoxListPage | `/boxes` | List |
| 7 | BoxDetail | `/boxes/:id` | Detail |
| 8 | BoxEdit | `/boxes/:id/edit` | Form |
| 9 | QrScannerPage | `/scan` | Tool |
| 10 | RecentActivitiesPage | `/activities` | Log |
| 11 | ChatPlaceholder | `/chat` | Tool (MVP) |
| 12 | ShelfCreateForm | `/admin/shelves/new` | Admin Form |
| — | TransportListPage | `/transports` | List (planned) |
| — | TransportDetail | `/transports/:id` | Detail (planned) |
| — | StubManagementPage | `/stubs` | List (planned) |
| — | InventoryCheckView | `/inventory/:boxId` | Tool (planned) |

---

## Views (detailed)

_Each view section covers: what is on it · which flows it participates in · incoming/outgoing navigation._

---

### 1. LandingPage `/`

**Contents**
- System stats (item count, box count, unplaced items, printer health)
- CreateItemCard — embedded item creation wizard
- SearchCard — search items/boxes by text or QR scan
- RecentBoxesCard — list of recently touched boxes
- RecentEventsCard — live activity feed (last N events)
- ImportCard — CSV/ZIP import trigger
- StatsCard — agentic run pie chart + service health

**Flows**
- Entry point for quick item intake (CreateItemCard launches ItemCreate wizard inline)
- Search/scan shortcut that resolves directly to ItemDetail or BoxDetail
- Import entry point (triggers CSV import dialog)
- Dashboard monitoring (stats, events, printer status)

**Navigation out**
- → ItemDetail (search result or recent event tap)
- → BoxDetail (recent box tap)
- → /items/new (full-page create)
- → /activities (see all events)

---

### 2. ItemListPage `/items`

**Contents**
- Filter bar: text search, subcategory, box, stock, agentic status, shop/publication, placement, image, quality threshold
- Sort controls: multiple keys + direction toggle
- Item list (grouped display with checkboxes for bulk select)
- BulkItemActionBar (visible when items are selected): agentic start/restart, export CSV, transport creation (planned)
- Filter state indicator in header (synced to localStorage)

**Flows**
- Primary browse + triage surface for all items
- Bulk agentic operations (start, restart, cancel enrichment)
- Entry point for bulk transport creation (planned: bulk select → "Transport erstellen")
- Deep-link filter target (URL params set box/filter context from BoxDetail or external links)

**Navigation out**
- → ItemDetail (row tap)
- → ItemCreate (/items/new button)
- → TransportDetail (after bulk transport creation — planned)

---

### 3. ItemCreate `/items/new`

**Contents**
Multi-step wizard:
1. BasicInfoForm — description, category, subcategory, quality, location/box, dimensions, weight
2. QualityReviewStep — quality confirmation
3. ItemMatchSelection — similar items picker (deduplicate)
4. AgenticPhotos — camera capture
5. ManualEdit — final review before save

Also embeddable inline on LandingPage (CreateItemCard).

**Flows**
- Primary intake path for new physical items
- Can be triggered from LandingPage (embedded) or directly via nav
- Auto-print label on completion if configured

**Navigation out**
- → ItemDetail (after successful save)
- → / (cancel from embedded mode)

---

### 4. ItemDetail `/items/:id`

**Contents**
- Item header: Artikel-Nummer, description, quality badge, shop badge, zubehoer badge
- Location: current box/shelf with LocationTag (tappable → BoxDetail)
- Media gallery (photos)
- Agentic section: status, run controls (trigger / review / restart / cancel), metrics, spec review modal
- Relocation card (RelocateItemCard)
- Reference search (RefSearchInput — find similar items in system)
- Event log
- Edit / delete actions

**Flows**
- Central detail surface; reached from list, search, QR scan, agentic review queue
- Agentic review flow: trigger → running → needs_review → approve/reject → approved/rejected
- Relocation flow: pick target box → confirm move
- Pending transport badge (planned: if item has a pending transport, badge links to TransportDetail)

**Navigation out**
- → BoxDetail (LocationTag tap)
- → ItemEdit (/edit)
- → TransportDetail (pending transport badge — planned)
- → /items (back to list)

---

### 5. ItemEdit `/items/:id/edit`

**Contents**
- Full item form (ItemForm or ItemForm_agentic)
- All editable fields including Shopartikel toggle, Veröffentlich-Status toggle
- Photo management

**Flows**
- Reached only from ItemDetail edit action

**Navigation out**
- → ItemDetail (save or cancel)

---

### 6. BoxListPage `/boxes`

**Contents**
- Search input
- Type filter: all / boxes / shelves
- Location filter dropdown
- Sort controls
- Box/shelf list rows with: ID, label, location, item count, quality badges

**Planned additions**
- Filter chip: "Inventory pending" (amber badge on rows)
- Filter chip: "Has active stubs" (shows shelves with open stubs)
- Sort: last inventory date

**Flows**
- Browse all storage containers
- Entry point for shelf/box management
- Inventory day workflow: filter inventoryPending → work through list (planned)

**Navigation out**
- → BoxDetail (row tap)
- → ShelfCreateForm (/admin/shelves/new)

---

### 7. BoxDetail `/boxes/:id`

**Contents**
- Box/shelf header: BoxID, label, location, notes
- Contained items list (grouped, with quality badges and location tags)
- Contained boxes (for shelves: list of boxes on shelf)
- Relocation card (RelocateBoxCard)
- Add item to box dialog
- Print label button
- Event log

**Planned additions (transport)**
- "Transport ausstehend" badge/banner if a pending transport references this box/shelf
- "Transport erstellen" button (next to Verschieben)

**Planned additions (stubs — shelves only)**
- "HasActiveStubs" amber badge
- Stub list section showing active stubs for this shelf
- "+ Stub hinzufügen" button

**Planned additions (inventory)**
- LastInventoryDate field in metadata
- "Inventory pending" banner with [Start Inventory] button

**Flows**
- Box contents review and management
- Item relocation source/target
- Transport creation entry point (planned)
- Stub creation entry point (planned)
- Inventory trigger entry point (planned: passive prompt via QR scan or manual start)

**Navigation out**
- → ItemDetail (item row tap)
- → BoxEdit (/edit)
- → BoxDetail (for boxes on a shelf: nested box tap)
- → TransportDetail (transport badge — planned)
- → InventoryCheckView (inventory start — planned)

---

### 8. BoxEdit `/boxes/:id/edit`

**Contents**
- Box property form: label, notes, location override

**Flows**
- Reached only from BoxDetail edit action

**Navigation out**
- → BoxDetail (save or cancel)

---

### 9. QrScannerPage `/scan`

**Contents**
- Camera viewfinder with BarcodeDetector
- QR payload display (toggle)
- Intent handling: add-item, relocate-box, shelf-add-box

**Planned additions (inventory)**
- After box scan resolves: check InventoryPending flag in response
- If pending: show interstitial prompt [Start check now] / [Skip]

**Flows**
- Universal scan entry point; navigates to correct destination based on QR payload
- Can be called with a return callback (e.g. target shelf picker during relocation)
- Planned: inventory interstitial before BoxDetail navigation

**Navigation out**
- → ItemDetail (item QR)
- → BoxDetail (box QR)
- → InventoryCheckView (if inventory pending + user confirms — planned)
- Returns to caller if launched with callback

---

### 10. RecentActivitiesPage `/activities`

**Contents**
- Search by item/box/shelf ID
- Actor filter
- Result limit control
- Chronological event list

**Flows**
- Audit and investigation surface
- Reached from LandingPage "see all" or header nav

**Navigation out**
- → ItemDetail (event tap)
- → BoxDetail (event tap)

---

### 11. ChatPlaceholder `/chat`

**Contents**
- Chat thread (session-scoped)
- Agentic query suggestions
- Dry-run mode (no DB writes)

**Flows**
- Exploratory / debugging tool; not part of main operational flows

---

### 12. ShelfCreateForm `/admin/shelves/new`

**Contents**
- Location selector
- Floor selector
- Label and notes inputs
- User confirmation

**Flows**
- Admin-only shelf provisioning
- Reached from BoxListPage or direct URL

**Navigation out**
- → BoxDetail (new shelf) or BoxListPage (cancel)

---

### 13. TransportListPage `/transports` _(planned)_

**Contents**
- Transport list filterable by state (default: pending), location, reference
- Each row: TransportID, source → target, item count, state badge, date
- State filter tabs or chips: pending / done / cancelled

**Flows**
- Primary transport management surface
- Completion entry point: select pending transport → TransportDetail → complete
- Reached from header nav

**Navigation out**
- → TransportDetail (row tap)

---

### 14. TransportDetail `/transports/:id` _(planned)_

**Contents**
- Header: TransportID, state badge, source → target, reference, note, timestamps
- Item/box list of what is (or was) moved
- For pending: "Abschliessen" button → completion dialog (shelf picker + QR scan + override confirmation)
- For pending: "Abbrechen" button
- For completed with override: shows planned target struck through → actual target

**Flows**
- Transport completion flow: review items → confirm/override target shelf → backend relocates
- Stub auto-resolve triggered on completion (backend side)

**Navigation out**
- → BoxDetail (source/target shelf taps)
- → ItemDetail (item row taps)
- → TransportListPage (back)

---

### 15. StubManagementPage `/stubs` _(planned)_

**Contents**
- List of active stubs (default: isActive=true)
- Rows grouped by shelf (distinct background per shelf)
- Each row: shelf label, description excerpt, loose item count, loose box count, photo thumbnail, created by/date
- Search: keyword, shelf ID
- Filter: active only / all

**Flows**
- Warehouse walk-through planning surface
- Transport creation entry point: stub row → detail → "Transport erstellen" (pre-fills SourceId = stub.ShelfId)

**Navigation out**
- → BoxDetail (shelf label tap)
- → TransportDetail (after transport creation)

---

### 16. InventoryCheckView `/inventory/:boxId` _(planned)_

**Contents**
- Item checklist: all instances in box; each row has thumbnail, Artikel-Nummer, description, status icon (unchecked / confirmed / missing)
- Menge items: numeric count input instead of checkbox
- Persistent scan zone (camera; does not navigate on match)
- Acoustic feedback (success / mismatch tones)
- "Mark remaining as missing" bulk action
- Complete / Cancel buttons; Complete shows summary dialog first

**Flows**
- Passive inventory: entered from QrScannerPage interstitial; exits back to BoxDetail
- Active inventory day: entered from BoxListPage inventoryPending filter; exits back to BoxList, advances to next box

**Navigation out**
- → BoxDetail (complete in passive mode)
- → BoxListPage (complete in active mode)
- → ItemDetail (misplaced item flow: "Move here" action)

---

## Cross-View Flows Summary

| Flow | Views involved |
|------|---------------|
| Item intake | LandingPage → ItemCreate → ItemDetail |
| Item intake (full page) | ItemListPage → ItemCreate → ItemDetail |
| Agentic enrichment | ItemDetail (trigger) → ItemDetail (review modal) |
| Item relocation | ItemDetail / BoxDetail → QrScannerPage → BoxDetail |
| Box relocation | BoxDetail → QrScannerPage → BoxDetail |
| QR scan navigation | QrScannerPage → ItemDetail / BoxDetail |
| Bulk agentic | ItemListPage (select) → ItemListPage (result) |
| Bulk transport creation | ItemListPage (select) → TransportDetail _(planned)_ |
| Transport from shelf/box | BoxDetail → TransportDetail _(planned)_ |
| Transport completion | TransportListPage → TransportDetail → (complete dialog) → BoxDetail _(planned)_ |
| Stub creation | BoxDetail (shelf) → StubManagementPage _(planned)_ |
| Stub → transport | StubManagementPage → TransportDetail _(planned)_ |
| Passive inventory | QrScannerPage → InventoryCheckView → BoxDetail _(planned)_ |
| Active inventory day | BoxListPage → InventoryCheckView → BoxListPage _(planned)_ |
| Import | LandingPage (ImportCard) → (dialog) → LandingPage |
| Admin shelf create | BoxListPage → ShelfCreateForm → BoxDetail |

---

## Notes for Redesign

- The current card grid on LandingPage (CreateItemCard, SearchCard, StatsCard, etc.) spreads sparse content over a large vertical area. A denser dashboard structure — sidebar, toolbar, or compact panel layout — would better suit the operational nature of the app.
- ItemDetail and BoxDetail are the two most-visited surfaces. They carry the most content and will grow further with transport badges, stub sections, and inventory banners. These need a structured column or tab layout, not stacked cards.
- The filter bar on ItemListPage has accumulated many controls. A collapsible or drawer-based filter panel would recover list vertical space.
- BoxDetail serves double duty for both regular boxes and shelves. Shelf-specific sections (stubs, contained boxes, inventory) will make this split more visible. A conditional section approach — or separate shelf detail layout — should be evaluated.
- Navigation: adding Transporte and Lagerbegehung brings the header nav to 6 items. Icon-only header nav becomes ambiguous at that count; a labeled sidebar or bottom nav should be considered.
