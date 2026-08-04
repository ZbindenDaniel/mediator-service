# frontend/src/components/

## Purpose
All React UI components for the application — organized by feature area in sub-folders.

## Contents

**Root-level (cross-cutting / page-level)**
- `App.tsx` — root router and layout shell
- `Layout.tsx` / `Header.tsx` — app chrome
- `ItemList.tsx` / `ItemListPage.tsx` — item browse and filter
- `ItemDetail.tsx` — item detail view (tabs, agentic status, quality, media)
- `BoxList.tsx` / `BoxListPage.tsx` / `BoxDetail.tsx` — box management
- `ItemCreate.tsx` — item creation wizard (artikelLookup → quality → basicInfo)
- `QrScannerPage.tsx` / `PlacementScanView.tsx` — QR scanner flows
- `DashboardPanel.tsx` / `OverviewPanel.tsx` / `StatsCard.tsx` — dashboard
- `RecentActivitiesPage.tsx` / `RecentEventsCard.tsx` — activity log
- `HilfePage.tsx` — user help pages (renders markdown docs)
- `AdminPage.tsx` — admin panel
- `LoadingPage.tsx` / `ChatPlaceholder.tsx` — system states
- `ImportCard.tsx` — CSV import UI
- Agentic: `AgenticStatusCard.tsx`, `AgenticReviewMetricsRows.tsx`, `AgenticSpecFieldReviewModal.tsx`, `ItemForm_agentic.tsx`
- Item actions: `EditInstanceCard.tsx`, `ItemEdit.tsx`, `ItemForm.tsx`, `ItemBasicInfoForm.tsx`, `ItemMatchSelection.tsx`
- Media: `ItemMediaGallery.tsx`, `PhotoCaptureModal.tsx`, `AttachmentsCard.tsx`, `AttachmentBindingModal.tsx`
- Printing: `PrintLabelButton.tsx`
- Spare parts: `SparepartSlotPopup.tsx`, `ZubehoerCard.tsx`, `ZubehoerBadge.tsx`
- Badges: `QualityBadge.tsx`, `ShopBadge.tsx`, `LocationTag.tsx`
- Bulk: `BulkItemActionBar.tsx`, `MultiItemSummary.tsx`
- Search: `RefSearchInput.tsx`, `BoxSearchInput.tsx`
- Misc: `CreateItemCard.tsx`, `DetailTabBar.tsx`, `QrScanButton.tsx`

**Sub-folders**
- `admin/` — admin-only components (printer config, ERP sync controls)
- `dialog/` — modal dialog components; `presentational/` for display-only dialogs
- `forms/` — reusable form field components
- `item-tabs/` — tab panel components for the item detail view (specs, accessories, history, etc.)
- `relocation/` — item and box relocation flow components (`RelocateItemCard.tsx`, `RelocateBoxCard.tsx`, `ShelfCreateForm.tsx`, `AddItemToBoxDialog.tsx`)

## Relations
- Uses: `../context/` (global state), `../data/` (API calls), `../lib/` (formatting), `../utils/` (filtering)
- Shared types: `../../../../models/`

## Scope
Presentation only. No direct API calls — use `../data/` functions. No business calculations — use `../utils/` or defer to backend.

## Rules
- Component files are named by what they render (noun), not by what triggers them
- Large modal dialogs go in `dialog/` even if they're used by one component
- `item-tabs/` tabs are rendered by `ItemDetail.tsx` via `DetailTabBar.tsx`
- **Simple mode hides by default (opt-out).** With `simple-mode` active on `<body>` (see `lib/simpleMode.ts`), any header nav item or `DetailTabBar` tab is hidden unless explicitly kept — nav items need the `simple-keep` class, tabs need `keepInSimple: true` on their `TabDef`. So a new nav item / tab is invisible in simple mode until you opt it in; only add the marker for surfaces an overwhelmed operator genuinely needs.

## See also
- [docs/detailed/item-detail-layout.md](../../../docs/detailed/item-detail-layout.md) — UX hierarchy and persona-based design rationale
