# frontend/src/components/item-tabs/

Tab panels for the item detail view — each file renders one tab in `ItemDetail.tsx`.

## Files
- `ItemAccessoriesTab.tsx` — accessories and Zerlegen (assembly/spare-parts) workflow
- `ItemAttachmentsTab.tsx` — file attachments and external docs
- `ItemEventsTab.tsx` — event log for this item
- `ItemImagesTab.tsx` — photo gallery
- `ItemInstanceTab.tsx` — instance-level fields (BoxID, condition, notes)
- `ItemKiTab.tsx` — agentic enrichment status and review UI
- `ItemMarkierungTab.tsx` — operator bookmarks/marks
- `ItemReferenceTab.tsx` — reference-level fields (Artikel_Nummer, Langtext, specs)

## Relations
- Mounted by: `frontend/src/components/ItemDetail.tsx`
- Uses: `frontend/src/lib/` (API calls, formatting), `frontend/src/context/` (panel/marks state)
