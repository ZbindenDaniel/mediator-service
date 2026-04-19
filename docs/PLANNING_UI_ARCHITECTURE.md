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

This is the operational dashboard. Cards are an appropriate building block here but the layout should be more dashboard-like — e.g. a multi-column grid with panels of varying weight rather than a vertical card stack.

**Contents (current → to redesign)**
- System stats (item count, box count, unplaced items, printer health)
- ~~CreateItemCard~~ — **remove**: item creation moves to the nav (header + button)
- ~~SearchCard~~ — **relocate**: search belongs in the header or a persistent global search bar; needs a decision on behavior in views where a local search already exists (item list, box list)
- RecentBoxesCard — recent boxes panel; keep
- RecentEventsCard — activity feed panel; keep
- ~~ImportCard~~ — **move to admin page**
- StatsCard — agentic pie chart + service health; keep

**Open questions for redesign**
- Where does global search live? Header bar (always visible) or a search shortcut in the nav? If in the header, how does it coexist with the local search on ItemListPage/BoxListPage?
- Dashboard layout: two-column (stats left, activity right)? Priority panels vs equal-weight cards?

**Flows**
- Dashboard monitoring (stats, events, printer status)
- Quick navigation hub to most recent/relevant items and boxes

**Navigation out**
- → ItemDetail (recent event or search result tap)
- → BoxDetail (recent box tap)
- → /activities (see all events)

---

### 2. ItemListPage `/items`

The list itself works well. The main pain points are mobile usability and the action bar behavior.

**Contents**
- Filter bar: text search, subcategory, box, stock, agentic status, shop/publication, placement, image, quality threshold
- Sort controls: multiple keys + direction toggle
- Item list (grouped display with checkboxes for bulk select)
- BulkItemActionBar (visible when items are selected): agentic start/restart, export CSV, transport creation (planned)
- Filter state indicator in header (synced to localStorage)

**Layout issues to address**
- **Mobile**: filter bar and action bar consume too much vertical space; filter controls are badly structured on small screens. Consider a collapsible filter drawer / filter icon that opens a panel, freeing the list area on mobile.
- **BulkItemActionBar**: currently pushes list content down when it appears, causing layout shift. Should be **sticky/overlapping** (fixed position, overlays list bottom) so it does not reflow the page.

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
2. QualityReviewStep — quality confirmation _(work in progress; flow is stable, visual design is not final)_
3. ItemMatchSelection — similar items picker (deduplicate)
4. AgenticPhotos — camera capture
5. ManualEdit — final review before save

The embedded LandingPage variant (CreateItemCard) is **removed** — creation is now nav-initiated only.

**Flows**
- Primary intake path for new physical items
- Triggered from nav (+ button) or directly via /items/new
- Auto-print label on completion if configured

**Navigation out**
- → ItemDetail (after successful save)
- → /items (cancel)

---

### 4. ItemDetail `/items/:id`

This view will undergo the largest changes. It is already dense and the current stacked layout does not carry it well. The contents need to be regrouped before any visual changes can succeed.

**Contents (current)**
- Item header: Artikel-Nummer, description, quality badge, shop badge, zubehoer badge
- Location: current box/shelf with LocationTag (tappable → BoxDetail)
- Media gallery (photos)
- Agentic section: status, run controls (trigger / review / restart / cancel), metrics, spec review modal
- Relocation card (RelocateItemCard)
- Reference search (RefSearchInput — find similar items in system)
- Event log
- Edit / delete actions

**Regrouping proposal**
The view conflates two conceptually different concerns that may deserve separation or at least visual grouping:

- **ItemRef data** (reference article information — Langtext, specs, shop metadata, agentic enrichment): shared across all instances of this article. This is the "what is this thing" layer.
- **ItemInstance data** (physical instance — location, condition, stock count, relocation, transport, event log): specific to this one physical object. This is the "where is this object and what happened to it" layer.

Options to consider:
1. **Tab layout** — "Artikel" tab (ref data, agentic, media) / "Exemplar" tab (instance data, location, events)
2. **Two-column layout** — ref data left column, instance data right column (desktop only)
3. **Section headers with visual weight** — keep single scroll but with clear section separators

**Actions grouping**
Currently actions (edit, relocate, agentic trigger, delete) are scattered near their related data. Consider an **action bar or action panel** that groups all mutations in one place, separate from the display content.

**Pending transport** (planned): badge in instance section linking to TransportDetail.

**Flows**
- Central detail surface; reached from list, search, QR scan, agentic review queue
- Agentic review flow: trigger → running → needs_review → approve/reject → approved/rejected
- Relocation flow: pick target box → confirm move
- Pending transport badge (planned)

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

---

## New Shell Architecture (decided)

### Layout

Two columns, right column split into two rows by the golden ratio:

```
┌──────────────────────┬─────────────────┐
│                      │  Detail / Tabs  │
│   Main  (~62%)       │    (~24%)       │
│                      ├─────────────────┤
│                      │  Actions        │
│                      │    (~14%)       │
└──────────────────────┴─────────────────┘
```

The main panel always shows the active list (ItemList, BoxList, StubList, ActivityList) or a dashboard/admin grid. It never navigates away — it stays mounted and reflects live state changes (new items appear, agentic badges update).

The detail and action panels are driven by selection state. If `action` resolves to nothing for a given context, the action panel is not rendered and the detail panel expands to fill the right column.

### Selection state (`PanelContext`) — flat, URL-synced

```ts
{
  entityType:     'item' | 'box' | 'transport' | 'stub' | null
  entityId:       string | null        // null when multiSelection is active
  activeTab:      string | null
  multiSelection: string[] | null      // IDs; always same entityType; mutually exclusive with entityId
}
```

The URL mirrors this state for deep links and back-button support. Navigation is primarily state changes; the URL updates as a side effect. On load from a deep link the URL is deserialized into selection state and panels render from that.

### Navigation paradigm

Clicking any entity reference (e.g. a box link inside item detail) **switches the main panel to that entity's list and sets the entity as active**. This keeps navigation consistent: main panel = list context, detail panel = selected entity, no special cases.

Example: clicking the box reference on an item detail → main panel switches to BoxList with `B-001` active, detail panel shows BoxDetail for `B-001`.

### Creation flow

`+` in the nav sets `entityType: 'item', entityId: null, activeTab: 'create'`. The creation form occupies the full right column (detail + action slots merged). The main panel (ItemList) stays visible and live. On save, the new entity is activated: `entityId` is set to the new ID, right column switches to the new item's detail view. The item also appears in the list immediately.

Creation is not a separate page route — it is a right-column state.

### Activity list navigation

Clicking an event in the activity list activates the related entity exactly as if it were clicked from its own list — no special case. The main panel switches to the relevant list (ItemList or BoxList), the detail panel loads the entity. Already-established routing for Artikelnummer navigation applies here too.

### Full-page exceptions (shell not applied)

| Route / context | Reason |
|---|---|
| `/scan` — QrScannerPage | Mobile only; mobile uses a different layout entirely |
| InventoryCheckView | Mobile: full-page navigation. Desktop: rendered as a tab inside BoxDetail (detail panel), not a separate route |

### Mobile

Mobile uses a separate layout paradigm — the three-panel shell is not applied below the breakpoint. On mobile:
- Only one panel is visible at a time
- Selecting an entity navigates full-screen to its detail view (stacked on browser history)
- The action panel becomes a bottom sheet or button group at the bottom of the detail view
- Back button returns to the list view
- QR scanner is the primary discovery flow (vs. tree/list browsing on desktop)
- InventoryCheckView is a full-page route on mobile

Mobile-specific use cases, allowed routes, and transition handling need a dedicated planning pass before implementation.

### Tab sets per entity type

**Item** (detail panel tabs)

| Tab | Content | Visibility |
|---|---|---|
| `reference` | Ref data: Langtext, specs, shop metadata | Always |
| `instance` | Physical instance: location, condition, stock count | Always |
| `review` | Agentic review checklist | Only when `AgenticStatus === 'needs_review'` |
| `images` | Media gallery | Always |
| `attachments` | Documents and files | Always |
| `accessories` | Linked accessory items | Always |
| `events` | Event log | Always |

**Box / Shelf** (detail panel tabs)

| Tab | Content |
|---|---|
| `info` | Box metadata, location, notes |
| `images` | Photos and notes |
| `items` | Contained items list |
| `inventory` | InventoryCheckView (desktop only — full-page on mobile) |
| `events` | Event log |

Shelves additionally show: `stubs` tab (active stubs for this shelf).

**Transport**

| Tab | Content |
|---|---|
| `info` | Source → target, reference, state, timestamps |
| `items` | Items/boxes included in transport |

**Stub**

| Tab | Content |
|---|---|
| `info` | Description, counts, created by/date |
| `images` | Photo if present |

### Action panel matrix

Actions render based on `entityType + activeTab`. Empty cell = no action panel rendered for that combination.

| Entity | Tab | Actions |
|---|---|---|
| Item | reference | Trigger agentic run, upload ref image, upload ref file |
| Item | instance | Relocate, create transport, print label, upload instance attachment |
| Item | review | Approve, reject, review checklist inputs |
| Item | images | Upload image, set primary image |
| Item | attachments | Upload, delete |
| Item | accessories | Add accessory, link existing item as accessory |
| Item | events | — |
| Box | info | Edit, relocate box, print label |
| Box | items | Add item to box, create transport |
| Box | images | Upload photo, add note |
| Box | inventory | Complete, cancel, mark-all-missing |
| Box | events | — |
| Stub | any | Create transport |
| Transport | any | Complete (if pending), cancel (if pending) |
| **Multi-item** | — | Start/restart agentic, relocate, create transport, export CSV |

### Implementation steps

1. **Shell CSS layout** — two-column golden-ratio grid, right column split into rows. Existing full-page views render in main at full width. No behavior change.
2. **`PanelContext`** — React Context holding selection state. URL sync (serialize on change, deserialize on load). No panels wired yet.
3. **ItemList → detail panel** — ItemList gets `onSelect` callback. Clicking a row sets context instead of navigating. Detail panel renders `ItemDetail` for selected ID. Main panel stays mounted.
4. **Action panel for item context** — action panel subscribes to context, renders correct action set per `entityType + activeTab`.
5. **Tab switching** — detail panel renders tab bar; tab change updates `activeTab` in context; action panel re-renders.
6. **Box context** — same pattern: BoxList → BoxDetail in detail panel, BoxActions in action panel.
7. **Creation flow** — `+` nav sets create state, right column merges into creation form, on save activates new entity.
8. **Cross-entity navigation** — clicking a box reference from item detail switches main panel to BoxList and activates that box.
9. **Multi-selection** — selecting multiple rows sets `multiSelection`, detail panel renders multi-entity view, action panel shows bulk actions.
10. **Mobile layout** — breakpoint-based shell switch; per-panel full-screen rendering with history stack navigation.
11. **Full-page exceptions** — QR scanner, InventoryCheckView (mobile) bypass the shell.
- Navigation: adding Transporte and Lagerbegehung brings the header nav to 6 items. Icon-only header nav becomes ambiguous at that count; a labeled sidebar or bottom nav should be considered.
