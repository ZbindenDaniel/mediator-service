# Lazy Loading Strategy for Item, Box, and Activity Lists

To keep list rendering responsive as the catalogue grows, adopt a staged lazy-loading approach that limits the amount of data fetched and rendered at once while preserving current API contracts.

## Backend: Cursor-Paginated Endpoints

1. **Expose cursor parameters** on existing listing endpoints (`/api/items`, `/api/boxes`, `/api/activities`). Accept `cursor` and `limit` query parameters, returning `{ data, nextCursor }`.
2. **Reuse existing SQL ordering** so cursors can rely on `(UpdatedAt, ItemUUID)` or `(CreatedAt, Id)` pairs. Store them as opaque Base64 tokens to avoid leaking implementation details.
3. **Guard against thundering herds** by enforcing an upper bound (e.g., `limit <= 100`) and logging cursor misuse.
4. **Add integration tests** that request multiple pages and verify stable ordering across page boundaries.

## Frontend: Incremental Fetch + Virtualization

1. **Introduce a shared `usePaginatedList` hook** that orchestrates cursor progression, deduplicates records, and exposes `fetchNext()` / `hasNext` state.
2. **Wrap list bodies** in a virtualization layer (e.g., `react-window`) so only visible rows render, drastically cutting DOM weight.
3. **Trigger `fetchNext()`** via intersection observers tied to a sentinel element at the end of each list to support infinite scrolling.
4. **Provide manual controls** ("Load more") as a progressive enhancement for environments where intersection observers are unavailable.
5. **Persist filters and cursors** in the URL query string so navigation between views maintains context without re-fetching from the first page.

## Activities-Specific Notes

- Activities already stream in chronological order; reuse the same cursor primitives but default to smaller page sizes (e.g., 20) to keep timelines snappy.
- When the websocket feed appends new entries, merge them into the existing dataset while respecting the pagination ceiling.

## Operational Considerations

- **Monitoring:** Extend existing logging to capture cursor usage statistics and surface anomalies (e.g., repeated requests for the first page).
- **Backfill:** Provide a one-time script that seeds cursor tokens for legacy clients if needed, using deterministic ordering to avoid duplicates.
- **Fallback:** Maintain the current bulk-fetch logic behind a feature flag so the team can switch back quickly if pagination introduces regressions.

Implementing these pieces incrementally lets the UI stay responsive for large inventories while keeping existing workflows intact.
