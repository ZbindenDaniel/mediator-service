# frontend/src/components/dialog/

Portal-based dialog system — provides imperative `confirm`/`alert`/`confirmThreeWay` calls usable anywhere without prop-drilling.

## Files
- `DialogProvider.tsx` — mounts the dialog portal; wraps the app root
- `dialogService.ts` — imperative API (`confirm(msg)`, `alert(msg)`, `confirmThreeWay(msg)`) — returns Promises
- `index.ts` — re-exports the public API
- `presentational/` — pure display components for dialog variants (confirm, alert, three-way)

## Relations
- `DialogProvider` mounted by: `App.tsx`
- `dialogService` used by: any component needing confirmation without prop callbacks
- See also: [`docs/detailed/item-detail-layout.md`](../../../../docs/detailed/item-detail-layout.md)

## Decisions
- Imperative API over React state so dialogs can be triggered from event handlers and async flows without wiring props through multiple layers
